import menuTemplate from './pages/menu.html?raw'
import pauseMenuTemplate from './pages/pause.html?raw'
import inGameTemplate from './pages/ingame.html?raw'
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls";

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
            const target: HTMLElement = event.target as HTMLElement;
            if (target && target.parentElement && target.parentElement.id === 'maps' && target.id) {
                console.log('Selected level: ', target.id);
                this.renderGame(target.id);
            }
        };
        this.pauseMenu.onclick = () => {
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
        console.log('Render level: ', level);
        this.inGame.style.display = 'block';
        this.pauseMenu.style.display = 'none';
        this.mainMenu.style.display = 'none';
        if (this.controls && typeof this.controls.lock === 'function') {
            this.controls.lock();
        }
    }

}
