export type CellColor = string | null;

export type Grid = CellColor[][];

export interface Shape {
  id: string; // unique ID for React keys
  matrix: number[][]; // 1 for block, 0 for empty
  color: string;
}

export interface GameState {
  grid: Grid;
  score: number;
  highScore: number;
  keys: number;
  availablePieces: Shape[];
  holdPiece: Shape | null;
  isGameOver: boolean;
  combo: number;
}

export type ThemeColor = 'cyan' | 'purple' | 'emerald' | 'rose' | 'amber';

export interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  vx: number;
  vy: number;
  life: number;
}