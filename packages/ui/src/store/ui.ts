/**
 * UI state signals
 */
import { signal } from '@preact/signals';

// Menu & modal states
export const showMainMenu = signal<boolean>(true);
export const showSettings = signal<boolean>(false);

// HUD visibility
export const showHUD = signal<boolean>(false);
export const showDebug = signal<boolean>(false);
export const showChat = signal<boolean>(false);
export type ActiveTool = 'pointer' | 'far' | 'size' | 'precision';
export const activeTool = signal<ActiveTool>('pointer');

// Minimap
export const minimapZoom = signal<number>(1.0);

// Dialog overlay
export const dialogVisible = signal<boolean>(false);
export const dialogTitle = signal<string>('');
export const dialogBody = signal<string>('');
export const dialogBodyHtml = signal<string>('');
