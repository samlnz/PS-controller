
import { TVConfig } from './types';

export const TV_CONFIGS: TVConfig[] = [
  // House 1
  { id: 'A1', name: 'TV A1', houseId: 'house1', pricePerGame: 20 },
  { id: 'B1', name: 'TV B1', houseId: 'house1', pricePerGame: 20 },
  { id: 'C1', name: 'TV C1', houseId: 'house1', pricePerGame: 15 },
  { id: 'D1', name: 'TV D1', houseId: 'house1', pricePerGame: 15 },
  // House 2
  { id: 'A2', name: 'TV A2', houseId: 'house2', pricePerGame: 20 },
  { id: 'B2', name: 'TV B2', houseId: 'house2', pricePerGame: 20 },
  { id: 'C2', name: 'TV C2', houseId: 'house2', pricePerGame: 20 },
];

export const HOUSE_NAMES: Record<string, string> = {
  house1: 'House 1',
  house2: 'House 2',
};
