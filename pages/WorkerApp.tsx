
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { TV_CONFIGS, HOUSE_NAMES } from '../constants';
import { GameEntry, HouseId, VideoSession } from '../types';
import { getStoredGames, saveGames, getTVPrices, saveTVPrices, getVideoSession, updateVideoSession, sendVideoFrame } from '../services/storage';

const WorkerApp: React.FC = () => {
  const [games, setGames] = useState<GameEntry[]>([]);
  const [activeHouse, setActiveHouse] = useState<HouseId>('house1');
  const [customPrices, setCustomPrices] = useState<Record<string, number>>({});
  const [videoRequest, setVideoRequest] = useState<VideoSession>({ houseId: null, status: 'idle' });
  const [isCapturing, setIsCapturing] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captureInterval = useRef<number | null>(null);

  const loadData = async () => {
    const [fetchedGames, fetchedPrices, fetchedVideo] = await Promise.all([
      getStoredGames(),
      getTVPrices(),
      getVideoSession()
    ]);
    setGames(fetchedGames);
    setCustomPrices(fetchedPrices);
    setVideoRequest(fetchedVideo);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(async () => {
      const refreshedGames = await getStoredGames();
      const refreshedVideo = await getVideoSession();
      setGames(refreshedGames);
      setVideoRequest(refreshedVideo);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const startVideoFeed = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 360 } }, 
        audio: false 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Wait for video to be ready
        videoRef.current.onloadedmetadata = async () => {
          await videoRef.current?.play();
          setIsCapturing(true);
          await updateVideoSession({ status: 'active' });

          captureInterval.current = window.setInterval(() => {
            if (canvasRef.current && videoRef.current && videoRef.current.readyState === 4) {
              const ctx = canvasRef.current.getContext('2d');
              if (ctx) {
                canvasRef.current.width = 480;
                canvasRef.current.height = 360;
                ctx.drawImage(videoRef.current, 0, 0, 480, 360);
                const frame = canvasRef.current.toDataURL('image/jpeg', 0.4); // slightly lower quality for faster transport
                sendVideoFrame(frame);
              }
            }
          }, 250); // 4 FPS transmission
        };
      }
    } catch (e) {
      console.error("Camera Error:", e);
      alert("Camera Access Required for Observation Mode.");
      await updateVideoSession({ status: 'idle', houseId: null });
    }
  };

  const handleStopVideo = async () => {
    if (captureInterval.current) {
      clearInterval(captureInterval.current);
      captureInterval.current = null;
    }
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setIsCapturing(false);
    await updateVideoSession({ status: 'idle', houseId: null, frame: undefined });
  };

  // Sync state if remote session is terminated
  useEffect(() => {
    if (videoRequest.status === 'idle' && isCapturing) {
      handleStopVideo();
    }
  }, [videoRequest.status]);

  const businessDayStart = useMemo(() => {
    const now = new Date();
    const today7AM = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 7, 0, 0, 0);
    if (now.getHours() < 7) today7AM.setDate(today7AM.getDate() - 1);
    return today7AM.getTime();
  }, [games]);

  const currentHouseTVs = TV_CONFIGS.filter(tv => tv.houseId === activeHouse);
  const stats = useMemo(() => {
    const hGames = games.filter(g => g.timestamp >= businessDayStart && TV_CONFIGS.find(tv => tv.id === g.tvId)?.houseId === activeHouse);
    return { revenue: hGames.reduce((a, c) => a + c.amount, 0) };
  }, [games, activeHouse, businessDayStart]);

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] max-w-5xl mx-auto relative">
      {/* Video Request Popup */}
      {videoRequest.status === 'requested' && videoRequest.houseId === activeHouse && (
        <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300">
          <div className="w-full max-w-sm bg-zinc-950 border border-amber-500 rounded-[2.5rem] p-8 text-center shadow-2xl shadow-amber-500/10">
            <div className="w-20 h-20 bg-amber-500 rounded-3xl flex items-center justify-center mx-auto mb-6 animate-bounce">
               <svg className="w-10 h-10 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-amber-500 uppercase tracking-tighter mb-2">Video Request</h2>
            <p className="text-amber-700 text-[10px] font-black uppercase tracking-widest mb-8">The Owner has requested a live status check for {HOUSE_NAMES[activeHouse]}</p>
            <button 
              onClick={startVideoFeed}
              className="w-full bg-amber-500 text-black font-black py-4 rounded-2xl uppercase tracking-widest shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
            >
              Start Stream
            </button>
          </div>
        </div>
      )}

      {/* Observation Mode View */}
      {isCapturing && (
        <div className="fixed inset-0 z-[250] bg-black flex flex-col items-center justify-center animate-in zoom-in duration-500">
          <video ref={videoRef} className="hidden" muted playsInline />
          <canvas ref={canvasRef} className="hidden" />
          <div className="relative flex flex-col items-center">
            <div className="w-32 h-32 border-4 border-amber-500 rounded-full flex items-center justify-center animate-pulse mb-8">
               <div className="w-24 h-24 border-2 border-amber-500/40 rounded-full flex items-center justify-center">
                  <div className="w-4 h-4 bg-amber-500 rounded-full shadow-[0_0_20px_#f59e0b]"></div>
               </div>
            </div>
            <h1 className="text-4xl font-black text-amber-500 uppercase tracking-[0.5em] text-center mb-4 drop-shadow-[0_0_10px_rgba(217,119,6,0.3)]">
              Admin Observing
            </h1>
            <p className="text-amber-800 text-[10px] font-black uppercase tracking-[1em] animate-pulse">Encrypted Live Link Active</p>
          </div>
          <button 
            onClick={handleStopVideo}
            className="absolute bottom-12 px-8 py-3 bg-zinc-900 border border-amber-900 text-amber-900 font-black text-[10px] uppercase tracking-widest rounded-xl hover:text-amber-500 hover:border-amber-500 transition-all"
          >
            End Session
          </button>
        </div>
      )}

      {/* Sub-Header */}
      <div className="flex-none flex items-center justify-between mb-4 px-2">
        <div className="flex p-1 bg-zinc-900 border border-amber-900/30 rounded-2xl">
          {(['house1', 'house2'] as HouseId[]).map((hId) => (
            <button key={hId} onClick={() => setActiveHouse(hId)} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeHouse === hId ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' : 'text-amber-800'}`}>
              {HOUSE_NAMES[hId]}
            </button>
          ))}
        </div>
        <div className="text-right">
          <p className="text-[10px] text-amber-700 font-black uppercase">Yield (from 7 AM)</p>
          <p className="text-xl font-black text-amber-500">{stats.revenue} <span className="text-[10px]">ETB</span></p>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-grow grid grid-cols-2 gap-3 h-full">
        {currentHouseTVs.map((tv) => {
          const tvEntries = games.filter(g => g.tvId === tv.id && g.timestamp >= businessDayStart);
          const currentPrice = customPrices[tv.id] ?? tv.pricePerGame;
          let counter = 0;

          return (
            <div key={tv.id} className="bg-zinc-900/40 border border-amber-900/20 rounded-3xl flex flex-col overflow-hidden">
              <div className="bg-black/60 px-4 py-3 border-b border-amber-900/20 flex justify-between items-center">
                <h3 className="text-amber-500 font-black text-sm uppercase">{tv.name}</h3>
                <span className="text-[10px] text-amber-600 font-black">{tvEntries.filter(e => !e.isSeparator).length} G</span>
              </div>
              <div className="flex-grow p-4 overflow-y-auto">
                <div className="grid grid-cols-3 gap-3">
                  {tvEntries.map((e) => {
                    if (e.isSeparator) { counter = 0; return <div key={e.id} className="col-span-3 h-[1px] bg-amber-900/20 my-1" /> }
                    counter++;
                    return (
                      <div key={e.id} className="aspect-square bg-amber-500 rounded-2xl flex items-center justify-center text-black font-black text-lg">
                        {counter}
                      </div>
                    );
                  })}
                  <div className="col-span-3 grid grid-cols-2 gap-3 mt-1">
                    <button onClick={async () => {
                      const updated = [...games, { id: Math.random().toString(36).substr(2, 9), tvId: tv.id, timestamp: Date.now(), completed: true, amount: currentPrice }];
                      setGames(updated);
                      await saveGames(updated);
                    }} className="h-16 border-2 border-dashed border-amber-900/40 rounded-2xl text-amber-900/60 font-black text-2xl hover:border-amber-500 hover:text-amber-500">+</button>
                    <button onClick={async () => {
                      const updated = [...games, { id: Math.random().toString(36).substr(2, 9), tvId: tv.id, timestamp: Date.now(), completed: true, amount: 0, isSeparator: true }];
                      setGames(updated);
                      await saveGames(updated);
                    }} className="h-16 border-2 border-dashed border-amber-900/20 rounded-2xl flex flex-col items-center justify-center">
                      <span className="text-[8px] font-black text-amber-900/40 uppercase">Reset</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex-none py-3 text-center">
        <p className="text-[8px] text-amber-900 font-black uppercase tracking-[0.5em]">Encrypted Session Active</p>
      </div>
    </div>
  );
};

export default WorkerApp;
