/**
 * GameUIBridge - Connects Preact UI with HUDController
 *
 * This bridge provides:
 * 1. Initialization of UI state from game data
 * 2. Methods for HUDController to update UI
 * 3. Event handlers that call HUDController methods
 * 4. Two-way data synchronization
 */

import type { EventBus, VideoSettingsPayload } from '@game/shared';
import type { ATMap } from '@game/shared';
import { Topics } from '@game/shared';

// Import all UI signals
import { showMainMenu, showHUD, showDebug } from '../store/ui';
import {
    hasSavedGame,
    savedGameInfo,
    availableMaps,
    playerNameInput,
    settingsLOD,
    settingsTextureQuality,
    settingsPostFX,
    settingsMaxFPS,
    currentMenuSection,
} from '../store/menu';
import { playerName, playerLevel } from '../store/player';

export interface SavedGameData {
    name: string;
    date: string;
    coords?: { x: number; y: number; z: number };
    mapId?: string;
}

/**
 * Bridge interface that HUDController can use
 */
export class GameUIBridge {
    private eventBus: EventBus;
    private hudController: any; // Will be set after construction

    constructor(eventBus: EventBus) {
        this.eventBus = eventBus;
        this.setupEventListeners();
    }

    /**
     * Set the HUDController reference (needed for calling its methods)
     */
    setHUDController(controller: any) {
        this.hudController = controller;
    }

    /**
     * 1. INITIALIZATION - Called on game startup
     */
    initialize() {
        // Load saved game state
        this.loadSavedGameState();

        // Load video settings
        this.loadVideoSettings();

        // Load player name from localStorage
        this.loadPlayerName();

        // Set initial UI visibility
        showMainMenu.value = true;
        showHUD.value = false;
        showDebug.value = true; // Show FPS counter by default
    }

    /**
     * Load saved game data and update UI signals
     */
    loadSavedGameState() {
        try {
            const raw = localStorage.getItem('saveGame');
            if (raw) {
                const data: SavedGameData = JSON.parse(raw);
                if (data && data.name && data.date) {
                    hasSavedGame.value = true;
                    savedGameInfo.value = data;
                    return;
                }
            }
        } catch (e) {
            console.warn('Could not load saved game', e);
        }

        hasSavedGame.value = false;
        savedGameInfo.value = null;
    }

    /**
     * Load video settings from localStorage
     */
    loadVideoSettings() {
        try {
            const raw = localStorage.getItem('video:settings');
            if (raw) {
                const settings: VideoSettingsPayload = JSON.parse(raw);
                settingsLOD.value = settings.lod || 'medium';
                settingsTextureQuality.value = settings.textureQuality || 'high';
                settingsPostFX.value = settings.postfx || 'medium';
                settingsMaxFPS.value = settings.maxFps || 0;
            }
        } catch (e) {
            console.warn('Could not load video settings', e);
        }
    }

    /**
     * Load player name from localStorage
     */
    loadPlayerName() {
        try {
            const name = localStorage.getItem('player:name');
            if (name) {
                playerNameInput.value = name;
                playerName.value = name;
            }
        } catch (e) {
            console.warn('Could not load player name', e);
        }
    }

    /**
     * Set available maps (called by main.ts)
     */
    setMaps(maps: ATMap[]) {
        availableMaps.value = maps;
    }

    /**
     * Update saved game display (called by main.ts)
     */
    updateSaveGameDisplay(data?: SavedGameData) {
        if (data) {
            hasSavedGame.value = true;
            savedGameInfo.value = data;
        } else {
            this.loadSavedGameState();
        }
    }

    /**
     * 2. MENU ACTIONS - Wire UI events to HUDController
     */
    private setupEventListeners() {
        // Continue game
        document.addEventListener('menu:continue', () => {
            this.handleContinue();
        });

        // Start new game
        document.addEventListener('menu:start-new-game', ((e: CustomEvent) => {
            this.handleStartNewGame(e.detail.name);
        }) as EventListener);

        // Map selected
        document.addEventListener('menu:map-selected', ((e: CustomEvent) => {
            this.handleMapSelected(e.detail.mapId);
        }) as EventListener);

        // Apply settings
        document.addEventListener('menu:apply-settings', ((e: CustomEvent) => {
            this.handleApplySettings(e.detail.settings);
        }) as EventListener);
    }

    /**
     * Handle Continue button click
     */
    private handleContinue() {
        if (!this.hudController) return;

        // If already in game, just resume without re-rendering
        if (this.hudController.hasEnteredGame) {
            showMainMenu.value = false;
            showHUD.value = true;
            this.eventBus.publish(Topics.Game.StateChanged, { state: 'playing' });
            return;
        }

        // Otherwise start game from save/default
        const savedGame = savedGameInfo.value;
        const mapId = savedGame?.mapId || (availableMaps.value[0]?.id);

        if (mapId) {
            this.hudController.renderGame(mapId);
        }
    }

    /**
     * Handle Start New Game
     */
    private handleStartNewGame(name: string) {
        if (!this.hudController) return;

        // Set player name
        this.hudController.setPlayerName(name);
        playerName.value = name;

        // Start with first map
        const firstMap = availableMaps.value[0];
        if (firstMap) {
            this.hudController.renderGame(firstMap.id);
            currentMenuSection.value = 'main';
        }
    }

    /**
     * Handle map selection
     */
    private handleMapSelected(mapId: string) {
        if (!this.hudController) return;
        this.hudController.renderGame(mapId);
    }

    /**
     * Handle settings apply
     */
    private handleApplySettings(settings: VideoSettingsPayload) {
        if (!this.hudController) return;

        // Broadcast settings to the game-side bus; consumers can react (renderer, assets, etc.)
        this.eventBus.publish(Topics.UI.SettingsApplied, { settings });

        // Return to main menu section
        currentMenuSection.value = 'main';
    }

    /**
     * 3. DOM REF MANAGEMENT
     */

    /**
     * Replace HUDController's DOM refs with Preact UI refs
     * This must be called after Preact renders
     */
    updateHUDControllerRefs(attempt: number = 0) {
        if (!this.hudController) return;

        // Wait for next frame to ensure DOM is rendered
        requestAnimationFrame(() => {
            const refs = this.getDOMRefs();
            const coreReady = refs.stats && refs.footer && refs.messageList && refs.messageInput;
            const playerReady = refs.playerName && refs.playerLevel && refs.healthBar && refs.staminaBar;
            const shouldRetry = !(coreReady && playerReady) && attempt < 5;

            if (shouldRetry) {
                this.updateHUDControllerRefs(attempt + 1);
                return;
            }

            // Ensure hud object exists
            this.hudController.hud = this.hudController.hud || {};

            // Update HUDController's hud refs to point to Preact DOM
            this.hudController.hud.info = refs.information;
            this.hudController.hud.stats = refs.stats;
            this.hudController.hud.messageInput = refs.messageInput;
            this.hudController.hud.messageList = refs.messageList;
            this.hudController.hud.footer = refs.footer;
            this.hudController.hud.sideButtons = refs.sideButtons;
            this.hudController.hud.playerName = refs.playerName;
            this.hudController.hud.playerLevel = refs.playerLevel;
            this.hudController.hud.healthBar = refs.healthBar;
            this.hudController.hud.healthText = refs.healthText;
            this.hudController.hud.healthRate = refs.healthRate;
            this.hudController.hud.staminaBar = refs.staminaBar;
            this.hudController.hud.staminaText = refs.staminaText;
            this.hudController.hud.staminaRate = refs.staminaRate;
            this.hudController.hud.energy = refs.energy;

            console.log('HUDController refs connected to Preact DOM');
        });
    }

    /**
     * Get DOM element references for HUDController
     */
    private getDOMRefs() {
        return {
            stats: document.getElementById('HUD-stats'),
            footer: document.getElementById('HUD-footer'),
            messageList: document.getElementById('messageList'),
            messageInput: document.getElementById('messageInput'),
            information: document.getElementById('HUD-information'),
            energy: document.getElementById('HUD-energy') as HTMLProgressElement | null,
            playerName: document.getElementById('HUD-player-name'),
            playerLevel: document.getElementById('HUD-player-level'),
            healthBar: document.getElementById('HUD-health-bar'),
            healthText: document.getElementById('HUD-health-text'),
            healthRate: document.getElementById('HUD-health-rate'),
            staminaBar: document.getElementById('HUD-stamina-bar'),
            staminaText: document.getElementById('HUD-stamina-text'),
            staminaRate: document.getElementById('HUD-stamina-rate'),
            sideButtons: document.querySelector('.skill-bar.side-buttons'),
        };
    }

    /**
     * 4. HUDCONTROLLER METHOD OVERRIDES
     * Since HUDController no longer creates DOM, we override its UI methods
     */
    overrideHUDControllerMethods() {
        if (!this.hudController) return;

        // Override renderMenu
        this.hudController.renderMenu = () => {
            this.eventBus.publish(Topics.Game.StateChanged, { state: 'menu' });
        };

        // Override renderPauseMenu (Esc key)
        this.hudController.renderPauseMenu = () => {
            this.eventBus.publish(Topics.Game.StateChanged, { state: 'paused' });
        };

        // Override renderGame
        this.hudController.renderGame = (mapId: string | null) => {
            console.log('Render map: ', mapId);
            this.hudController.hasEnteredGame = true;

            const map = (availableMaps.value || []).find((m: ATMap) => m.id === mapId);
            if (map) {
                this.eventBus.publish(Topics.UI.HUD.MapSelected, { map });
            } else {
                console.warn('Map is not found for ', mapId);
            }

            showMainMenu.value = false;
            showHUD.value = true;
            this.eventBus.publish(Topics.Game.StateChanged, { state: 'playing' });

            // Re-connect HUD refs now that HUD is visible
            this.updateHUDControllerRefs();
        };

        console.log('HUDController UI methods overridden');
    }

    /**
     * 5. UTILITY METHODS
     */

    toggleDebug(visible: boolean) {
        showDebug.value = visible;
    }

    setPlayerName(name: string) {
        playerName.value = name;
    }

    setPlayerLevel(level: string) {
        playerLevel.value = level;
    }
}
