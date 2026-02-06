
export type HouseId = 'house1' | 'house2';

export interface TVConfig {
  id: string;
  name: string;
  houseId: HouseId;
  pricePerGame: number;
}

export interface GameEntry {
  id: string;
  tvId: string;
  timestamp: number;
  completed: boolean;
  amount: number;
  isSeparator?: boolean;
}

export interface HouseStats {
  houseId: HouseId;
  totalGames: number;
  totalRevenue: number;
}

export interface GlobalStats {
  totalGames: number;
  totalRevenue: number;
  houses: HouseStats[];
}

export interface VideoSession {
  houseId: HouseId | null;
  status: 'idle' | 'requested' | 'active';
  frame?: string;
}

export interface HouseThresholds {
  house1: number;
  house2: number;
}
