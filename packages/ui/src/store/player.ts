/**
 * Player state signals
 */
import { signal, computed } from '@preact/signals';

// Player stats
export const playerName = signal<string>('Player');
export const playerLevel = signal<string>('Lv. 1');

// Health
export const healthCurrent = signal<number>(100);
export const healthMax = signal<number>(100);
export const healthRegenRate = signal<number>(0);

export const healthPercent = computed(() => {
  const max = healthMax.value;
  return max > 0 ? (healthCurrent.value / max) * 100 : 0;
});

// Stamina
export const staminaCurrent = signal<number>(100);
export const staminaMax = signal<number>(100);
export const staminaRegenRate = signal<number>(0);

export const staminaPercent = computed(() => {
  const max = staminaMax.value;
  return max > 0 ? (staminaCurrent.value / max) * 100 : 0;
});

// Position & heading
export const playerPosition = signal<{ x: number; y: number; z: number }>({
  x: 0,
  y: 0,
  z: 0,
});
export const playerHeading = signal<number>(0);

// Inventory & currency
export const playerGold = signal<number>(0);
export const playerInventory = signal<any[]>([]);
