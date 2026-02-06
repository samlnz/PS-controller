
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { TV_CONFIGS, HOUSE_NAMES } from '../constants';
import { GameEntry, HouseId, HouseThresholds, VideoSession } from '../types';
import { getStoredGames, clearAllData, getThresholds, saveThresholds, updateVideoSession, getVideoSession } from '../services/storage';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';

type Period = 'today' | 'week' | 'month' | 'custom';

const AdminDashboard: React.FC = () => {
  const [games, setGames] = useState<GameEntry[]>([]);
  const [period, setPeriod] = useState<Period>('today');
  const [thresholds, setThresholds] = useState<HouseThresholds>({ house1: 2, house2: 2 });
  const [videoSession, setVideoSession] = useState<VideoSession>({ houseId: null, status: 'idle' });
  const [isObserving, setIsObserving] = useState(false);
  const [hideOwnerFace, setHideOwnerFace] = useState(true);

  const ownerVideoRef = useRef<HTMLVideoElement>(null);

  // Standard data refresh for general stats
  const refreshData = async () => {
    const [freshGames, freshThresholds, freshVideo] = await Promise.all([
      getStoredGames(),
      getThresholds(),
      getVideoSession()
    ]);
    setGames(freshGames);
    setThresholds(freshThresholds);
    
    // Maintain local state if observing, otherwise sync with server status
    if (freshVideo.status !== 'idle' && !isObserving) {
      setIsObserving(true);
    }
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 5000);
    return () => clearInterval(interval);
  }, [isObserving]);

  // High-frequency frame polling only when active
  useEffect(() => {
    let frameInterval: number;
    if (isObserving) {
      frameInterval = window.setInterval(async () => {
        const freshVideo = await getVideoSession();
        setVideoSession(prev => ({
          ...freshVideo,
          frame: freshVideo.frame || prev.frame // Preserve last frame if current fetch is empty
        }));
        if (freshVideo.status === 'idle') {
          setIsObserving(false);
        }
      }, 200);
    }
    return () => clearInterval(frameInterval);
  }, [isObserving]);

  // Handle Owner Presence Camera
  useEffect(() => {
    let stream: MediaStream | null = null;
    if (isObserving) {
      navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        .then(s => {
          stream = s;
          if (ownerVideoRef.current) ownerVideoRef.current.srcObject = s;
        })
        .catch(err => console.warn("Owner camera inactive:", err));
    }
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [isObserving]);

  const handleRequestVideo = async (houseId: HouseId) => {
    await updateVideoSession({ houseId, status: 'requested' });
    setIsObserving(true);
  };

  const handleEndVideo = async () => {
    await updateVideoSession({ houseId: null, status: 'idle', frame: undefined });
    setIsObserving(false);
  };

  const hourlyStats = useMemo(() => {
    const oneHourAgo = Date.now() - 3600000;
    const h1 = games.filter(g => g.timestamp >= oneHourAgo && !g.isSeparator && TV_CONFIGS.find(tv => tv.id === g.tvId)?.houseId === 'house1').length;
    const h2 = games.filter(g => g.timestamp >= oneHourAgo && !g.isSeparator && TV_CONFIGS.find(tv => tv.id === g.tvId)?.houseId === 'house2').length;
    return { house1: h1, house2: h2 };
  }, [games]);

  const recentActivity = useMemo(() => {
    return [...games]
      .filter(g => !g.isSeparator)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 15);
  }, [games]);

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

  const updateThreshold = async (houseId: HouseId, value: number) => {
    const nextThresholds = { ...thresholds, [houseId]: value };
    setThresholds(nextThresholds);
    await saveThresholds(nextThresholds);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in duration-700 pb-12">
      {/* Observation Overlay */}
      {isObserving && (
        <div className="fixed inset-0 z-[200] bg-black/95 flex flex-col items-center justify-center p-4 sm:p-8 backdrop-blur-xl animate-in zoom-in duration-300">
          <div className="w-full max-w-4xl aspect-video bg-zinc-900 rounded-[2rem] sm:rounded-[3rem] border-4 border-amber-500 overflow-hidden relative shadow-2xl shadow-amber-500/20">
            {videoSession.frame ? (
              <img src={videoSession.frame} className="w-full h-full object-cover animate-in fade-in duration-500" alt="Live Feed" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-amber-500 font-black uppercase tracking-widest text-[10px]">Syncing Encrypted Stream...</p>
                </div>
              </div>
            )}
            
            {/* Owner Presence Camera */}
            <div className="absolute bottom-6 left-6 w-32 h-44 sm:w-40 sm:h-52 bg-black rounded-2xl border-2 border-amber-500/50 overflow-hidden shadow-2xl transition-all duration-500">
              <video ref={ownerVideoRef} autoPlay muted playsInline className={`w-full h-full object-cover transition-all duration-700 ${hideOwnerFace ? 'blur-[40px] grayscale brightness-50' : ''}`} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none"></div>
              <div className="absolute bottom-2 left-0 right-0 text-center">
                 <span className="text-[8px] text-amber-500 font-black uppercase tracking-[0.2em]">{hideOwnerFace ? 'Identity Hidden' : 'Presence Visible'}</span>
              </div>
              <button 
                onClick={() => setHideOwnerFace(!hideOwnerFace)}
                className="absolute top-2 right-2 bg-black/60 p-1.5 rounded-lg border border-amber-500/30 text-[8px] text-amber-500 font-black uppercase hover:bg-amber-500 hover:text-black transition-colors"
              >
                {hideOwnerFace ? 'Reveal Face' : 'Hide Face'}
              </button>
            </div>

            <div className="absolute top-8 left-8 flex items-center gap-3 bg-black/60 px-4 py-2 rounded-full backdrop-blur-md border border-amber-500/30">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
              <span className="text-[10px] text-amber-500 font-black uppercase tracking-widest">Live Link: {HOUSE_NAMES[videoSession.houseId || '']}</span>
            </div>
          </div>
          <button 
            onClick={handleEndVideo} 
            className="mt-8 px-12 py-4 bg-amber-500 hover:bg-amber-400 text-black font-black rounded-2xl uppercase tracking-[0.3em] shadow-xl shadow-amber-500/20 active:scale-95 transition-all"
          >
            Terminate Session
          </button>
        </div>
      )}

      {/* Dashboard Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
           <h2 className="text-3xl font-black text-amber-500 uppercase tracking-tighter">Owner Dashboard</h2>
           <p className="text-amber-800 text-[10px] font-bold uppercase tracking-[0.2em]">Addis Ababa Premium Network</p>
        </div>
        <div className="flex bg-zinc-900 p-1 rounded-xl border border-amber-900/20">
          {(['today', 'week', 'month'] as Period[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${period === p ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' : 'text-amber-800'}`}>{p}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {(['house1', 'house2'] as HouseId[]).map((hId) => {
          const isUnderThreshold = hourlyStats[hId] < thresholds[hId];
          return (
            <div key={hId} className={`p-8 bg-zinc-900 border-2 ${isUnderThreshold ? 'border-red-600/50 shadow-[0_0_20px_rgba(220,38,38,0.1)]' : 'border-amber-900/20'} rounded-[2.5rem] relative overflow-hidden group transition-all duration-500`}>
              {isUnderThreshold && (
                <div className="absolute top-0 right-0 bg-red-600 px-4 py-1 rounded-bl-2xl flex items-center gap-2 animate-pulse z-20">
                   <div className="w-2 h-2 bg-white rounded-full"></div>
                   <span className="text-[8px] text-white font-black uppercase tracking-widest">Low Yield Alert</span>
                </div>
              )}
              <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-500/5 blur-3xl rounded-full"></div>
              <div className="flex justify-between items-start mb-6 relative z-10">
                <div>
                  <p className="text-amber-700 text-[10px] font-black uppercase tracking-widest mb-1">{HOUSE_NAMES[hId]}</p>
                  <h3 className="text-4xl font-black text-amber-500 tracking-tighter">{stats[hId].revenue.toLocaleString()} <span className="text-xs uppercase ml-1">ETB</span></h3>
                </div>
                <button 
                  onClick={() => handleRequestVideo(hId)} 
                  className={`${isUnderThreshold ? 'bg-red-600 hover:bg-red-500' : 'bg-amber-500 hover:bg-amber-400'} text-black p-4 rounded-2xl shadow-lg transition-all active:scale-90 flex items-center justify-center`}
                  title="Request Visual Link"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4 relative z-10">
                 <div className={`bg-black/40 p-4 rounded-2xl border ${isUnderThreshold ? 'border-red-900/40' : 'border-amber-900/10'}`}>
                   <p className="text-[9px] text-amber-700 font-black uppercase mb-1">Hourly Volume</p>
                   <p className={`text-xl font-black ${isUnderThreshold ? 'text-red-500' : 'text-amber-500'}`}>{hourlyStats[hId]} <span className="text-[10px]">GAMES</span></p>
                 </div>
                 <div className="bg-black/40 p-4 rounded-2xl border border-amber-900/10">
                   <p className="text-[9px] text-amber-700 font-black uppercase mb-1">Alert Set At</p>
                   <div className="flex items-center gap-2">
                     <input 
                       type="number"
                       value={thresholds[hId]}
                       onChange={(e) => updateThreshold(hId, parseInt(e.target.value) || 0)}
                       className="bg-transparent text-xl font-black text-amber-500 w-12 focus:outline-none"
                     />
                     <span className="text-[8px] text-amber-900 font-black uppercase tracking-widest">Min/HR</span>
                   </div>
                 </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Grouped Detailed Activity Log */}
      <div className="bg-zinc-900 border border-amber-900/20 p-8 rounded-[2.5rem]">
        <div className="flex justify-between items-center mb-8">
           <h4 className="text-xs font-black text-amber-600 uppercase tracking-widest">Recent Detailed Transactions</h4>
           <span className="text-[8px] text-amber-800 font-black uppercase">Live Updates Active</span>
        </div>
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
          {recentActivity.map(game => {
            const tv = TV_CONFIGS.find(t => t.id === game.tvId);
            return (
              <div key={game.id} className="flex justify-between items-center p-4 bg-black/40 border border-amber-900/10 rounded-2xl hover:border-amber-500/30 transition-colors">
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center text-amber-500 font-black text-sm">
                    {tv?.name.split(' ')[1]}
                  </div>
                  <div>
                    <p className="text-xs text-amber-100 font-black uppercase tracking-tight">{tv?.name}</p>
                    <p className="text-[8px] text-amber-700 font-bold uppercase tracking-widest">{HOUSE_NAMES[tv?.houseId || '']}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-amber-500 tabular-nums">
                    {new Date(game.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                  </p>
                  <p className="text-[9px] text-green-600 font-black uppercase tracking-widest">+{game.amount} ETB</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-zinc-900 border border-amber-900/20 p-8 rounded-[2.5rem] h-96">
        <h4 className="text-xs font-black text-amber-600 uppercase tracking-widest mb-8 text-center">Revenue distribution by Asset</h4>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={stats.tvPerformance} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <XAxis dataKey="name" stroke="#78350f" fontSize={10} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#451a03', color: '#f59e0b', borderRadius: '12px', fontSize: '10px' }} />
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
