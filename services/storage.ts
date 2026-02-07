
import { GameEntry, VideoSession, HouseThresholds, SessionEvent } from '../types';

const STORAGE_KEY = 'fifa_game_counter_data';
const PRICES_KEY = 'fifa_tv_prices';
const API_BASE = '/api';

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

const mergeGames = (local: GameEntry[], remote: GameEntry[]): GameEntry[] => {
  const map = new Map<string, GameEntry>();
  remote.forEach(g => map.set(g.id, g));
  local.forEach(g => map.set(g.id, g));
  return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
};

export const getStoredGames = async (): Promise<GameEntry[]> => {
  const localGames = getLocalGames();
  try {
    const response = await fetch(`${API_BASE}/games`, {
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(3000)
    });
    if (response.ok) {
      const remoteGames: GameEntry[] = await response.json();
      const merged = mergeGames(localGames, remoteGames);
      if (merged.length > remoteGames.length) {
        await pushGamesToServer(merged);
      }
      setLocalGames(merged);
      return merged;
    }
  } catch (error) {
    console.warn('Sync attempt failed:', error);
  }
  return localGames;
};

const pushGamesToServer = async (games: GameEntry[]) => {
  try {
    await fetch(`${API_BASE}/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ games }),
    });
    return true;
  } catch (e) {
    return false;
  }
};

export const saveGames = async (games: GameEntry[]) => {
  setLocalGames(games);
  await pushGamesToServer(games);
};

export const clearAllData = async () => {
  localStorage.removeItem(STORAGE_KEY);
  try {
    await fetch(`${API_BASE}/games`, { method: 'DELETE' });
  } catch (error) {}
};

export const getTVPrices = async (): Promise<Record<string, number>> => {
  const localPrices = getLocalPrices();
  try {
    const response = await fetch(`${API_BASE}/prices`);
    if (response.ok) {
      const remotePrices = await response.json();
      const merged = { ...remotePrices, ...localPrices };
      setLocalPrices(merged);
      return merged;
    }
  } catch (error) {}
  return localPrices;
};

export const saveTVPrices = async (prices: Record<string, number>) => {
  setLocalPrices(prices);
  try {
    await fetch(`${API_BASE}/prices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prices }),
    });
  } catch (error) {}
};

export const getThresholds = async (): Promise<HouseThresholds> => {
  try {
    const response = await fetch(`${API_BASE}/thresholds`);
    if (response.ok) return await response.json();
  } catch (e) {}
  return { house1: 2, house2: 2 };
};

export const saveThresholds = async (thresholds: HouseThresholds) => {
  try {
    await fetch(`${API_BASE}/thresholds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(thresholds),
    });
  } catch (e) {}
};

export const getHouseStatus = async (): Promise<Record<string, boolean>> => {
  try {
    const response = await fetch(`${API_BASE}/house-status`);
    if (response.ok) return await response.json();
  } catch (e) {}
  return { house1: false, house2: false };
};

export const sendHeartbeat = async (houseId: string) => {
  try {
    await fetch(`${API_BASE}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ houseId }),
    });
  } catch (e) {}
};

export const getVideoSession = async (): Promise<VideoSession> => {
  try {
    const response = await fetch(`${API_BASE}/video-session`);
    if (response.ok) return await response.json();
  } catch (e) {}
  return { houseId: null, status: 'idle' };
};

export const updateVideoSession = async (session: Partial<VideoSession>) => {
  try {
    await fetch(`${API_BASE}/video-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    });
  } catch (e) {}
};

export const sendVideoFrame = async (frame: string) => {
  try {
    await fetch(`${API_BASE}/video-frame`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frame }),
    });
  } catch (e) {}
};

export const sendAudioFrame = async (audioFrame: string) => {
  try {
    await fetch(`${API_BASE}/audio-frame`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioFrame }),
    });
  } catch (e) {}
};

export const recordEvent = async (type: 'yield_alert', houseId: string) => {
  try {
    await fetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, houseId }),
    });
  } catch (e) {}
};

export const getEvents = async (): Promise<SessionEvent[]> => {
  try {
    const response = await fetch(`${API_BASE}/events`);
    if (response.ok) return await response.json();
  } catch (e) {}
  return [];
};
