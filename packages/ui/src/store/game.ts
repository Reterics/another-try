/**
 * Game state signals
 */
import { signal } from '@preact/signals';

export type GameState = 'playing' | 'paused' | 'menu';

export const gameState = signal<GameState>('menu');
export const gameScore = signal<number>(0);
export const gameTime = signal<number>(0);
export const debugLines = signal<string[]>([]);

// Debug/stats
export const fps = signal<number>(0);
export const renderStats = signal<{
  geometries?: number;
  textures?: number;
  triangles?: number;
}>({});
