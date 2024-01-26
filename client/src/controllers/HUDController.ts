import menuTemplate from '../pages/menu.html?raw'
import pauseMenuTemplate from '../pages/pause.html?raw'
import inGameTemplate from '../pages/ingame.html?raw'
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls";
import {CreatorController} from "./CreatorController.ts";

interface MapOptions {
    y?: number|string;
    x?: number|string;
    z?: number|string;
}

export class HUDController {
    private readonly inGame: HTMLDivElement;
    private readonly mainMenu: HTMLDivElement;
    private readonly pauseMenu: HTMLDivElement;
    private controls: PointerLockControls | undefined;
    private onload: Function|undefined;
    element: HTMLElement|null;
    private updatePeriod: number;
    private _elapsed: number;
    _preDelta: number;
    private stats: HTMLElement|null;

    constructor() {
        // We use createElement because it is DOM level 1 feature, faster than innerHTML
        const inGame = document.createElement('div');
        inGame.id = 'inGame';
        inGame.innerHTML = inGameTemplate;

        const mainMenu = document.createElement('div');
        mainMenu.id = 'mainMenu';
        mainMenu.innerHTML = menuTemplate;

        const pauseMenu = document.createElement('div');
        pauseMenu.id = 'pauseMenu';
        pauseMenu.innerHTML = pauseMenuTemplate;

        this.inGame = inGame;
        this.mainMenu = mainMenu;
        this.pauseMenu = pauseMenu;
        document.body.appendChild(this.inGame);
        document.body.appendChild(this.mainMenu);
        document.body.appendChild(this.pauseMenu);


        this.updatePeriod = 1;
        this._elapsed = 0;
        this._preDelta = 0;

        this.element = document.querySelector('#HUD-information');
        this.stats = document.querySelector('#HUD-stats');
        if(!this.element) {
            this._loadHUD();
        }
    }

    _loadHUD() {
        const el = document.querySelector('#HUD-information');
        if (!el) {
            return setTimeout(()=>{
                this._loadHUD.bind(this);
            }, 200);
        }
        this.element = el as HTMLElement;
        this.stats = document.querySelector('#HUD-stats') as HTMLElement;
    }
    setControls(controls: PointerLockControls) {
        if (!controls) {
            return;
        }
        this.controls = controls;

        this.mainMenu.onclick = (event: MouseEvent) => {
            const target: HTMLElement = event.target as HTMLElement;
            if (target && target.parentElement && target.parentElement.id === 'maps' && target.id) {
                const level = target.getAttribute('data-location') || target.id;
                console.log('Selected map: ', level);
                this.renderGame(level, target);
            }
        };
        this.pauseMenu.onclick = () => {
            this.renderGame(null, null);
        };
        this.controls.addEventListener( 'unlock', () => {
            this.renderPauseMenu();
        } );
    }

    renderMenu() {
        this.inGame.style.display = 'none';
        this.pauseMenu.style.display = 'none';
        this.mainMenu.style.display = 'block';
    }

    renderPauseMenu() {
        this.inGame.style.display = 'none';
        this.pauseMenu.style.display = 'block';
        this.mainMenu.style.display = 'none';
    }

    getOptionsFromNode(node: HTMLElement|null|undefined) {
        const options = {};

        if (node) {
            ['x', 'y', 'z'].forEach(key=>{
                const value = node.getAttribute('data-' + key);
                if (value) {
                    // @ts-ignore
                    options[key] = value;
                }
            });
        }
        return options;
    }

    renderGame (level: string|null, node: HTMLElement|null|undefined) {
        console.log('Render level: ', level);
        this.inGame.style.display = 'block';
        this.pauseMenu.style.display = 'none';
        this.mainMenu.style.display = 'none';
        if (this.controls && typeof this.controls.lock === 'function') {
            this.controls.lock();
        }
        if (this.onload && level) {
            this.onload(level, this.getOptionsFromNode(node));
        }
    }

    onLoadMap(param: (selectedMap: string, options: MapOptions) => void) {
        this.onload = param;
    }

    updateText (string: string|number, target: HTMLElement|null) {
        if(target) {
            target.innerHTML = String(string);
        }
    }

    updateLines (string: (string|number)[], target: HTMLElement|null) {
        this.updateText(string.join('<br>'), target);
    }

    update(delta: number|null, controller: CreatorController) {
        const d = delta || this._preDelta;
        this._elapsed += d;
        if (delta !== null) {
            this._preDelta = delta;
        }

        if (this._elapsed >= this.updatePeriod || delta === null) {
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

            tableData.push("Far: " + controller.far);
            tableData.push("Mode: " + controller.active + " (KeyR)");
            tableData.push("Precision: " + controller.precision);
            if (controller.reference) {
                tableData.push("Selected object: " + (controller.reference.type !== "model" ?
                    controller.reference.type :
                    controller.reference.name || controller.reference.id || ""));
            }


            this.updateLines(tableData, this.stats);
        }
    }
}
