
import { GameEntry } from '../types';

const STORAGE_KEY = 'fifa_game_counter_data';
const PRICES_KEY = 'fifa_tv_prices';
// In Railway, the backend URL is usually the same origin if serving the build, 
// or an environment variable. We'll use a relative path for API calls.
const API_BASE = '/api';

// Local storage is kept as a robust fallback for offline scenarios
const getLocalGames = (): GameEntry[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

const setLocalGames = (games: GameEntry[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
};

const getLocalPrices = (): Record<string, number> => {
  const data = localStorage.getItem(PRICES_KEY);
  return data ? JSON.parse(data) : {};
};

const setLocalPrices = (prices: Record<string, number>) => {
  localStorage.setItem(PRICES_KEY, JSON.stringify(prices));
};

// API Service
export const getStoredGames = async (): Promise<GameEntry[]> => {
  try {
    const response = await fetch(`${API_BASE}/games`, {
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (response.ok) {
      const remoteGames = await response.json();
      setLocalGames(remoteGames);
      return remoteGames;
    }
  } catch (error) {
    console.warn('Backend unreachable, using local fallback:', error);
  }
  return getLocalGames();
};

export const saveGames = async (games: GameEntry[]) => {
  setLocalGames(games);
  
  try {
    // We send the latest game entry or the full list depending on backend design.
    // To keep it simple and robust, we sync the whole state.
    await fetch(`${API_BASE}/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ games }),
    });
  } catch (error) {
    console.error('Failed to sync games to Railway:', error);
  }
};

export const clearAllData = async () => {
  localStorage.removeItem(STORAGE_KEY);
  
  try {
    await fetch(`${API_BASE}/games`, { method: 'DELETE' });
  } catch (error) {
    console.error('Failed to clear Railway data:', error);
  }
};

export const getTVPrices = async (): Promise<Record<string, number>> => {
  try {
    const response = await fetch(`${API_BASE}/prices`);
    if (response.ok) {
      const remotePrices = await response.json();
      setLocalPrices(remotePrices);
      return remotePrices;
    }
  } catch (error) {
    console.warn('Backend unreachable, using local prices:', error);
  }
  return getLocalPrices();
};

export const saveTVPrices = async (prices: Record<string, number>) => {
  setLocalPrices(prices);

  try {
    await fetch(`${API_BASE}/prices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prices }),
    });
  } catch (error) {
    console.error('Failed to sync prices to Railway:', error);
  }
};
