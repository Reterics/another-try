import menuTemplate from '../pages/menu.html?raw'
import inGameTemplate from '../pages/ingame.html?raw'
import { CreatorController } from "./CreatorController.ts";
import { PlayerNames, PlayerScores } from "../types/main.ts";
import { ATMap } from "../../../types/map.ts";
import { demoMap } from "../models/demoMap.ts";
import * as THREE from 'three';
import EventBus from "@shared/events/EventBus.ts";
import { Topics } from "@shared/events/topics.ts";

export class HUDController {
    private readonly inGame: HTMLDivElement;
    private readonly mainMenu: HTMLDivElement;
    element: HTMLElement|null;
    private _updatePeriod: number;
    private _elapsed: number;
    _preDelta: number;
    private stats: HTMLElement|null;
    private scores: HTMLElement|null;
    private messageInput: HTMLElement|null;
    private messageList: HTMLElement|null;
    private cursor: number;
    private messageBuffer: HTMLElement[];
    private footer: HTMLElement|null;
    private maps: ATMap[];
    private dialog: HTMLDivElement|undefined;
    private side: HTMLDivElement|undefined;
    private readonly bus: EventBus;
    private videoSettings: { lod: 'low' | 'medium' | 'high'; textureQuality: 'low' | 'medium' | 'high'; postfx: 'off' | 'medium' | 'high' } = {
        lod: 'medium',
        textureQuality: 'high',
        postfx: 'medium',
    };
    private playerNameCache: string = 'Traveler';
    private hasEnteredGame = false;

    // New HUD element refs
    private playerNameEl: HTMLElement | null = null;
    private playerLevelEl: HTMLElement | null = null;
    private healthBarEl: HTMLElement | null = null;
    private healthTextEl: HTMLElement | null = null;
    private healthRateEl: HTMLElement | null = null;
    private staminaBarEl: HTMLElement | null = null;
    private staminaTextEl: HTMLElement | null = null;
    private staminaRateEl: HTMLElement | null = null;
    private energyEl: HTMLProgressElement | null = null;

    // Simple health state
    private healthCurrent: number = 100;
    private healthMax: number = 100;
    private lastEnergyValue: number = 0;
    private lastEnergyStamp: number = performance.now();

    constructor(eventBus: EventBus) {
        this.bus = eventBus;
        const inGame = document.createElement('div');
        inGame.id = 'inGame';
        inGame.innerHTML = inGameTemplate;

        const mainMenu = document.createElement('div');
        mainMenu.id = 'mainMenu';
        mainMenu.innerHTML = menuTemplate;
        mainMenu.classList.add('has-bg');

        this.inGame = inGame;
        this.mainMenu = mainMenu;
        document.body.appendChild(this.inGame);
        document.body.appendChild(this.mainMenu);

        this._updatePeriod = 1;
        this._elapsed = 0;
        this._preDelta = 0;

        this.element = document.querySelector('#HUD-information');
        this.stats = document.querySelector('#HUD-stats') as HTMLElement;
        this.scores = document.querySelector('#HUD-information') as HTMLElement;
        this.messageInput = document.querySelector('#messageInput') as HTMLElement;
        this.messageList = document.querySelector('#messageList') as HTMLElement;
        this.footer = document.querySelector('#HUD-footer') as HTMLElement;
        this.side = document.querySelector('.side-buttons') as HTMLDivElement;
        // New element refs
        this.playerNameEl = document.querySelector('#HUD-player-name');
        this.playerLevelEl = document.querySelector('#HUD-player-level');
        this.healthBarEl = document.querySelector('#HUD-health-bar');
        this.healthTextEl = document.querySelector('#HUD-health-text');
        this.healthRateEl = document.querySelector('#HUD-health-rate');
        this.staminaBarEl = document.querySelector('#HUD-stamina-bar');
        this.staminaTextEl = document.querySelector('#HUD-stamina-text');
        this.staminaRateEl = document.querySelector('#HUD-stamina-rate');
        this.energyEl = document.querySelector('#HUD-energy') as HTMLProgressElement | null;

        this.mainMenu.onclick = (event: MouseEvent) => {
            const target: HTMLElement = event.target as HTMLElement;
            if (target && target.parentElement && target.parentElement.id === 'maps' && target.id) {
                const level = target.id;
                this.renderGame(level);
            }
        };
        this.maps = [
            demoMap
        ];

        this.bindMainMenu();
        this.updateSaveAvailability();

        this.cursor = 0;
        this.messageBuffer = [];
    }

    private bindMainMenu() {
        const enterButton = this.mainMenu.querySelector('.primary-btn');
        const continueItem = this.mainMenu.querySelector('[data-action="continue"]');
        const newGameItem = this.mainMenu.querySelector('[data-action="new-game"]');
        const settingsItem = this.mainMenu.querySelector('[data-action="settings"]');
        const newGameSection = this.mainMenu.querySelector('#new-game-section') as HTMLElement | null;
        const settingsSection = this.mainMenu.querySelector('#settings-section') as HTMLElement | null;
        const newNameInput = this.mainMenu.querySelector('#menu-player-name') as HTMLInputElement | null;
        const startNewBtn = this.mainMenu.querySelector('#menu-start-new') as HTMLButtonElement | null;
        const applySettingsBtn = this.mainMenu.querySelector('#menu-apply-settings') as HTMLButtonElement | null;
        const hintSection = this.mainMenu.querySelector('#menu-hint') as HTMLElement | null;
        const menuPanel = this.mainMenu.querySelector('.menu-panel') as HTMLElement | null;
        try {
            const storedName = localStorage.getItem('player:name');
            if (storedName && newNameInput) newNameInput.value = storedName;
        } catch (_) { /* ignore */ }

        const showSection = (section: HTMLElement | null) => {
            if (!newGameSection || !settingsSection) return;
            const showingSettings = section === settingsSection;
            const showingNewGame = section === newGameSection;
            newGameSection.style.display = showingNewGame ? 'block' : 'none';
            settingsSection.style.display = showingSettings ? 'block' : 'none';
            if (hintSection) {
                hintSection.style.display = section ? 'none' : 'block';
            }
            if (menuPanel) {
                if (showingSettings || showingNewGame) {
                    menuPanel.classList.add('submenu-open');
                } else {
                    menuPanel.classList.remove('submenu-open');
                }
                if (showingSettings) {
                    menuPanel.classList.add('settings-open');
                } else {
                    menuPanel.classList.remove('settings-open');
                }
            }
        };

        const resumeIfPaused = () => {
            if (this.hasEnteredGame) {
                this.inGame.style.display = 'block';
                this.mainMenu.style.display = 'none';
                this.mainMenu.classList.remove('has-bg');
                return true;
            }
            return false;
        };

        if (continueItem) {
            continueItem.addEventListener('click', (event) => {
                event.preventDefault();
                if (resumeIfPaused()) {
                    return;
                }
                const save = this.readSaveGame();
                const mapId = save?.mapId || (this.maps[0] ? this.maps[0].id : null);
                if (!mapId) return;
                this.renderGame(mapId);
                showSection(null);
            });
        }
        if (enterButton) {
            enterButton.addEventListener('click', (event) => {
                event.preventDefault();
                if (resumeIfPaused()) {
                    return;
                }
                const save = this.readSaveGame();
                const mapId = save?.mapId || (this.maps[0] ? this.maps[0].id : null);
                if (!mapId) return;
                this.renderGame(mapId);
                showSection(null);
            });
        }
        if (newGameItem) {
            newGameItem.addEventListener('click', (event) => {
                event.preventDefault();
                showSection(newGameSection);
                newNameInput?.focus();
            });
        }
        if (settingsItem) {
            settingsItem.addEventListener('click', (event) => {
                event.preventDefault();
                this.loadVideoSettingsIntoUI();
                showSection(settingsSection);
            });
        }
        if (startNewBtn) {
            startNewBtn.addEventListener('click', (event) => {
                event.preventDefault();
                const name = (newNameInput?.value || '').trim() || 'Traveler';
                try {
                    localStorage.setItem('player:name', name);
                } catch (_) { /* ignore */ }
                this.setPlayerName(name);
                const firstMap = this.maps[0];
                this.renderGame(firstMap ? firstMap.id : null);
                showSection(null);
            });
        }
        if (applySettingsBtn) {
            applySettingsBtn.addEventListener('click', (event) => {
                event.preventDefault();
                this.saveVideoSettingsFromUI();
                showSection(null);
            });
        }

        this.loadVideoSettingsIntoUI();
    }

    updateSaveAvailability(saveData?: { name?: string; date?: string }) {
        const parsed = saveData ?? this.readSaveGame();
        const hasSave = !!parsed;
        const continueItem = this.mainMenu.querySelector('[data-action="continue"]') as HTMLElement | null;
        const profileEl = this.mainMenu.querySelector('.menu-footer span strong') as HTMLElement | null;
        const autosaveEl = this.mainMenu.querySelector('.menu-footer span:last-child strong') as HTMLElement | null;
        if (continueItem) {
            continueItem.classList.toggle('disabled', !hasSave);
        }
        if (profileEl) {
            profileEl.textContent = parsed?.name || 'New Profile';
        }
        if (autosaveEl) {
            autosaveEl.textContent = parsed?.date ? new Date(parsed.date).toLocaleString() : 'No save';
        }
    }

    private readSaveGame(): { name: string; date: string; coords?: any; mapId?: string } | null {
        try {
            const raw = localStorage.getItem('saveGame');
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (parsed && parsed.name && parsed.date) return parsed;
        } catch (_) { /* ignore */ }
        return null;
    }

    private readStoredVideoSettings() {
        try {
            const raw = localStorage.getItem('video:settings');
            if (raw) {
                const parsed = JSON.parse(raw);
                this.videoSettings = {
                    lod: parsed.lod ?? this.videoSettings.lod,
                    textureQuality: parsed.textureQuality ?? this.videoSettings.textureQuality,
                    postfx: parsed.postfx ?? this.videoSettings.postfx,
                };
            }
        } catch (_) { /* ignore */ }
    }

    private loadVideoSettingsIntoUI() {
        this.readStoredVideoSettings();
        const lod = this.mainMenu.querySelector('#menu-lod') as HTMLSelectElement | null;
        const tex = this.mainMenu.querySelector('#menu-texture-quality') as HTMLSelectElement | null;
        const postfx = this.mainMenu.querySelector('#menu-postfx') as HTMLSelectElement | null;
        if (lod) lod.value = this.videoSettings.lod;
        if (tex) tex.value = this.videoSettings.textureQuality;
        if (postfx) postfx.value = this.videoSettings.postfx;
    }

    private saveVideoSettingsFromUI() {
        const lod = (this.mainMenu.querySelector('#menu-lod') as HTMLSelectElement | null)?.value as 'low' | 'medium' | 'high' | undefined;
        const tex = (this.mainMenu.querySelector('#menu-texture-quality') as HTMLSelectElement | null)?.value as 'low' | 'medium' | 'high' | undefined;
        const postfx = (this.mainMenu.querySelector('#menu-postfx') as HTMLSelectElement | null)?.value as 'off' | 'medium' | 'high' | undefined;
        if (lod) this.videoSettings.lod = lod;
        if (tex) this.videoSettings.textureQuality = tex;
        if (postfx) this.videoSettings.postfx = postfx;
        try {
            localStorage.setItem('video:settings', JSON.stringify(this.videoSettings));
        } catch (_) { /* ignore */ }
        console.info('[HUD] Applied video settings', this.videoSettings);
    }

    renderMenu() {
        this.inGame.style.display = 'none';
        this.mainMenu.style.display = 'flex';
        this.mainMenu.classList.add('has-bg');
    }

    renderPauseMenu() {
        this.inGame.style.display = 'none';
        this.mainMenu.style.display = 'flex';
        this.mainMenu.classList.remove('has-bg');
    }

    switchPauseMenu() {
        this.renderPauseMenu();
    }


    renderGame (id: string|null) {
        console.log('Render map: ', id);
        this.hasEnteredGame = true;
        this.inGame.style.display = 'block';
        this.mainMenu.style.display = 'none';
        this.mainMenu.classList.remove('has-bg');
        const map = this.maps.find(map=>map.id === id);
        if (map) {
            this.bus.publish(Topics.UI.HUD.MapSelected, { map });
        } else {
            console.warn('Map is not found for ', id);
        }
    }

    updateText (string: string|number, target: HTMLElement|null) {
        if(target) {
            target.innerHTML = String(string);
        }
    }

    updateLines (string: (string|number)[], target: HTMLElement|null) {
        this.updateText(string.join('<br>'), target);
    }

    setPlayerName(name: string) {
        this.playerNameCache = name;
        if (this.playerNameEl) this.playerNameEl.textContent = name;
    }

    getPlayerName(): string {
        return this.playerNameCache;
    }

    setPlayerLevel(text: string) {
        if (this.playerLevelEl) this.playerLevelEl.textContent = text;
    }

    setHealth(current: number, max: number, ratePerSec?: number) {
        this.healthCurrent = Math.max(0, Math.min(current, max));
        this.healthMax = Math.max(1, max);
        const ratio = this.healthCurrent / this.healthMax;
        if (this.healthBarEl) (this.healthBarEl as HTMLElement).style.transform = `scaleX(${ratio})`;
        if (this.healthTextEl) this.healthTextEl.textContent = `${Math.round(this.healthCurrent)} / ${Math.round(this.healthMax)}`;
        if (this.healthRateEl) this.healthRateEl.textContent = ratePerSec ? `${ratePerSec > 0 ? '+' : ''}${Math.round(ratePerSec)} / s` : '';
    }

    applyDamage(amount: number) {
        this.setHealth(this.healthCurrent - amount, this.healthMax);
    }

    private updateStaminaFromEnergy() {
        if (!this.energyEl) return;
        const now = performance.now();
        const energy = this.energyEl.value;
        const max = this.energyEl.max || 1;
        const ratio = max ? energy / max : 0;
        if (this.staminaBarEl) (this.staminaBarEl as HTMLElement).style.transform = `scaleX(${ratio})`;
        if (this.staminaTextEl) this.staminaTextEl.textContent = `${Math.round(energy)} / ${Math.round(max)}`;
        // compute rate per second based on delta time
        const dt = (now - this.lastEnergyStamp) / 1000;
        if (dt > 0.2) {
            const dE = energy - this.lastEnergyValue;
            const rate = dE / dt;
            if (this.staminaRateEl) this.staminaRateEl.textContent = `${rate >= 0 ? '+' : ''}${Math.round(rate)} / s`;
            this.lastEnergyValue = energy;
            this.lastEnergyStamp = now;
        }
    }

    update(delta: number|null, controller: CreatorController) {
        const d = delta || this._preDelta;
        this._elapsed += d;
        if (delta !== null) {
            this._preDelta = delta;
        }

        // Always reflect stamina from TerrainManager's energy progress
        this.updateStaminaFromEnergy();
        if (this._elapsed >= this._updatePeriod || delta === null) {
            this._elapsed = 0;

            const tableData = [
                Math.round(1 / d) + " FPS"
            ];

            // @ts-ignore
            if (window.performance && window.performance.memory) {
                // @ts-ignore
                const memory = window.performance.memory;
                tableData.push(Math.round(memory.usedJSHeapSize / 1048576) + " / "
                    + Math.round(memory.jsHeapSizeLimit / 1048576) + " (MB Memory)");
            }
            if (controller.active === 'far') {
                tableData.push("Far: " + controller.far);
            } else if (controller.active === 'precision') {
                tableData.push("Precision: " + controller.precision);
            } else if (controller.active === 'size') {
                tableData.push("Size/Scale: " + controller.getScale());
            }

            if (controller.reference) {
                tableData.push("Selected object: " + (controller.reference.type !== "model" ?
                    controller.reference.type :
                    controller.reference.name || controller.reference.id || ""));
            }
            if (controller.active !== 'pointer') {
                tableData.push("Object: " + controller.shadowTypes[controller.shadowTypeIndex].name);
            }

            const position = controller.getPosition();

            // Compute camera heading (0-360, 0 = North (+Z), XZ-plane)
            let headingText = '';
            try {
                const cam = controller.controls?.object as THREE.Camera | undefined;
                if (cam) {
                    const dir = new THREE.Vector3();
                    cam.getWorldDirection(dir);
                    // Project onto XZ plane
                    dir.y = 0;
                    if (dir.lengthSq() > 1e-6) {
                        dir.normalize();
                        // atan2(x, z) gives 0 at +Z, 90 at +X, 180 at -Z, 270 at -X
                        let deg = Math.atan2(dir.x, dir.z) * 180 / Math.PI;
                        if (deg < 0) deg += 360;
                        headingText = '  Heading: ' + Math.round(deg).toString().padStart(3, ' ') + '°';
                    }
                }
            } catch (e) {
                // ignore heading errors
            }

            this.updateText('X: ' + position.x.toFixed(2) +
                ' Y: ' + position.y.toFixed(2) +
                ' Z: ' + position.z.toFixed(2) + headingText, this.footer);

            this.updateLines(tableData, this.stats);
        }
    }

    updateScores(playerNames: PlayerNames, scores: PlayerScores) {
        let output = ""
        let player
        let loops = 0
        for (player in playerNames) {
            output += "<b>" + playerNames[player] + ": </b>"

            if(scores[player] == null) {
                output += "0"
            }
            else {
                output += scores[player] + ""
            }

            loops += 1


            if(loops != Object.keys(playerNames).length) {
                output += ", "
            }
        }
        if (this.scores) {
            this.scores.innerHTML = output;
        }
    }


    bufferMessage(message: string) {
        const messageDiv = this.onMessage(message);
        if (messageDiv) {
            messageDiv.classList.add('unsent');
            this.messageBuffer.push(messageDiv);
        }
    }
    onMessage(message: string) {
        if (this.messageList) {
            const div = document.createElement('div');
            div.innerHTML = message;
            this.messageList.appendChild(div);
            this.messageList.scrollTop = this.messageList.scrollHeight;
            const index = this.messageBuffer.findIndex(element=>element.innerText === message);
            if (index !== -1) {
                this.messageBuffer[index].outerHTML = '';
                this.messageBuffer = this.messageBuffer.splice(index, 1);
            } else if(this.messageBuffer.length >= 3) {
                const first = this.messageBuffer.shift();
                if (first) {
                    first.outerHTML = '';
                }
            }
            return div;
        }
    }

    toggleChat() {
        if (this.messageInput && this.messageList && this.messageList.parentElement) {
            const visible = window.getComputedStyle(this.messageInput).display !== 'none';
            if (visible) {
                this.messageInput.style.display = "none";
            } else {
                this.messageInput.style.display = "flex";
            }
        }
    }

    isChatActive(): boolean {
        if (!this.messageInput) return false;
        return window.getComputedStyle(this.messageInput).display !== 'none';
    }

    getMessage(html = false): string {
        if (this.messageInput) {
            if (html) {
                return this.messageInput.innerHTML;
            }
            return this.messageInput.innerText;
        }
        return "";
    }

    clearMessage() {
        if (this.messageInput) {
            this.messageInput.innerHTML = "";
            this.cursor = 0;

        }
    }

    type(key: string) {
        if (this.messageInput) {
            const message = this.messageInput.innerText;
            const beforeCursor = message.substring(0, this.cursor);
            const afterCursor = message.substring(this.cursor);
            this.messageInput.innerText = beforeCursor + key + afterCursor;
            this.cursor+=key.length;
        }
    }

    backspace() {
        if (this.messageInput && this.cursor) {
            const message = this.messageInput.innerText;
            const beforeCursor = message.substring(0, this.cursor - 1);
            const afterCursor = message.substring(this.cursor);
            this.messageInput.innerText = beforeCursor + afterCursor;
            this.cursor--;
        }
    }

    delete () {
        if (this.messageInput) {
            const message = this.messageInput.innerText;
            const beforeCursor = message.substring(0, this.cursor);
            const afterCursor = message.substring(this.cursor + 1);
            this.messageInput.innerText = beforeCursor + afterCursor;
        }
    }

    updateCursor(delta: number) {
        this.cursor += delta;
        if (this.messageInput) {
            if (this.cursor >= this.messageInput.innerText.length) {
                this.cursor--;
            }
            if (this.cursor < 0) {
                this.cursor = 0;
            }
        } else {
            this.cursor = 0;
        }
    }


    getMaps() {
        return this.maps;
    }

    setMaps(maps: ATMap[]) {
        this.maps = maps;
    }

    renderMaps() {
        let mapsParent = this.mainMenu.querySelector('#maps');
        if (!mapsParent) {
            mapsParent = document.createElement('div');
            mapsParent.id = 'maps';
            this.mainMenu.appendChild(mapsParent);
        }
        mapsParent.innerHTML = '';
        this.maps.forEach(map=>{
            const a = document.createElement('a');
            a.id = map.id;
            a.innerHTML = map.name || 'Play';
            mapsParent?.appendChild(a);
        });
    }

    openDialog(title: string, body: string | Element | Node) {
        this.dialog = this.dialog || document.createElement('div');
        this.dialog.innerHTML = '';
        this.dialog.classList.add('modal');

        const header = document.createElement('div');
        header.classList.add('header');
        header.innerHTML = '<h3 class="title">' + title + '</h3>'

        const content = document.createElement('div');
        content.classList.add('body');
        if (typeof body === 'string') {
            content.innerHTML = body;
        } else if (body instanceof Element || body instanceof Node) {
            content.appendChild(body);
        }

        this.dialog.appendChild(header);
        this.dialog.appendChild(content);
        document.body.appendChild(this.dialog);
    }

    updateDialog(body: string | Element | Node) {
        if (this.dialog) {
            if (typeof body === 'string') {
                this.dialog.innerHTML = body;
            } else if (body instanceof Element || body instanceof Node) {
                this.dialog.appendChild(body);
            }
        }
    }

    closeDialog() {
        if (this.dialog) {
            this.dialog.outerHTML = '';
            this.dialog = undefined;
        }
    }

    setActiveSide(active: string) {
        if (!this.side) {
            return;
        }
        const activeNode = this.side.querySelector('[data-active=' + active + ']');
        this.side.querySelectorAll('.side-button').forEach(node=>{
            if (node === activeNode) {
                node.classList.add('selected');
            } else {
                node.classList.remove('selected');
            }
        });
    }
}
