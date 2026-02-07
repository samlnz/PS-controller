
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { TV_CONFIGS, HOUSE_NAMES } from '../constants';
import { GameEntry, HouseId, HouseThresholds, VideoSession, VideoQuality, SessionEvent } from '../types';
import { getStoredGames, getThresholds, saveThresholds, updateVideoSession, getVideoSession, getHouseStatus, recordEvent, getEvents, getAudioStream } from '../services/storage';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, XAxis as RechartsXAxis } from 'recharts';

type Period = 'today' | 'week' | 'month' | 'custom';

const AdminDashboard: React.FC = () => {
  const [games, setGames] = useState<GameEntry[]>([]);
  const [period, setPeriod] = useState<Period>('today');
  const [thresholds, setThresholds] = useState<HouseThresholds>({ house1: 2, house2: 2 });
  const [videoSession, setVideoSession] = useState<VideoSession>({ houseId: null, status: 'idle', quality: 'medium' });
  const [houseStatus, setHouseStatus] = useState<Record<string, boolean>>({ house1: false, house2: false });
  const [isObserving, setIsObserving] = useState(false);
  const [isListening, setIsListening] = useState<HouseId | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(Notification.permission);
  
  const lastOnlineSignalRef = useRef<number>(0);
  const alertedHousesRef = useRef<Record<string, boolean>>({});
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const linkEstablishedRef = useRef<boolean>(false);

  // Helper: Decode Base64 to Uint8Array manually to avoid external deps
  const decodeBase64 = (base64: string) => {
    const binaryString = atob(base64.split(',')[1] || base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  // Helper: Convert PCM Bytes to AudioBuffer and track level
  const pcmToBuffer = (data: Uint8Array, ctx: AudioContext): AudioBuffer => {
    const dataInt16 = new Int16Array(data.buffer);
    const buffer = ctx.createBuffer(1, dataInt16.length, 16000);
    const channelData = buffer.getChannelData(0);
    let maxVal = 0;
    for (let i = 0; i < dataInt16.length; i++) {
      const sample = dataInt16[i] / 32768.0;
      channelData[i] = sample;
      if (Math.abs(sample) > maxVal) maxVal = Math.abs(sample);
    }
    // Simple smoothing for UI meter
    setAudioLevel(prev => prev * 0.7 + maxVal * 0.3);
    return buffer;
  };

  const requestNotificationPermission = async () => {
    const permission = await Notification.requestPermission();
    setNotifPermission(permission);
  };

  const notify = (title: string, body: string, isUrgent: boolean = false) => {
    if (navigator.vibrate) {
      if (isUrgent) navigator.vibrate([200, 100, 200, 100, 200]);
      else navigator.vibrate([100, 50, 100]);
    }

    const soundUrl = isUrgent 
      ? 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'
      : 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';
    
    const audio = new Audio(soundUrl);
    audio.volume = 0.5;
    audio.play().catch(() => {});

    if (Notification.permission === 'granted') {
      try {
        new Notification(title, { body, icon: 'https://cdn-icons-png.flaticon.com/512/621/621914.png' });
      } catch (e) {}
    }
  };

  const refreshData = async () => {
    const [freshGames, freshThresholds, freshVideo, freshStatus] = await Promise.all([
      getStoredGames(),
      getThresholds(),
      getVideoSession(),
      getHouseStatus()
    ]);
    setGames(freshGames);
    setThresholds(freshThresholds);
    setHouseStatus(freshStatus);
    setVideoSession(prev => ({ ...freshVideo, frame: freshVideo.frame || prev.frame }));
    
    if (freshVideo.lastOnlineSignalTime && freshVideo.lastOnlineSignalTime > lastOnlineSignalRef.current) {
      if (lastOnlineSignalRef.current !== 0) {
        const houseName = freshVideo.houseId ? HOUSE_NAMES[freshVideo.houseId] : 'A Counter';
        notify("Counter Online", `${houseName} is ready! You can resend your video request now.`, true);
      }
      lastOnlineSignalRef.current = freshVideo.lastOnlineSignalTime;
    }

    if (freshVideo.status !== 'idle' && !isObserving) {
      setIsObserving(true);
    }
  };

  // Raw PCM Audio Polling
  useEffect(() => {
    let audioInterval: number;
    if (isListening) {
      audioInterval = window.setInterval(async () => {
        const streamData = await getAudioStream();
        if (streamData.chunks && streamData.chunks.length > 0) {
          if (!linkEstablishedRef.current) {
            linkEstablishedRef.current = true;
            notify("Link Active", `Microphone from ${HOUSE_NAMES[isListening]} is streaming.`, true);
          }
          playRawPCMChunks(streamData.chunks);
        }
      }, 750); 
    } else {
      nextStartTimeRef.current = 0;
      linkEstablishedRef.current = false;
      setAudioLevel(0);
    }
    return () => clearInterval(audioInterval);
  }, [isListening]);

  const playRawPCMChunks = async (chunks: string[]) => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;

    for (const chunk of chunks) {
      try {
        const bytes = decodeBase64(chunk);
        const buffer = pcmToBuffer(bytes, ctx);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(gainNodeRef.current!);
        
        const startTime = Math.max(nextStartTimeRef.current, ctx.currentTime + 0.05);
        source.start(startTime);
        nextStartTimeRef.current = startTime + buffer.duration;
      } catch (e) {
        console.error("PCM Decryption Error", e);
      }
    }
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 3000); 
    return () => clearInterval(interval);
  }, [isObserving]);

  useEffect(() => {
    let frameInterval: number;
    if (isObserving) {
      frameInterval = window.setInterval(async () => {
        const freshVideo = await getVideoSession();
        setVideoSession(prev => ({ ...freshVideo, frame: freshVideo.frame || prev.frame }));
        if (freshVideo.status === 'idle') setIsObserving(false);
      }, 150); 
    }
    return () => clearInterval(frameInterval);
  }, [isObserving]);

  const handleRequestVideo = async (houseId: HouseId) => {
    const initialSession: VideoSession = { houseId, status: 'requested', quality: videoSession.quality || 'medium' };
    setVideoSession(initialSession);
    await updateVideoSession(initialSession);
    setIsObserving(true);
  };

  const handleToggleAudio = async (houseId: HouseId) => {
    if (isListening === houseId) {
      setIsListening(null);
      await updateVideoSession({ audioRequested: false });
      if (audioContextRef.current) audioContextRef.current.suspend();
    } else {
      setIsListening(houseId);
      linkEstablishedRef.current = false;
      
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioCtx({ sampleRate: 16000 });
        gainNodeRef.current = audioContextRef.current.createGain();
        gainNodeRef.current.gain.value = 2.0; // Boost for mobile speakers
        gainNodeRef.current.connect(audioContextRef.current.destination);
      }
      
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      nextStartTimeRef.current = audioContextRef.current.currentTime;
      await updateVideoSession({ audioRequested: true, houseId });
    }
  };

  const handleUpdateQuality = async (quality: VideoQuality) => {
    setVideoSession(prev => ({ ...prev, quality }));
    await updateVideoSession({ quality });
  };

  const handleEndVideo = async () => {
    await updateVideoSession({ status: 'idle', frame: undefined });
    setIsObserving(false);
  };

  const updateThreshold = async (houseId: HouseId, value: number) => {
    const next = { ...thresholds, [houseId]: value };
    setThresholds(next);
    await saveThresholds(next);
  };

  const hourlyStats = useMemo(() => {
    const oneHourAgo = Date.now() - 3600000;
    const h1 = games.filter(g => g.timestamp >= oneHourAgo && !g.isSeparator && TV_CONFIGS.find(tv => tv.id === g.tvId)?.houseId === 'house1').length;
    const h2 = games.filter(g => g.timestamp >= oneHourAgo && !g.isSeparator && TV_CONFIGS.find(tv => tv.id === g.tvId)?.houseId === 'house2').length;
    
    ['house1', 'house2'].forEach((hId) => {
      const val = hId === 'house1' ? h1 : h2;
      const thresh = thresholds[hId as HouseId];
      if (val < thresh && !alertedHousesRef.current[hId]) {
        notify("Low Yield Alert", `${HOUSE_NAMES[hId]} yield is below threshold!`);
        recordEvent('yield_alert', hId);
        alertedHousesRef.current[hId] = true;
      } else if (val >= thresh) {
        alertedHousesRef.current[hId] = false;
      }
    });

    return { house1: h1, house2: h2 };
  }, [games, thresholds]);

  const stats = useMemo(() => {
    const now = new Date();
    const getStartOfBusinessDay = () => {
      const today7AM = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 7, 0, 0, 0);
      if (now.getHours() < 7) today7AM.setDate(today7AM.getDate() - 1);
      return today7AM.getTime();
    };
    const startOfBusinessDay = getStartOfBusinessDay();
    const filtered = games.filter(g => {
      if (!g.completed) return false;
      if (period === 'today') return g.timestamp >= startOfBusinessDay;
      if (period === 'week') return g.timestamp >= (now.getTime() - (7 * 24 * 60 * 60 * 1000));
      if (period === 'month') return g.timestamp >= new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      return true;
    });
    const h1 = filtered.filter(g => TV_CONFIGS.find(tv => tv.id === g.tvId)?.houseId === 'house1');
    const h2 = filtered.filter(g => TV_CONFIGS.find(tv => tv.id === g.tvId)?.houseId === 'house2');
    return {
      house1: { games: h1.filter(g => !g.isSeparator).length, revenue: h1.reduce((a, c) => a + c.amount, 0) },
      house2: { games: h2.filter(g => !g.isSeparator).length, revenue: h2.reduce((a, c) => a + c.amount, 0) },
      tvPerformance: TV_CONFIGS.map(tv => ({ 
        name: tv.name, 
        revenue: filtered.filter(g => g.tvId === tv.id).reduce((a, c) => a + c.amount, 0) 
      }))
    };
  }, [games, period]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in duration-700 pb-12">
      {isObserving && (
        <div className="fixed inset-0 z-[200] bg-black/98 flex flex-col items-center justify-center p-4 backdrop-blur-2xl">
          <div className="w-full max-w-[420px] aspect-[9/16] bg-zinc-900 rounded-[3.5rem] border-4 border-amber-500 overflow-hidden relative shadow-2xl shadow-amber-500/30">
            {videoSession.frame ? (
              <img src={videoSession.frame} className="w-full h-full object-cover" alt="Live Feed" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
                  <p className="text-amber-500 font-black uppercase tracking-widest text-[10px]">Syncing Encrypted Stream...</p>
                </div>
              </div>
            )}
            <div className="absolute top-10 left-0 right-0 px-8 flex justify-between items-start">
              <div className="flex items-center gap-3 bg-black/60 px-4 py-2 rounded-full backdrop-blur-md border border-amber-500/30">
                <span className={`w-2.5 h-2.5 rounded-full animate-pulse ${videoSession.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                <span className="text-[10px] text-amber-500 font-black uppercase tracking-widest">
                  {videoSession.status === 'active' ? 'LIVE' : 'SYNCING'} : {HOUSE_NAMES[videoSession.houseId || '']}
                </span>
              </div>
            </div>
            <div className="absolute bottom-12 left-0 right-0 px-8 flex flex-col gap-4">
              <div className="flex bg-black/70 p-1.5 rounded-2xl border border-amber-500/20">
                {(['low', 'medium', 'high'] as VideoQuality[]).map((q) => (
                  <button key={q} onClick={() => handleUpdateQuality(q)} className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${videoSession.quality === q ? 'bg-amber-500 text-black' : 'text-amber-500 hover:bg-amber-500/10'}`}>{q}</button>
                ))}
              </div>
            </div>
          </div>
          <button onClick={handleEndVideo} className="mt-10 w-full max-w-[320px] py-5 bg-amber-500 text-black font-black rounded-2xl uppercase text-xs">End Session</button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-col gap-1">
           <div className="flex items-center gap-3">
             <h2 className="text-3xl font-black text-amber-500 uppercase tracking-tighter">Owner Dashboard</h2>
             {notifPermission !== 'granted' && (
               <button onClick={requestNotificationPermission} className="bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[8px] font-black px-3 py-1 rounded-full uppercase animate-pulse">Enable Alerts</button>
             )}
           </div>
           <p className="text-amber-800 text-[10px] font-bold uppercase tracking-[0.2em]">Addis Ababa Premium Network</p>
        </div>
        <div className="flex bg-zinc-900 p-1 rounded-xl">
          {(['today', 'week', 'month'] as Period[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${period === p ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' : 'text-amber-800'}`}>{p}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {(['house1', 'house2'] as HouseId[]).map((hId) => {
          const isUnderThreshold = hourlyStats[hId] < thresholds[hId];
          const isOnline = houseStatus[hId];
          const activeMic = isListening === hId;
          return (
            <div key={hId} className={`p-8 bg-zinc-900 border-2 ${isUnderThreshold ? 'border-red-600/50' : 'border-amber-900/20'} rounded-[2.5rem] relative overflow-hidden transition-all duration-500`}>
              <div className="flex justify-between items-start mb-6">
                <div>
                  <p className="text-amber-700 text-[10px] font-black uppercase mb-1">{HOUSE_NAMES[hId]}</p>
                  <h3 className="text-4xl font-black text-amber-500 tracking-tighter">{stats[hId].revenue.toLocaleString()} <span className="text-xs uppercase ml-1">ETB</span></h3>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleToggleAudio(hId)} 
                      className={`p-4 rounded-2xl shadow-lg transition-all active:scale-90 flex items-center justify-center relative overflow-hidden ${activeMic ? 'bg-red-500 text-white' : 'bg-zinc-800 text-amber-500'}`}
                    >
                      {activeMic && (
                        <div className="absolute inset-0 flex items-end justify-center pb-2 pointer-events-none">
                          <div className="flex items-end gap-0.5 h-10 w-full px-2">
                            <div className="flex-1 bg-white/40 rounded-full transition-all duration-100" style={{ height: `${Math.min(100, audioLevel * 200)}%` }}></div>
                            <div className="flex-1 bg-white/60 rounded-full transition-all duration-75" style={{ height: `${Math.min(100, audioLevel * 300)}%` }}></div>
                            <div className="flex-1 bg-white/40 rounded-full transition-all duration-100" style={{ height: `${Math.min(100, audioLevel * 200)}%` }}></div>
                          </div>
                        </div>
                      )}
                      <svg className={`w-5 h-5 relative z-10 ${activeMic ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => handleRequestVideo(hId)} 
                      className={`${isUnderThreshold ? 'bg-red-600' : 'bg-amber-500'} text-black p-4 rounded-2xl active:scale-90 transition-all flex items-center justify-center`}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-zinc-700'}`}></span>
                    <span className={`text-[8px] font-black uppercase tracking-widest ${isOnline ? 'text-green-500' : 'text-zinc-600'}`}>{isOnline ? 'Online' : 'Offline'}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div className="bg-black/40 p-4 rounded-2xl border border-amber-900/10">
                   <p className="text-[9px] text-amber-700 font-black uppercase mb-1">Hourly Volume</p>
                   <p className={`text-xl font-black ${isUnderThreshold ? 'text-red-500' : 'text-amber-500'}`}>{hourlyStats[hId]} <span className="text-[10px]">GAMES</span></p>
                 </div>
                 <div className="bg-black/40 p-4 rounded-2xl border border-amber-900/10">
                   <p className="text-[9px] text-amber-700 font-black uppercase mb-1">Alert Set At</p>
                   <input type="number" value={thresholds[hId]} onChange={(e) => updateThreshold(hId, parseInt(e.target.value) || 0)} className="bg-transparent text-xl font-black text-amber-500 w-12 focus:outline-none" />
                 </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-zinc-900 border border-amber-900/20 p-8 rounded-[2.5rem] h-96">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={stats.tvPerformance}>
            <RechartsXAxis dataKey="name" stroke="#78350f" fontSize={10} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#451a03', color: '#f59e0b', borderRadius: '12px' }} />
            <Bar dataKey="revenue" radius={[10, 10, 0, 0]}>
              {stats.tvPerformance.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#f59e0b' : '#b45309'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default AdminDashboard;
