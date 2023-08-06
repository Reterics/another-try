import menuTemplate from './pages/menu.html?raw'
import pauseMenuTemplate from './pages/pause.html?raw'
import inGameTemplate from './pages/ingame.html?raw'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

export class HUDController {
    private inGame: HTMLDivElement;
    private mainMenu: HTMLDivElement;
    private pauseMenu: HTMLDivElement;
    private controls: PointerLockControls | undefined;

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
    }

    setControls(controls: PointerLockControls) {
        if (!controls) {
            return;
        }
        this.controls = controls;

        this.mainMenu.onclick = (event: MouseEvent) => {
            if (event.target && event.target.parentElement.id === 'maps' && event.target.id) {
                console.log('Selected level: ', event.target.id);
                this.renderGame(event.target.id);
            }
        };
        this.pauseMenu.onclick = (event: MouseEvent) => {
            this.renderGame(null);
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

    renderGame(level: string|null) {
        this.inGame.style.display = 'block';
        this.pauseMenu.style.display = 'none';
        this.mainMenu.style.display = 'none';
        if (this.controls && typeof this.controls.lock === 'function') {
            this.controls.lock();
        }
    }

}
