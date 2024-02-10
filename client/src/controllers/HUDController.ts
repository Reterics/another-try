import menuTemplate from '../pages/menu.html?raw'
import pauseMenuTemplate from '../pages/pause.html?raw'
import inGameTemplate from '../pages/ingame.html?raw'
import {CreatorController} from "./CreatorController.ts";
import {PlayerNames, PlayerScores} from "../types/main.ts";
import {EventManager} from "../lib/EventManager.ts";
import {ATMap} from "../../../types/map.ts";

export class HUDController extends EventManager{
    private readonly inGame: HTMLDivElement;
    private readonly mainMenu: HTMLDivElement;
    private readonly pauseMenu: HTMLDivElement;
    element: HTMLElement|null;
    private _updatePeriod: number;
    private _elapsed: number;
    _preDelta: number;
    private stats: HTMLElement|null;
    private scores: HTMLElement|null;
    private messageInput: HTMLElement|null;
    private messageList: HTMLElement|null;
    private footer: HTMLElement|null;
    private maps: ATMap[];

    constructor() {
        super();
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


        this._updatePeriod = 1;
        this._elapsed = 0;
        this._preDelta = 0;

        this.element = document.querySelector('#HUD-information');
        this.stats = document.querySelector('#HUD-stats') as HTMLElement;
        this.scores = document.querySelector('#HUD-information') as HTMLElement;
        this.messageInput = document.querySelector('#messageInput') as HTMLElement;
        this.messageList = document.querySelector('#messageList') as HTMLElement;
        this.footer = document.querySelector('#HUD-footer') as HTMLElement;
        if(!this.element) {
            this._loadHUD();
        }


        this.mainMenu.onclick = (event: MouseEvent) => {
            const target: HTMLElement = event.target as HTMLElement;
            if (target && target.parentElement && target.parentElement.id === 'maps' && target.id) {
                const level = target.id;
                this.renderGame(level);
            }
        };
        this.pauseMenu.onclick = () => {
            this.renderGame(null);
        };

        this.maps = [
            {
                // For development purposes
                id: 'fallback',
                name: 'Scene on Siménai by hillforts.eu',
                items: [
                    {
                        type: "model",
                        path: 'assets/scenes/simenai/simenai.glb',
                        name: 'simenai'
                    }
                ]
            }
        ];
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
        this.scores = document.querySelector('#HUD-information') as HTMLElement;
        this.messageInput = document.querySelector('#messageInput') as HTMLElement;
        this.messageList = document.querySelector('#messageList') as HTMLElement;
        this.footer = document.querySelector('#HUD-footer') as HTMLElement;
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

    renderGame (id: string|null) {
        console.log('Render map: ', id);
        this.inGame.style.display = 'block';
        this.pauseMenu.style.display = 'none';
        this.mainMenu.style.display = 'none';
        const map = this.maps.find(map=>map.id === id);
        if (map) {
            this.emit('map:select', map);
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

    update(delta: number|null, controller: CreatorController) {
        const d = delta || this._preDelta;
        this._elapsed += d;
        if (delta !== null) {
            this._preDelta = delta;
        }

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

            tableData.push("Far: " + controller.far);
            tableData.push("Mode: " + controller.active + " (KeyR)");
            tableData.push("Precision: " + controller.precision);
            if (controller.reference) {
                tableData.push("Selected object: " + (controller.reference.type !== "model" ?
                    controller.reference.type :
                    controller.reference.name || controller.reference.id || ""));
            }
            if (controller.active !== 'pointer') {
                tableData.push("Object: " + controller.shadowTypes[controller.shadowTypeIndex].name);
            }

            const position = controller.getPosition();
            this.updateText('X: ' + position.x.toFixed(2) +
                ' Y: ' + position.y.toFixed(2) +
                ' Z: ' + position.z.toFixed(2), this.footer);

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


    onMessage(message: string) {
        if (this.messageList) {
            const div = document.createElement('div');
            div.innerHTML = message;
            this.messageList.appendChild(div);
            this.messageList.scrollTop = this.messageList.scrollHeight;
        }
    }

    toggleChat() {
        if (this.messageInput && this.messageList && this.messageList.parentElement) {
            if (this.messageInput.style.display !== 'none') {
                this.messageInput.style.display = "none";
                this.messageList.parentElement.style.backgroundColor = '#4e4e4e4f';
            } else {
                this.messageInput.style.display = "flex";
                this.messageList.parentElement.style.backgroundColor = '#808080';
            }
        }
    }

    isChatActive(): boolean {
        return !!(this.messageInput && this.messageInput.style.display !== 'none');
    }

    getMessage(): string {
        if (this.messageInput) {
            return this.messageInput.innerHTML;
        }

        return "";
    }

    clearMessage() {
        if (this.messageInput) {
            this.messageInput.innerHTML = "";
        }
    }

    type(key: string) {
        if (this.messageInput) {
            return this.messageInput.innerText += key;
        }
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
}
