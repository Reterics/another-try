import menuTemplate from '../pages/menu.html?raw'
import pauseMenuTemplate from '../pages/pause.html?raw'
import inGameTemplate from '../pages/ingame.html?raw'
import { CreatorController } from "./CreatorController.ts";
import { PlayerNames, PlayerScores } from "../types/main.ts";
import { EventManager } from "../lib/EventManager.ts";
import { ATMap } from "../../../types/map.ts";
import { demoMap } from "../models/demoMap.ts";

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
    private cursor: number;
    private messageBuffer: HTMLElement[];
    private footer: HTMLElement|null;
    private maps: ATMap[];
    private dialog: HTMLDivElement|undefined;
    private side: HTMLDivElement|undefined;

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
        this.side = document.querySelector('.side-buttons') as HTMLDivElement;


        this.mainMenu.onclick = (event: MouseEvent) => {
            const target: HTMLElement = event.target as HTMLElement;
            if (target && target.parentElement && target.parentElement.id === 'maps' && target.id) {
                const level = target.id;
                this.renderGame(level);
            }
        };
        this.pauseMenu.onclick = (e) => {
            const target = e.target as Element;
            let pauseParent = document.getElementById('pauseParent');

            const targetId = target ? target.getAttribute('data-target') : null;
            if (targetId === 'menu') {
                return this.renderMenu();
            }
            const targetNode = targetId ? document.getElementById(targetId) : null;
            if (!targetNode) {
                return this.renderGame(null);
            }

            if (!pauseParent) {
                pauseParent = targetNode.parentElement;
            }
            if (pauseParent) {
                for(let i = 0; i < pauseParent.children.length; i++) {
                    const element = pauseParent.children[i] as HTMLElement;
                    if (element === targetNode) {
                        element.style.display = 'block';
                    } else {
                        element.style.display = 'none';
                    }
                }
            }
        };

        this.maps = [
            demoMap
        ];

        this.cursor = 0;
        this.messageBuffer = [];
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

    switchPauseMenu() {
        if (this.pauseMenu.style.display === 'none') {
            this.renderPauseMenu();
        } else {
            this.inGame.style.display = 'block';
            this.pauseMenu.style.display = 'none';
            this.mainMenu.style.display = 'none';
        }
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
            if (this.messageInput.style.display !== 'none') {
                this.messageInput.style.display = "none";
                // this.messageList.parentElement.style.backgroundColor = '#4e4e4e4f';
            } else {
                this.messageInput.style.display = "flex";
                // this.messageList.parentElement.style.backgroundColor = '#808080';
            }
        }
    }

    isChatActive(): boolean {
        return !!(this.messageInput && this.messageInput.style.display !== 'none');
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
