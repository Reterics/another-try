/**
 * Menu state signals
 */
import { signal } from '@preact/signals';
import type { ATMap } from '@game/shared';

export type MenuSection = 'main' | 'new-game' | 'settings';

export const currentMenuSection = signal<MenuSection>('main');
export const availableMaps = signal<ATMap[]>([]);
export const playerNameInput = signal<string>('');
export const hasSavedGame = signal<boolean>(false);
export const savedGameInfo = signal<{ name: string; date: string; mapId?: string; coords?: any } | null>(null);

// Graphics settings
export const settingsLOD = signal<'low' | 'medium' | 'high'>('medium');
export const settingsTextureQuality = signal<'low' | 'medium' | 'high'>('high');
export const settingsPostFX = signal<'off' | 'medium' | 'high'>('medium');
export const settingsMaxFPS = signal<number>(0); // 0 = uncapped

// Menu actions
export function showMenuSection(section: MenuSection) {
    currentMenuSection.value = section;
}

export function setPlayerName(name: string) {
    playerNameInput.value = name;
}

export function updateGraphicsSettings(settings: {
    lod?: 'low' | 'medium' | 'high';
    textureQuality?: 'low' | 'medium' | 'high';
    postfx?: 'off' | 'medium' | 'high';
    maxFps?: number;
}) {
    if (settings.lod) settingsLOD.value = settings.lod;
    if (settings.textureQuality) settingsTextureQuality.value = settings.textureQuality;
    if (settings.postfx) settingsPostFX.value = settings.postfx;
    if (settings.maxFps !== undefined) settingsMaxFPS.value = settings.maxFps;
}
