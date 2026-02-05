
import React, { useState, useEffect } from 'react';
import { TV_CONFIGS, HOUSE_NAMES } from '../constants';
import { GameEntry, HouseId } from '../types';
import { getStoredGames, saveGames, getTVPrices, saveTVPrices } from '../services/storage';

const WorkerApp: React.FC = () => {
  const [games, setGames] = useState<GameEntry[]>([]);
  const [activeHouse, setActiveHouse] = useState<HouseId>('house1');
  const [customPrices, setCustomPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    setGames(getStoredGames());
    setCustomPrices(getTVPrices());
  }, []);

  // Polling for updates (in case admin resets data)
  useEffect(() => {
    const interval = setInterval(() => {
      setGames(getStoredGames());
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const getEffectivePrice = (tvId: string, defaultPrice: number) => {
    return customPrices[tvId] ?? defaultPrice;
  };

  const handlePriceChange = (tvId: string, newPrice: string) => {
    const tvConfig = TV_CONFIGS.find(t => t.id === tvId);
    const basePrice = tvConfig?.pricePerGame ?? 0;
    
    let val = parseInt(newPrice);
    if (isNaN(val)) {
      val = basePrice;
    }

    // Enforce logic: Price cannot be decreased below the system base price
    const finalPrice = Math.max(val, basePrice);
    
    const updated = { ...customPrices, [tvId]: finalPrice };
    setCustomPrices(updated);
    saveTVPrices(updated);
  };

  const handleAddGame = (tvId: string, price: number) => {
    const newGame: GameEntry = {
      id: Math.random().toString(36).substr(2, 9),
      tvId,
      timestamp: Date.now(),
      completed: true,
      amount: price,
    };
    const updated = [...games, newGame];
    setGames(updated);
    saveGames(updated);
  };

  const currentHouseTVs = TV_CONFIGS.filter(tv => tv.houseId === activeHouse);
  
  const getHouseStats = (houseId: HouseId) => {
    const houseGames = games.filter(g => 
      TV_CONFIGS.find(tv => tv.id === g.tvId)?.houseId === houseId
    );
    const revenue = houseGames.reduce((acc, curr) => acc + curr.amount, 0);
    return { count: houseGames.length, revenue };
  };

  const stats = getHouseStats(activeHouse);

  // Determine grid layout based on number of TVs to divide screen equally
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
            <p className="text-[10px] text-amber-700 font-black uppercase tracking-tighter">Current Yield</p>
            <p className="text-xl font-black text-amber-500 leading-none">{stats.revenue} <span className="text-[10px]">ETB</span></p>
          </div>
        </div>
      </div>

      {/* Vertical Grid Dividing Screen Equally */}
      <div className={`flex-grow grid ${gridCols} ${gridRows} gap-3 h-full`}>
        {currentHouseTVs.map((tv) => {
          const tvGames = games.filter(g => g.tvId === tv.id);
          const currentPrice = getEffectivePrice(tv.id, tv.pricePerGame);
          
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
                  <p className="text-[10px] text-amber-600 font-black">{tvGames.length} <span className="opacity-50">GAMES</span></p>
                </div>
              </div>

              {/* Scrollable Game Box Area - Vertical Layout */}
              <div className="flex-grow p-4 overflow-y-auto scrollbar-thin">
                <div className="grid grid-cols-3 gap-3">
                  {/* Completed Game Squares - Non-interactive as requested */}
                  {tvGames.map((game, index) => (
                    <div 
                      key={game.id} 
                      className="aspect-square bg-amber-500 rounded-2xl flex items-center justify-center text-black font-black text-lg relative shadow-md shadow-amber-500/10 transition-transform active:scale-95"
                    >
                      {index + 1}
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-black border border-amber-500 rounded-full flex items-center justify-center">
                        <svg className="w-2.5 h-2.5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                        </svg>
                      </div>
                    </div>
                  ))}

                  {/* The "Next Game" Interactive Box */}
                  <button
                    onClick={() => handleAddGame(tv.id, currentPrice)}
                    className="aspect-square border-2 border-dashed border-amber-900/40 rounded-2xl flex flex-col items-center justify-center text-amber-900/60 hover:border-amber-500 hover:text-amber-500 hover:bg-amber-500/5 transition-all group"
                  >
                    <span className="text-3xl font-black leading-none">+</span>
                    <span className="text-[8px] font-black uppercase mt-1 opacity-0 group-hover:opacity-100">Add Game</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex-none py-3 text-center">
        <p className="text-[8px] text-amber-900 font-black uppercase tracking-[0.5em]">Prices are fixed to a minimum standard and cannot be reduced</p>
      </div>
    </div>
  );
};

export default WorkerApp;
