
import React, { useState, useEffect, useMemo } from 'react';
import { TV_CONFIGS, HOUSE_NAMES } from '../constants';
import { GameEntry } from '../types';
import { getStoredGames, clearAllData } from '../services/storage';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';

type Period = 'today' | 'week' | 'month' | 'custom';

const AdminDashboard: React.FC = () => {
  const [games, setGames] = useState<GameEntry[]>([]);
  const [lastUpdate, setLastUpdate] = useState<string>(new Date().toLocaleTimeString());
  const [period, setPeriod] = useState<Period>('today');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const refreshData = async () => {
    const freshGames = await getStoredGames();
    setGames((prev) => {
      // Deep compare or simple length check to update timestamp
      if (JSON.stringify(prev) !== JSON.stringify(freshGames)) {
        setLastUpdate(new Date().toLocaleTimeString());
        return freshGames;
      }
      return prev;
    });
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 3000);
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'fifa_game_counter_data') {
        refreshData();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const handleResetDay = async () => {
    if (confirm("OWNER ACTION REQUIRED: This will PERMANENTLY delete all historical game data and yields from the cloud. Continue?")) {
      await clearAllData();
      await refreshData();
      setLastUpdate(new Date().toLocaleTimeString());
    }
  };

  const filteredGames = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    
    return games.filter(g => {
      if (!g.completed) return false;

      if (period === 'today') {
        return g.timestamp >= startOfToday;
      }
      if (period === 'week') {
        const sevenDaysAgo = now.getTime() - (7 * 24 * 60 * 60 * 1000);
        return g.timestamp >= sevenDaysAgo;
      }
      if (period === 'month') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        return g.timestamp >= startOfMonth;
      }
      if (period === 'custom') {
        const targetDate = new Date(selectedDate);
        const startOfSelectedDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime();
        const endOfSelectedDay = startOfSelectedDay + (24 * 60 * 60 * 1000);
        return g.timestamp >= startOfSelectedDay && g.timestamp < endOfSelectedDay;
      }
      return true;
    });
  }, [games, period, selectedDate]);

  const stats = useMemo(() => {
    const totalRev = filteredGames.reduce((acc, g) => acc + g.amount, 0);
    
    const house1Entries = filteredGames.filter(g => 
      TV_CONFIGS.find(tv => tv.id === g.tvId)?.houseId === 'house1'
    );
    const house2Entries = filteredGames.filter(g => 
      TV_CONFIGS.find(tv => tv.id === g.tvId)?.houseId === 'house2'
    );

    const house1Rev = house1Entries.reduce((acc, g) => acc + g.amount, 0);
    const house2Rev = house2Entries.reduce((acc, g) => acc + g.amount, 0);

    const tvPerformance = TV_CONFIGS.map(tv => {
      const gList = filteredGames.filter(g => g.tvId === tv.id && !g.isSeparator);
      const tvRevenue = filteredGames.filter(g => g.tvId === tv.id).reduce((acc, curr) => acc + curr.amount, 0);
      const tvGamesCount = gList.length;
      
      return {
        id: tv.id,
        name: tv.name,
        games: tvGamesCount,
        revenue: tvRevenue,
        house: tv.houseId,
        avgRate: tvGamesCount > 0 ? (tvRevenue / tvGamesCount).toFixed(0) : '0',
        share: totalRev > 0 ? ((tvRevenue / totalRev) * 100).toFixed(1) : '0'
      };
    });

    return {
      totalGames: filteredGames.filter(g => !g.isSeparator).length,
      totalRevenue: totalRev,
      house1: { games: house1Entries.filter(g => !g.isSeparator).length, revenue: house1Rev },
      house2: { games: house2Entries.filter(g => !g.isSeparator).length, revenue: house2Rev },
      tvPerformance
    };
  }, [filteredGames]);

  const getPeriodLabel = () => {
    if (period === 'today') return "Today's Performance";
    if (period === 'week') return "Weekly Performance (7D)";
    if (period === 'month') return "Monthly Performance";
    return `Revenue for ${selectedDate}`;
  };

  const COLORS = ['#d97706', '#f59e0b', '#fbbf24', '#fcd34d', '#78350f', '#451a03', '#92400e'];

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in duration-700 pb-12">
      {/* Header & Controls */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-black text-amber-500 uppercase tracking-tighter">Owner Oversight</h2>
          <p className="text-amber-700 text-xs font-bold uppercase tracking-widest">{getPeriodLabel()}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-zinc-900/50 p-2 rounded-2xl border border-amber-900/20 w-full xl:w-auto">
          <div className="flex bg-black p-1 rounded-xl border border-amber-900/10">
            {(['today', 'week', 'month'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  period === p ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' : 'text-amber-800 hover:text-amber-600'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 bg-black px-3 py-1.5 rounded-xl border border-amber-900/10">
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setPeriod('custom');
              }}
              className="bg-transparent text-amber-500 text-[10px] font-black uppercase outline-none cursor-pointer [color-scheme:dark]"
            />
            <span className={`text-[10px] font-black uppercase ${period === 'custom' ? 'text-amber-500' : 'text-amber-900'}`}>Calendar</span>
          </div>
          <div className="hidden xl:block w-px h-6 bg-amber-900/20"></div>
          <button 
            onClick={handleResetDay}
            className="ml-auto xl:ml-0 px-3 py-1.5 text-red-900 hover:text-red-500 transition-colors text-[9px] font-black uppercase tracking-widest"
          >
            Purge History
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-amber-500 to-amber-700 p-8 rounded-[2rem] shadow-2xl shadow-amber-500/10 text-black transition-all duration-500 transform hover:scale-[1.02]">
          <p className="text-amber-900/60 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Net Period Revenue</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-5xl font-black tabular-nums">{stats.totalRevenue.toLocaleString()}</h3>
            <span className="text-amber-900 font-black">ETB</span>
          </div>
          <div className="mt-6 flex items-center gap-2 bg-black/10 w-fit px-3 py-1.5 rounded-full text-[10px] font-black uppercase border border-black/5">
            <span className="w-2 h-2 bg-black rounded-full animate-pulse"></span>
            Cloud Sync Active
          </div>
        </div>

        <div className="bg-zinc-900 border border-amber-900/30 p-8 rounded-[2rem] shadow-sm flex flex-col justify-center">
          <p className="text-amber-700 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Game Volume</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-5xl font-black text-amber-500 tabular-nums">{stats.totalGames}</h3>
            <span className="text-amber-700 font-bold uppercase text-xs">Sessions</span>
          </div>
          <div className="mt-6 flex items-center gap-4">
             <div className="flex items-center gap-1.5">
               <span className="w-2 h-2 rounded-full bg-amber-500"></span>
               <span className="text-[10px] text-amber-800 font-black uppercase tracking-tighter">Live Systems: {TV_CONFIGS.length}</span>
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div className="bg-zinc-950 p-6 rounded-[1.5rem] border border-amber-900/30 hover:border-amber-500/30 transition-all flex flex-col justify-between">
            <div className="flex justify-between items-center mb-1">
              <p className="text-[10px] text-amber-700 font-black uppercase tracking-widest">House 1 Total</p>
              <p className="text-xs font-black text-amber-500 tabular-nums">{stats.house1.games} GS</p>
            </div>
            <p className="text-2xl font-black text-amber-500 tabular-nums">{stats.house1.revenue.toLocaleString()} <span className="text-[10px] text-amber-700">ETB</span></p>
          </div>
          <div className="bg-zinc-950 p-6 rounded-[1.5rem] border border-amber-900/30 hover:border-amber-500/30 transition-all flex flex-col justify-between">
            <div className="flex justify-between items-center mb-1">
              <p className="text-[10px] text-amber-700 font-black uppercase tracking-widest">House 2 Total</p>
              <p className="text-xs font-black text-amber-500 tabular-nums">{stats.house2.games} GS</p>
            </div>
            <p className="text-2xl font-black text-amber-500 tabular-nums">{stats.house2.revenue.toLocaleString()} <span className="text-[10px] text-amber-700">ETB</span></p>
          </div>
        </div>
      </div>

      {/* Visual Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-zinc-900 border border-amber-900/20 p-8 rounded-[2rem] shadow-sm">
          <h4 className="text-xs font-black text-amber-600 uppercase tracking-widest mb-8">Asset Revenue Contribution</h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.tvPerformance}>
                <XAxis 
                  dataKey="name" 
                  stroke="#78350f" 
                  fontSize={10} 
                  axisLine={false} 
                  tickLine={false} 
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#09090b', borderColor: '#451a03', color: '#f59e0b', borderRadius: '12px', fontSize: '12px' }}
                  itemStyle={{ color: '#f59e0b' }}
                  cursor={{ fill: 'rgba(217, 119, 6, 0.05)' }}
                />
                <Bar dataKey="revenue" radius={[6, 6, 0, 0]} animationDuration={1000}>
                  {stats.tvPerformance.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-zinc-900 border border-amber-900/20 p-8 rounded-[2rem] shadow-sm flex flex-col items-center">
          <h4 className="text-xs font-black text-amber-600 uppercase tracking-widest mb-8 self-start">Revenue Split Share</h4>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'House 1', value: stats.house1.revenue },
                    { name: 'House 2', value: stats.house2.revenue },
                  ]}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={8}
                  dataKey="value"
                  animationDuration={1000}
                >
                  <Cell fill="#d97706" />
                  <Cell fill="#451a03" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-12 mt-2">
            <div className="text-center">
              <p className="text-[10px] text-amber-700 font-black uppercase tracking-widest">H1 Share</p>
              <p className="text-lg font-black text-amber-500">{stats.totalRevenue > 0 ? Math.round((stats.house1.revenue / stats.totalRevenue) * 100) : 0}%</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-amber-700 font-black uppercase tracking-widest">H2 Share</p>
              <p className="text-lg font-black text-amber-500">{stats.totalRevenue > 0 ? Math.round((stats.house2.revenue / stats.totalRevenue) * 100) : 0}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Ledger */}
      <div className="bg-zinc-900 border border-amber-900/20 rounded-[2rem] overflow-hidden">
        <div className="px-8 py-6 border-b border-amber-900/20 flex justify-between items-center bg-black/20">
          <h4 className="text-xs font-black text-amber-500 uppercase tracking-[0.3em]">Detailed Daily Ledger</h4>
          <span className="text-[9px] text-amber-800 font-bold uppercase tracking-widest">Cloud Update @ {lastUpdate}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-black/40">
              <tr className="text-[10px] font-black text-amber-700 uppercase tracking-widest">
                <th className="px-8 py-4 text-left">Asset</th>
                <th className="px-8 py-4 text-left">Location</th>
                <th className="px-8 py-4 text-center">Sessions</th>
                <th className="px-8 py-4 text-center">Avg Rate</th>
                <th className="px-8 py-4 text-center">Global Share</th>
                <th className="px-8 py-4 text-right">Yield (ETB)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-900/10">
              {stats.tvPerformance.map((tv) => (
                <tr key={tv.id} className="hover:bg-amber-500/5 transition-colors group">
                  <td className="px-8 py-5">
                    <span className="font-black text-amber-500 group-hover:text-amber-400">{tv.name}</span>
                  </td>
                  <td className="px-8 py-5">
                    <span className="text-[9px] font-black px-2 py-1 rounded bg-black/50 text-amber-600 border border-amber-900/20 uppercase tracking-tighter">
                      {HOUSE_NAMES[tv.house]}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-center text-amber-200 font-mono text-xs tabular-nums">
                    {tv.games} <span className="text-[10px] opacity-40">G</span>
                  </td>
                  <td className="px-8 py-5 text-center text-amber-500 font-mono text-xs tabular-nums">
                    {tv.avgRate} <span className="text-[9px] opacity-40">ETB/G</span>
                  </td>
                  <td className="px-8 py-5 text-center">
                    <span className="inline-block px-2 py-1 rounded-full bg-amber-500/10 text-amber-500 font-black text-[10px] tabular-nums">
                      {tv.share}%
                    </span>
                  </td>
                  <td className="px-8 py-5 text-right font-black text-amber-500 tabular-nums">
                    {tv.revenue.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
