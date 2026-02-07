
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
  const audioContextRef = useRef<AudioContext | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const capturingRef = useRef(false);
  const wakeLockRef = useRef<any>(null);

  const audioRequestedRef = useRef(false);
  const activeHouseRef = useRef<HouseId>(activeHouse);

  // Helper: Encode raw PCM bytes to Base64
  const encodeBase64 = (bytes: Uint8Array) => {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

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

  useEffect(() => {
    const workerCode = `
      let interval;
      self.onmessage = (e) => {
        if (e.data === 'start') {
          if (interval) clearInterval(interval);
          interval = setInterval(() => self.postMessage('tick'), 4000);
        } else if (e.data === 'stop') clearInterval(interval);
      };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    workerRef.current = new Worker(URL.createObjectURL(blob));
    workerRef.current.onmessage = (e) => { if (e.data === 'tick') syncCycle(); };
    workerRef.current.postMessage('start');
    loadData();

    if (micSynced) startRawPCMStreaming();

    return () => {
      workerRef.current?.terminate();
      releaseWakeLock();
    };
  }, []);

  useEffect(() => { activeHouseRef.current = activeHouse; }, [activeHouse]);

  const syncCycle = async () => {
    const hId = activeHouseRef.current;
    sendHeartbeat(hId);
    const refreshedVideo = await getVideoSession();
    setVideoSession(refreshedVideo);
    audioRequestedRef.current = refreshedVideo.audioRequested === true && refreshedVideo.houseId === hId;

    if (refreshedVideo.lastRequestTime && refreshedVideo.lastRequestTime > lastAcknowledgedRequestRef.current && refreshedVideo.houseId === hId && !capturingRef.current) {
        setShowMissedAlert(true);
    }
    const refreshedGames = await getStoredGames();
    setGames(refreshedGames);
  };

  const startRawPCMStreaming = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext);
      audioContextRef.current = new AudioCtx({ sampleRate: 16000 });
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const scriptProcessor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      
      scriptProcessor.onaudioprocess = (e) => {
        if (!audioRequestedRef.current) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcm16[i] = inputData[i] * 32767;
        }
        
        const base64 = encodeBase64(new Uint8Array(pcm16.buffer));
        sendAudioChunk(base64);
      };
      
      source.connect(scriptProcessor);
      scriptProcessor.connect(audioContextRef.current.destination);
      
      setMicSynced(true);
      localStorage.setItem('fifa_mic_synced', 'true');
    } catch (e) {
      console.error("PCM Capture failed", e);
    }
  };

  const handleAddGame = (tvId: string, amount: number) => {
    const newGame: GameEntry = { id: Math.random().toString(36).substr(2, 9), tvId, timestamp: Date.now(), completed: true, amount };
    setGames(prev => { const next = [...prev, newGame]; saveGames(next); return next; });
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
    if (isCapturing) { requestWakeLock(); frameLoop(); }
    else releaseWakeLock();
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
      if (videoRef.current) videoRef.current.srcObject = stream;
      setIsCapturing(true); 
    } catch (e: any) { setPermissionError("Camera access denied."); }
  };

  const handleStopLocalView = () => {
    setIsCapturing(false);
    if (activeStream.current) { activeStream.current.getTracks().forEach(t => t.stop()); activeStream.current = null; }
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
    <div className="flex flex-col h-[calc(100vh-12rem)] max-w-5xl mx-auto relative p-4">
      {!micSynced && (
        <div className="fixed inset-0 z-[300] bg-black/95 flex items-center justify-center p-6 backdrop-blur-xl">
           <div className="w-full max-w-xs bg-zinc-900 border border-amber-500/30 rounded-[3rem] p-10 text-center">
              <div className="w-16 h-16 bg-amber-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <h2 className="text-xl font-black text-amber-500 uppercase mb-4">Sync Audio</h2>
              <button onClick={startRawPCMStreaming} className="w-full bg-amber-500 py-4 rounded-2xl text-black font-black uppercase">Authenticate</button>
           </div>
        </div>
      )}

      {showMissedAlert && !isCapturing && (
        <div className="fixed top-20 left-4 right-4 z-[150] bg-amber-500 rounded-2xl p-4 shadow-2xl flex items-center justify-between">
           <p className="text-sm font-black text-black">Observation Request Pending</p>
           <button onClick={startVideoFeed} className="bg-black text-amber-500 px-6 py-2 rounded-xl text-[10px] font-black uppercase">Start Feed</button>
        </div>
      )}

      {videoSession.status === 'requested' && videoSession.houseId === activeHouse && !isCapturing && (
        <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center">
          <button onClick={startVideoFeed} className="bg-amber-500 text-black font-black px-12 py-6 rounded-2xl uppercase">Accept Visual Link</button>
        </div>
      )}

      {isCapturing && (
        <div className="fixed inset-0 z-[250] bg-black flex flex-col items-center justify-center">
          <video ref={videoRef} className="opacity-0 w-0 h-0" autoPlay playsInline muted />
          <canvas ref={canvasRef} className="hidden" />
          <div className="text-center animate-pulse">
            <div className="w-32 h-32 border-4 border-amber-500 rounded-full flex items-center justify-center mx-auto mb-10"><div className="w-6 h-6 bg-red-600 rounded-full"></div></div>
            <h1 className="text-4xl font-black text-amber-500 uppercase tracking-widest">Live Floor</h1>
          </div>
        </div>
      )}

      <div className="flex-none flex items-center justify-between mb-6">
        <div className="flex p-1 bg-zinc-900 rounded-2xl">
          {(['house1', 'house2'] as HouseId[]).map((hId) => (
            <button key={hId} onClick={() => setActiveHouse(hId)} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeHouse === hId ? 'bg-amber-500 text-black' : 'text-amber-800'}`}>{HOUSE_NAMES[hId]}</button>
          ))}
        </div>
        <div className="text-right">
          <p className="text-[10px] text-amber-800 font-black uppercase">Yield</p>
          <p className="text-2xl font-black text-amber-500 tracking-tighter">{hStats.revenue.toLocaleString()} <span className="text-xs">ETB</span></p>
        </div>
      </div>

      <div className="flex-grow grid grid-cols-2 gap-4 overflow-y-auto">
        {currentHouseTVs.map((tv) => (
          <div key={tv.id} className="bg-zinc-900 border border-amber-900/20 rounded-[2rem] flex flex-col overflow-hidden">
            <div className="bg-black/60 px-5 py-4 flex justify-between items-center"><h3 className="text-amber-500 font-black text-xs uppercase">{tv.name}</h3></div>
            <div className="flex-grow p-4">
              <button onClick={() => handleAddGame(tv.id, customPrices[tv.id] ?? tv.pricePerGame)} className="w-full h-16 bg-amber-500/5 border-2 border-dashed border-amber-500/40 rounded-2xl text-amber-500 font-black text-3xl">+</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WorkerApp;
