
import React, { useState, useEffect, useMemo } from 'react';
import { TV_CONFIGS, HOUSE_NAMES } from '../constants';
import { GameEntry, HouseId, HouseThresholds, VideoSession } from '../types';
import { getStoredGames, clearAllData, getThresholds, saveThresholds, updateVideoSession, getVideoSession } from '../services/storage';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';

type Period = 'today' | 'week' | 'month' | 'custom';

const AdminDashboard: React.FC = () => {
  const [games, setGames] = useState<GameEntry[]>([]);
  const [lastUpdate, setLastUpdate] = useState<string>(new Date().toLocaleTimeString());
  const [period, setPeriod] = useState<Period>('today');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  
  const [thresholds, setThresholds] = useState<HouseThresholds>({ house1: 2, house2: 2 });
  const [videoSession, setVideoSession] = useState<VideoSession>({ houseId: null, status: 'idle' });
  const [isObserving, setIsObserving] = useState(false);

  const refreshData = async () => {
    const [freshGames, freshThresholds, freshVideo] = await Promise.all([
      getStoredGames(),
      getThresholds(),
      getVideoSession()
    ]);
    setGames(freshGames);
    setThresholds(freshThresholds);
    setVideoSession(freshVideo);
    setLastUpdate(new Date().toLocaleTimeString());
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 3000);
    return () => clearInterval(interval);
  }, []);

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
    const house1Recent = games.filter(g => 
      g.timestamp >= oneHourAgo && 
      !g.isSeparator && 
      TV_CONFIGS.find(tv => tv.id === g.tvId)?.houseId === 'house1'
    ).length;
    const house2Recent = games.filter(g => 
      g.timestamp >= oneHourAgo && 
      !g.isSeparator && 
      TV_CONFIGS.find(tv => tv.id === g.tvId)?.houseId === 'house2'
    ).length;

    return { house1: house1Recent, house2: house2Recent };
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
      if (period === 'custom') {
        const targetDate = new Date(selectedDate);
        const start = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 7, 0, 0, 0).getTime();
        return g.timestamp >= start && g.timestamp < (start + 86400000);
      }
      return true;
    });

    const totalRev = filtered.reduce((acc, g) => acc + g.amount, 0);
    const h1 = filtered.filter(g => TV_CONFIGS.find(tv => tv.id === g.tvId)?.houseId === 'house1');
    const h2 = filtered.filter(g => TV_CONFIGS.find(tv => tv.id === g.tvId)?.houseId === 'house2');

    return {
      totalGames: filtered.filter(g => !g.isSeparator).length,
      totalRevenue: totalRev,
      house1: { games: h1.filter(g => !g.isSeparator).length, revenue: h1.reduce((a, c) => a + c.amount, 0) },
      house2: { games: h2.filter(g => !g.isSeparator).length, revenue: h2.reduce((a, c) => a + c.amount, 0) },
      tvPerformance: TV_CONFIGS.map(tv => {
        const tvList = filtered.filter(g => g.tvId === tv.id);
        const rev = tvList.reduce((a, c) => a + c.amount, 0);
        return { name: tv.name, revenue: rev };
      })
    };
  }, [games, period, selectedDate]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in duration-700 pb-12">
      {/* Observation Overlay */}
      {isObserving && (
        <div className="fixed inset-0 z-[200] bg-black/95 flex flex-col items-center justify-center p-8 backdrop-blur-xl animate-in zoom-in duration-300">
          <div className="w-full max-w-4xl aspect-video bg-zinc-900 rounded-[3rem] border-4 border-amber-500 overflow-hidden relative shadow-2xl shadow-amber-500/20">
            {videoSession.frame ? (
              <img src={videoSession.frame} className="w-full h-full object-cover" alt="Live Feed" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-amber-500 font-black uppercase tracking-widest text-xs">Awaiting encrypted feed...</p>
                </div>
              </div>
            )}
            <div className="absolute top-8 left-8 flex items-center gap-3 bg-black/60 px-4 py-2 rounded-full backdrop-blur-md border border-amber-500/30">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
              <span className="text-[10px] text-amber-500 font-black uppercase tracking-widest">Live: {HOUSE_NAMES[videoSession.houseId || '']}</span>
            </div>
            <div className="absolute bottom-8 right-8 bg-black/60 p-4 rounded-2xl backdrop-blur-md border border-amber-500/30 text-right">
              <p className="text-[8px] text-amber-500/50 font-black uppercase mb-1">Gemini AI Status</p>
              <p className="text-[10px] text-amber-500 font-black uppercase">Analyzing activity levels...</p>
            </div>
          </div>
          <button 
            onClick={handleEndVideo}
            className="mt-8 px-12 py-4 bg-amber-500 text-black font-black rounded-2xl uppercase tracking-[0.3em] shadow-xl hover:bg-amber-400 transition-all active:scale-95"
          >
            Terminate Feed
          </button>
        </div>
      )}

      {/* Header & Controls */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-black text-amber-500 uppercase tracking-tighter">Owner Oversight</h2>
          <p className="text-amber-700 text-xs font-bold uppercase tracking-widest">Real-time Performance Metrics</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 bg-zinc-900/50 p-2 rounded-2xl border border-amber-900/20">
           <div className="flex bg-black p-1 rounded-xl border border-amber-900/10">
            {(['today', 'week', 'month'] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${period === p ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' : 'text-amber-800'}`}>
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Cards & Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {(['house1', 'house2'] as const).map((hId) => {
          const isLow = hourlyStats[hId] < thresholds[hId];
          return (
            <div key={hId} className={`p-8 rounded-[2.5rem] border-2 transition-all ${isLow ? 'bg-zinc-950 border-red-900/40 shadow-2xl shadow-red-900/5' : 'bg-zinc-900 border-amber-900/20'}`}>
              <div className="flex justify-between items-start mb-6">
                <div>
                  <p className="text-amber-700 text-[10px] font-black uppercase tracking-[0.2em] mb-1">{HOUSE_NAMES[hId]}</p>
                  <h3 className="text-3xl font-black text-amber-500">{stats[hId].revenue.toLocaleString()} <span className="text-xs">ETB</span></h3>
                </div>
                {isLow ? (
                  <div className="bg-red-500/10 border border-red-500/30 px-3 py-1 rounded-full flex items-center gap-2 animate-pulse">
                    <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                    <span className="text-[9px] text-red-500 font-black uppercase">Low Hourly Yield</span>
                  </div>
                ) : (
                  <div className="bg-green-500/10 border border-green-500/30 px-3 py-1 rounded-full flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    <span className="text-[9px] text-green-500 font-black uppercase">Stable Flow</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-black/40 p-4 rounded-2xl border border-amber-900/10">
                  <p className="text-[9px] text-amber-700 font-black uppercase mb-1">Last 60 Mins</p>
                  <p className="text-xl font-black text-amber-500">{hourlyStats[hId]} <span className="text-[10px]">G</span></p>
                </div>
                <div className="bg-black/40 p-4 rounded-2xl border border-amber-900/10">
                  <p className="text-[9px] text-amber-700 font-black uppercase mb-1">Alert Set @</p>
                  <input 
                    type="number" 
                    value={thresholds[hId]} 
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      const next = { ...thresholds, [hId]: val };
                      setThresholds(next);
                      saveThresholds(next);
                    }}
                    className="bg-transparent text-xl font-black text-amber-500 w-full outline-none"
                  />
                </div>
              </div>

              {isLow && (
                <button 
                  onClick={() => handleRequestVideo(hId)}
                  className="w-full bg-red-600 hover:bg-red-500 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-[10px] shadow-lg shadow-red-900/20 transition-all flex items-center justify-center gap-3 active:scale-95"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Request Live Video Feed
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary Chart */}
      <div className="bg-zinc-900 border border-amber-900/20 p-8 rounded-[2.5rem]">
        <h4 className="text-xs font-black text-amber-600 uppercase tracking-widest mb-8">Asset Revenue contribution</h4>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.tvPerformance}>
              <XAxis dataKey="name" stroke="#78350f" fontSize={10} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#451a03', color: '#f59e0b', borderRadius: '12px' }} />
              <Bar dataKey="revenue" radius={[6, 6, 0, 0]} fill="#d97706" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
