import { CreatorController } from "./CreatorController.ts";
import { PlayerNames, PlayerScores } from "../types/main.ts";
import { ATMap } from "../../../types/map.ts";
import { demoMap } from "../models/demoMap.ts";
import * as THREE from 'three';
import { EventBus, Topics } from "@game/shared";

export class HUDController {
    // UI integration is handled by the Preact bridge; we keep only state and emit via EventBus.
    private _updatePeriod: number;
    private _elapsed: number;
    _preDelta: number;
    private cursor: number;
    private messageText: string;
    private chatActive: boolean;
    private maps: ATMap[];
    private readonly bus: EventBus;
    private playerNameCache: string = 'Traveler';
    public hasEnteredGame = false;

    // Simple health state
    private healthCurrent: number = 100;
    private healthMax: number = 100;

    constructor(eventBus: EventBus) {
        this.bus = eventBus;

        this._updatePeriod = 1;
        this._elapsed = 0;
        this._preDelta = 0;

        this.maps = [
            demoMap
        ];

        this.cursor = 0;
        this.messageText = '';
        this.chatActive = false;
    }

    renderMenu() {
        this.bus.publish(Topics.Game.StateChanged, { state: 'menu' });
    }

    renderPauseMenu() {
        this.bus.publish(Topics.Game.StateChanged, { state: 'paused' });
    }

    renderGame (id: string|null) {
        console.log('Render map: ', id);
        // Note: This method is overridden by GameUIBridge
        const map = this.maps.find(map=>map.id === id);
        if (map) {
            this.bus.publish(Topics.UI.HUD.MapSelected, { map });
            this.bus.publish(Topics.Game.StateChanged, { state: 'playing' });
            this.hasEnteredGame = true;
        } else {
            console.warn('Map is not found for ', id);
        }
    }

    setPlayerName(name: string) {
        this.playerNameCache = name;
        this.bus.publish(Topics.Player.NameChanged, { name });
    }

    getPlayerName(): string {
        return this.playerNameCache;
    }

    setPlayerLevel(text: string) {
        this.bus.publish(Topics.Player.LevelChanged, { level: text });
    }

    setHealth(current: number, max: number, ratePerSec?: number) {
        this.healthCurrent = Math.max(0, Math.min(current, max));
        this.healthMax = Math.max(1, max);
        this.bus.publish(Topics.Player.HealthChanged, {
            current: this.healthCurrent,
            max: this.healthMax,
            regenRate: ratePerSec ?? 0,
        });
    }

    applyDamage(amount: number) {
        this.setHealth(this.healthCurrent - amount, this.healthMax);
    }

    update(delta: number|null, controller: CreatorController) {
        const d = delta || this._preDelta;
        this._elapsed += d;
        if (delta !== null) {
            this._preDelta = delta;
        }

        if (this._elapsed >= this._updatePeriod || delta === null) {
            this._elapsed = 0;

            const lines: string[] = [];
            const fps = d > 0 ? Math.round(1 / d) : 0;
            lines.push(`${fps} FPS`);

            try {
                // @ts-ignore
                const memory = window.performance?.memory;
                if (memory) {
                    lines.push(`${Math.round(memory.usedJSHeapSize / 1048576)} / ${Math.round(memory.jsHeapSizeLimit / 1048576)} MB`);
                }
            } catch (_) { /* ignore */ }

            if (controller.active === 'far') {
                lines.push(`Far: ${controller.far}`);
            } else if (controller.active === 'precision') {
                lines.push(`Precision: ${controller.precision}`);
            } else if (controller.active === 'size') {
                lines.push(`Size/Scale: ${controller.getScale()}`);
            }

            if (controller.reference) {
                lines.push(`Selected object: ${controller.reference.type !== "model" ?
                    controller.reference.type :
                    controller.reference.name || controller.reference.id || ""}`);
            }
            if (controller.active !== 'pointer') {
                lines.push(`Object: ${controller.shadowTypes[controller.shadowTypeIndex].name}`);
            }

            const position = controller.getPosition();
            lines.push(`X: ${position.x.toFixed(2)} Y: ${position.y.toFixed(2)} Z: ${position.z.toFixed(2)}`);

            // Compute camera heading (0-360, 0 = North (+Z), XZ-plane)
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
                        lines.push(`Heading: ${Math.round(deg).toString().padStart(3, ' ')}°`);
                    }
                }
            } catch (_) { /* ignore heading errors */ }

            this.bus.publish(Topics.HUD.DebugInfo, { lines });
        }
    }

    updateScores(playerNames: PlayerNames, scores: PlayerScores) {
        const parts: string[] = [];
        Object.keys(playerNames || {}).forEach((id) => {
            const name = playerNames[id];
            const score = scores[id] ?? 0;
            parts.push(`${name}: ${score}`);
        });
        if (parts.length > 0) {
            this.bus.publish(Topics.Chat.MessageReceived, {
                text: `Scores - ${parts.join(', ')}`,
                author: 'server',
                status: 'sent',
            });
        }
    }

    bufferMessage(message: string) {
        this.bus.publish(Topics.Chat.MessageReceived, {
            text: message,
            author: 'you',
            status: 'pending',
            html: message,
        });
    }
    onMessage(message: string) {
        this.bus.publish(Topics.Chat.MessageReceived, {
            text: message,
            status: 'sent',
            html: message,
        });
    }

    toggleChat() {
        const active = !this.chatActive;
        this.chatActive = active;
        this.bus.publish(Topics.Chat.StateChanged, {
            text: this.messageText,
            cursor: this.cursor,
            active,
        });
    }

    isChatActive(): boolean {
        return this.chatActive;
    }

    getMessage(): string {
        return this.messageText;
    }

    clearMessage() {
        this.cursor = 0;
        this.messageText = '';
        this.bus.publish(Topics.Chat.StateChanged, {
            text: '',
            cursor: 0,
            active: false,
        });
    }

    type(key: string) {
        const before = this.messageText.slice(0, this.cursor);
        const after = this.messageText.slice(this.cursor);
        this.messageText = before + key + after;
        this.cursor += key.length;
        this.bus.publish(Topics.Chat.StateChanged, {
            text: this.messageText,
            cursor: this.cursor,
            active: true,
        });
    }

    backspace() {
        if (this.cursor === 0) return;
        this.messageText = this.messageText.slice(0, this.cursor - 1) + this.messageText.slice(this.cursor);
        this.cursor = Math.max(0, this.cursor - 1);
        this.bus.publish(Topics.Chat.StateChanged, {
            text: this.messageText,
            cursor: this.cursor,
            active: true,
        });
    }

    delete () {
        if (this.cursor < this.messageText.length) {
            this.messageText = this.messageText.slice(0, this.cursor) + this.messageText.slice(this.cursor + 1);
            this.bus.publish(Topics.Chat.StateChanged, {
                text: this.messageText,
                cursor: this.cursor,
                active: true,
            });
        }
    }

    updateCursor(delta: number) {
        this.cursor += delta;
        this.cursor = Math.max(0, Math.min(this.messageText.length, this.cursor));
        this.bus.publish(Topics.Chat.StateChanged, {
            text: this.messageText,
            cursor: this.cursor,
            active: this.isChatActive(),
        });
    }


    getMaps() {
        return this.maps;
    }

    setMaps(maps: ATMap[]) {
        this.maps = maps;
    }

    setActiveSide(active: string) {
        this.bus.publish(Topics.HUD.ToolChanged, { active });
    }
}
