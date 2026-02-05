
import { GameEntry } from '../types';

const STORAGE_KEY = 'fifa_game_counter_data';
const PRICES_KEY = 'fifa_tv_prices';
const BACKEND_URL = (process.env as any).BACKEND_URL;

// Local helpers
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
  if (!BACKEND_URL) return getLocalGames();

  try {
    const response = await fetch(`${BACKEND_URL}/games`, {
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (response.ok) {
      const remoteGames = await response.json();
      setLocalGames(remoteGames);
      return remoteGames;
    }
  } catch (error) {
    console.warn('Backend unreachable, using local data:', error);
  }
  return getLocalGames();
};

export const saveGames = async (games: GameEntry[]) => {
  setLocalGames(games);
  
  if (!BACKEND_URL) return;

  try {
    await fetch(`${BACKEND_URL}/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ games }),
    });
  } catch (error) {
    console.error('Failed to sync games to backend:', error);
  }
};

export const clearAllData = async () => {
  localStorage.removeItem(STORAGE_KEY);
  
  if (!BACKEND_URL) return;

  try {
    await fetch(`${BACKEND_URL}/games`, { method: 'DELETE' });
  } catch (error) {
    console.error('Failed to clear backend data:', error);
  }
};

export const getTVPrices = async (): Promise<Record<string, number>> => {
  if (!BACKEND_URL) return getLocalPrices();

  try {
    const response = await fetch(`${BACKEND_URL}/prices`);
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

  if (!BACKEND_URL) return;

  try {
    await fetch(`${BACKEND_URL}/prices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prices }),
    });
  } catch (error) {
    console.error('Failed to sync prices to backend:', error);
  }
};
