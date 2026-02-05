
import { GameEntry } from '../types';

const STORAGE_KEY = 'fifa_game_counter_data';
const PRICES_KEY = 'fifa_tv_prices';

export const getStoredGames = (): GameEntry[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

export const saveGames = (games: GameEntry[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
};

export const clearAllData = () => {
  localStorage.removeItem(STORAGE_KEY);
};

export const getTVPrices = (): Record<string, number> => {
  const data = localStorage.getItem(PRICES_KEY);
  return data ? JSON.parse(data) : {};
};

export const saveTVPrices = (prices: Record<string, number>) => {
  localStorage.setItem(PRICES_KEY, JSON.stringify(prices));
};
