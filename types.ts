export type HouseId = 'house1' | 'house2';
export type VideoQuality = 'low' | 'medium' | 'high';

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

export interface SessionEvent {
  id: string;
  type: 'video_request' | 'yield_alert' | 'counter_online' | 'video_session_ended';
  houseId: HouseId;
  timestamp: number;
  duration?: number;
}

export interface AudioFrame {
  id: number;
  data: string;
}

export interface VideoSession {
  houseId: HouseId | null;
  status: 'idle' | 'requested' | 'active';
  audioStatus?: 'idle' | 'active';
  audioFrame?: string;
  audioFrames?: AudioFrame[];
  frame?: string;
  quality?: VideoQuality;
  lastRequestTime?: number;
  lastRequestedHouseId?: HouseId | null;
  lastOnlineSignalTime?: number;
}

export interface HouseThresholds {
  house1: number;
  house2: number;
}