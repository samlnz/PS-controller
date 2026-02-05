
import React, { useState, useEffect, useMemo } from 'react';
import { TV_CONFIGS, HOUSE_NAMES } from '../constants';
import { GameEntry, HouseId } from '../types';
import { getStoredGames, saveGames, getTVPrices, saveTVPrices } from '../services/storage';

const WorkerApp: React.FC = () => {
  const [games, setGames] = useState<GameEntry[]>([]);
  const [activeHouse, setActiveHouse] = useState<HouseId>('house1');
  const [customPrices, setCustomPrices] = useState<Record<string, number>>({});

  const loadData = async () => {
    const [fetchedGames, fetchedPrices] = await Promise.all([
      getStoredGames(),
      getTVPrices()
    ]);
    setGames(fetchedGames);
    setCustomPrices(fetchedPrices);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Polling for cloud updates
  useEffect(() => {
    const interval = setInterval(async () => {
      const refreshedGames = await getStoredGames();
      setGames(refreshedGames);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const getEffectivePrice = (tvId: string, defaultPrice: number) => {
    return customPrices[tvId] ?? defaultPrice;
  };

  const handlePriceChange = async (tvId: string, newPrice: string) => {
    const tvConfig = TV_CONFIGS.find(t => t.id === tvId);
    const basePrice = tvConfig?.pricePerGame ?? 0;
    
    let val = parseInt(newPrice);
    if (isNaN(val)) {
      val = basePrice;
    }

    const finalPrice = Math.max(val, basePrice);
    
    const updated = { ...customPrices, [tvId]: finalPrice };
    setCustomPrices(updated);
    await saveTVPrices(updated);
  };

  const handleAddGame = async (tvId: string, price: number, isSeparator = false) => {
    const newEntry: GameEntry = {
      id: Math.random().toString(36).substr(2, 9),
      tvId,
      timestamp: Date.now(),
      completed: true,
      amount: isSeparator ? 0 : price,
      isSeparator
    };
    const updated = [...games, newEntry];
    setGames(updated);
    await saveGames(updated);
  };

  // Determine the start of the current business day (7:00 AM)
  const businessDayStart = useMemo(() => {
    const now = new Date();
    const today7AM = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 7, 0, 0, 0);
    if (now.getHours() < 7) {
      today7AM.setDate(today7AM.getDate() - 1);
    }
    return today7AM.getTime();
  }, [games]); // Re-eval on sync

  const currentHouseTVs = TV_CONFIGS.filter(tv => tv.houseId === activeHouse);
  
  const getHouseStats = (houseId: HouseId) => {
    const houseEntries = games.filter(g => 
      g.timestamp >= businessDayStart &&
      TV_CONFIGS.find(tv => tv.id === g.tvId)?.houseId === houseId
    );
    const revenue = houseEntries.reduce((acc, curr) => acc + curr.amount, 0);
    return { count: houseEntries.filter(g => !g.isSeparator).length, revenue };
  };

  const stats = getHouseStats(activeHouse);

  const gridCols = currentHouseTVs.length > 2 ? 'grid-cols-2' : 'grid-cols-1';
  const gridRows = currentHouseTVs.length > 2 ? 'grid-rows-2' : `grid-rows-${currentHouseTVs.length}`;

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] max-w-5xl mx-auto">
      {/* Sub-Header / House Navigation */}
      <div className="flex-none flex items-center justify-between mb-4 px-2">
        <div className="flex p-1 bg-zinc-900 border border-amber-900/30 rounded-2xl">
          {(Object.keys(HOUSE_NAMES) as HouseId[]).map((hId) => (
            <button
              key={hId}
              onClick={() => setActiveHouse(hId)}
              className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                activeHouse === hId 
                  ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' 
                  : 'text-amber-800 hover:text-amber-600'
              }`}
            >
              {HOUSE_NAMES[hId]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] text-amber-700 font-black uppercase tracking-tighter">Current Yield (from 7 AM)</p>
            <p className="text-xl font-black text-amber-500 leading-none">{stats.revenue} <span className="text-[10px]">ETB</span></p>
          </div>
        </div>
      </div>

      {/* Vertical Grid Dividing Screen Equally */}
      <div className={`flex-grow grid ${gridCols} ${gridRows} gap-3 h-full`}>
        {currentHouseTVs.map((tv) => {
          // Only show entries for the current business day
          const tvEntries = games.filter(g => g.tvId === tv.id && g.timestamp >= businessDayStart);
          const currentPrice = getEffectivePrice(tv.id, tv.pricePerGame);
          
          let displayCounter = 0;

          return (
            <div 
              key={tv.id} 
              className="bg-zinc-900/40 border border-amber-900/20 rounded-3xl flex flex-col overflow-hidden hover:border-amber-500/40 transition-all shadow-lg"
            >
              {/* TV Cell Header */}
              <div className="bg-black/60 px-4 py-3 border-b border-amber-900/20 flex justify-between items-center">
                <div>
                  <h3 className="text-amber-500 font-black text-sm uppercase tracking-wider leading-none">{tv.name}</h3>
                  <div className="flex flex-col mt-1">
                    <div className="flex items-center gap-1">
                      <input 
                        type="number" 
                        min={tv.pricePerGame}
                        value={currentPrice}
                        onChange={(e) => handlePriceChange(tv.id, e.target.value)}
                        className="bg-transparent border-b border-amber-900/50 text-amber-500 font-black text-[11px] w-12 focus:outline-none focus:border-amber-500 transition-colors"
                      />
                      <span className="text-[9px] text-amber-800 font-bold uppercase">ETB / Game</span>
                    </div>
                    <span className="text-[7px] text-amber-900/60 font-black uppercase mt-0.5">Min: {tv.pricePerGame} ETB</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-amber-600 font-black">{tvEntries.filter(e => !e.isSeparator).length} <span className="opacity-50">GAMES</span></p>
                </div>
              </div>

              {/* Scrollable Game Box Area */}
              <div className="flex-grow p-4 overflow-y-auto scrollbar-thin">
                <div className="grid grid-cols-3 gap-3">
                  {tvEntries.map((entry) => {
                    if (entry.isSeparator) {
                      displayCounter = 0; 
                      return (
                        <div key={entry.id} className="col-span-3 flex items-center gap-2 py-1">
                          <div className="h-[1px] flex-grow bg-amber-900/30"></div>
                          <span className="text-[7px] font-black text-amber-900 uppercase tracking-widest whitespace-nowrap">Session Reset</span>
                          <div className="h-[1px] flex-grow bg-amber-900/30"></div>
                        </div>
                      );
                    }

                    displayCounter++;
                    return (
                      <div 
                        key={entry.id} 
                        className="aspect-square bg-amber-500 rounded-2xl flex items-center justify-center text-black font-black text-lg relative shadow-md shadow-amber-500/10 transition-transform active:scale-95"
                      >
                        {displayCounter}
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-black border border-amber-500 rounded-full flex items-center justify-center">
                          <svg className="w-2.5 h-2.5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                          </svg>
                        </div>
                      </div>
                    );
                  })}

                  <div className="col-span-3 grid grid-cols-2 gap-3 mt-1">
                    <button
                      onClick={() => handleAddGame(tv.id, currentPrice)}
                      className="h-16 border-2 border-dashed border-amber-900/40 rounded-2xl flex flex-col items-center justify-center text-amber-900/60 hover:border-amber-500 hover:text-amber-500 hover:bg-amber-500/5 transition-all group"
                    >
                      <span className="text-2xl font-black leading-none">+</span>
                      <span className="text-[8px] font-black uppercase mt-0.5">Add Game</span>
                    </button>
                    <button
                      onClick={() => handleAddGame(tv.id, 0, true)}
                      className="h-16 border-2 border-dashed border-amber-900/20 rounded-2xl flex flex-col items-center justify-center text-amber-900/40 hover:border-amber-700 hover:text-amber-700 hover:bg-amber-900/5 transition-all group"
                    >
                      <svg className="w-4 h-4 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                      <span className="text-[8px] font-black uppercase">Separator</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex-none py-3 text-center">
        <p className="text-[8px] text-amber-900 font-black uppercase tracking-[0.5em]">Game history synced with cloud ledger</p>
      </div>
    </div>
  );
};

export default WorkerApp;
