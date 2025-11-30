import { Shape } from './types';

export const GRID_SIZE = 8;
export const COST_ROTATE = 2; // Keys required to rotate
export const COST_SWAP_HOLD = 0; // Free to swap/hold usually, or make it cost keys

export const THEME_COLORS = {
  cyan: 'bg-cyan-500 shadow-cyan-500/50',
  purple: 'bg-purple-500 shadow-purple-500/50',
  emerald: 'bg-emerald-500 shadow-emerald-500/50',
  rose: 'bg-rose-500 shadow-rose-500/50',
  amber: 'bg-amber-500 shadow-amber-500/50',
};

// Base templates for shapes (0/1 matrices)
const SHAPE_TEMPLATES = [
  // Dot
  [[1]],
  // Line 2
  [[1, 1]],
  [[1], [1]],
  // Line 3
  [[1, 1, 1]],
  [[1], [1], [1]],
  // Line 4
  [[1, 1, 1, 1]],
  [[1], [1], [1], [1]],
  // Square 2x2
  [[1, 1], [1, 1]],
  // Square 3x3
  [[1, 1, 1], [1, 1, 1], [1, 1, 1]],
  // L shapes
  [[1, 0], [1, 0], [1, 1]],
  [[0, 1], [0, 1], [1, 1]],
  [[1, 1, 1], [1, 0, 0]],
  // T shapes
  [[1, 1, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 1, 1]],
  // Z/S shapes
  [[1, 1, 0], [0, 1, 1]],
  [[0, 1, 1], [1, 1, 0]],
];

const COLORS = [
  '#06b6d4', // Cyan
  '#8b5cf6', // Violet
  '#f43f5e', // Rose
  '#10b981', // Emerald
  '#f59e0b', // Amber
];

export const generateRandomShape = (): Shape => {
  const matrix = SHAPE_TEMPLATES[Math.floor(Math.random() * SHAPE_TEMPLATES.length)];
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  return {
    id: Math.random().toString(36).substr(2, 9),
    matrix: JSON.parse(JSON.stringify(matrix)), // Deep copy
    color,
  };
};

export const createEmptyGrid = (): string[][] => {
  return Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
};
