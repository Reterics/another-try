import * as THREE from 'three'
import {Object3D, PerspectiveCamera, Scene, Vector3, WebGLRenderer} from 'three'
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls.js";
import {TerrainManager} from "./lib/terrainManager.ts";
import {Hero} from "./models/hero";
import {HUDController} from "./controllers/HUDController.ts";
import {acceleratedRaycast, computeBoundsTree, disposeBoundsTree} from "three-mesh-bvh";
import {CreatorController} from "./controllers/CreatorController.ts";
import {ServerManager} from "./lib/ServerManager.ts";
import {MinimapController} from "./controllers/MinimapController.ts";
import Clouds from "./models/cloud";
import ATSky from "./models/sky.ts";
import { GrassSystem } from "./foliage";
import {EventBus, Topics, type Subscription, VideoSettingsPayload} from '@game/shared';
import { createGameUI, type GameUI } from '@game/ui';
import { FrameLoop } from '@engine/render/FrameLoop.ts';
import ResizeSystem from '@engine/render/ResizeSystem.ts';
import createRenderer from '@engine/render/RendererFactory.ts';
import {
    TPS_CAMERA_DISTANCE,
    TPS_CAMERA_FALLBACK_DIR,
    TPS_CAMERA_MAX_DISTANCE,
    TPS_CAMERA_MIN_DISTANCE
} from "./config/camera.ts";

// Typed EventBus (non-destructive wiring): instantiated here and passed to FrameLoop only.
const eventBus = new EventBus();
FrameLoop.setEventBus(eventBus);
const busSubscriptions: Subscription[] = [];

// Initialize new UI system
let gameUI: GameUI | null = null;
function initializeUI() {
    // Create UI root container
    const uiRoot = document.createElement('div');
    uiRoot.id = 'game-ui-root';
    uiRoot.style.position = 'fixed';
    uiRoot.style.inset = '0';
    uiRoot.style.pointerEvents = 'none';
    uiRoot.style.zIndex = '1000';
    document.body.appendChild(uiRoot);

    // Initialize game UI with EventBus
    gameUI = createGameUI(eventBus, uiRoot);

    // Connect bridge to HUDController
    const bridge = gameUI.getBridge();
    bridge.setHUDController(hudController);

    // Pass available maps to UI
    const maps = hudController.getMaps();
    bridge.setMaps(maps);

    // Update save game display
    bridge.updateSaveGameDisplay();

    // Connect HUDController refs to Preact DOM
    bridge.updateHUDControllerRefs();

    // Override HUDController's UI methods (renderMenu, renderPauseMenu, renderGame)
    bridge.overrideHUDControllerMethods();

    return gameUI;
}

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

let shoot = false,
    isChatActive = false;

let isTabActive: boolean = true;
const direction = new THREE.Vector3();
const headingVector = new THREE.Vector3();
let lastVisibleFrame = true;
let heroPlayer: Object3D;
let map: TerrainManager;
let animationRunning = false;

const hudController = new HUDController(eventBus);
let camera: PerspectiveCamera;
let renderer: WebGLRenderer;
let scene: Scene;
let hero: Hero;
let grassSystem: GrassSystem | null = null;
let controls: OrbitControls;
let creatorController: CreatorController;
let serverManager: ServerManager;
let clouds: Clouds;
// Grass configuration (world units; 1 unit = 1 meter)
// New foliage system configuration
const GRASS_CONFIG = {
    patchSize: 16,           // Size of each grass patch in meters
    densityPerSqM: 400,      // Blades per square meter (200-600 recommended)
    maxDistance: 60,         // Maximum render distance in meters
    windStrength: 0.3,       // Wind intensity (0-1)
    windSpeed: 1.0,          // Wind animation speed
    windDirection: [0.7, 0.7] as [number, number], // Normalized XZ direction
    lodDistances: [20, 40, 60] as [number, number, number], // LOD tier boundaries
    enabled: true,
};

let minimap: MinimapController;
let minimapTextureCleanup: (() => void) | null = null;
type SavedGame = { name: string; coords: { x: number; y: number; z: number }; date: string; mapId?: string };
let savedGameState: SavedGame | null = null;
savedGameState = readSavedGame();
let currentVideoSettings: VideoSettingsPayload | null = null;

function readSavedGame(): SavedGame | null {
    try {
        const raw = localStorage.getItem('saveGame');
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed?.name && parsed?.coords && parsed?.date) {
            return parsed;
        }
    } catch (_) { /* ignore */ }
    return null;
}

function readVideoSettings(): VideoSettingsPayload | null {
    try {
        const raw = localStorage.getItem('video:settings');
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return {
            lod: parsed.lod || 'medium',
            textureQuality: parsed.textureQuality || 'high',
            postfx: parsed.postfx || 'medium',
            maxFps: typeof parsed.maxFps === 'number' ? parsed.maxFps : 0,
        };
    } catch (_) {
        return null;
    }
}

function applyVideoSettings(settings: Partial<VideoSettingsPayload>) {
    // FPS cap
    if (settings.maxFps !== undefined) {
        FrameLoop.setMaxFPS(settings.maxFps);
    }

    // Coarse render quality knob via pixel ratio
    if (renderer) {
        const base = (window.devicePixelRatio || 1);
        const ratio =
            settings.textureQuality === 'low'
                ? Math.max(1, Math.min(1.0, base * 0.75))
                : settings.textureQuality === 'medium'
                    ? Math.max(1, Math.min(1.25, base))
                    : Math.max(1, Math.min(1.75, base)); // high/default
        renderer.setPixelRatio(ratio);
    }

    // Persist for next launch
    currentVideoSettings = {
        lod: settings.lod || currentVideoSettings?.lod || 'medium',
        textureQuality: settings.textureQuality || currentVideoSettings?.textureQuality || 'high',
        postfx: settings.postfx || currentVideoSettings?.postfx || 'medium',
        maxFps: typeof settings.maxFps === 'number' ? settings.maxFps : currentVideoSettings?.maxFps || 0,
    };
    try {
        localStorage.setItem('video:settings', JSON.stringify(currentVideoSettings));
    } catch (_) { /* ignore */ }
}

function saveGameState() {
    if (!heroPlayer || !map) return;
    const payload: SavedGame = {
        name: hudController.getPlayerName() || 'Traveler',
        coords: {
            x: heroPlayer.position.x,
            y: heroPlayer.position.y,
            z: heroPlayer.position.z,
        },
        date: new Date().toISOString(),
        mapId: map.getMap()?.id,
    };
    try {
        localStorage.setItem('saveGame', JSON.stringify(payload));
        savedGameState = payload;
        // Update save game display in new UI
        if (gameUI) {
            gameUI.getBridge().updateSaveGameDisplay();
        }
    } catch (_) { /* ignore */ }
}

function snapCameraToPlayer() {
    if (!heroPlayer || !controls || !camera) return;
    controls.minDistance = Math.min(TPS_CAMERA_MIN_DISTANCE, TPS_CAMERA_DISTANCE);
    controls.maxDistance = Math.max(TPS_CAMERA_MAX_DISTANCE, TPS_CAMERA_DISTANCE);
    controls.target.copy(heroPlayer.position);
    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-6) {
        dir.set(TPS_CAMERA_FALLBACK_DIR[0], TPS_CAMERA_FALLBACK_DIR[1], TPS_CAMERA_FALLBACK_DIR[2]).normalize();
    } else {
        dir.normalize();
    }
    camera.position.copy(controls.target).addScaledVector(dir, TPS_CAMERA_DISTANCE);
    controls.update();
}

function applySavedPosition() {
    if (!savedGameState || !heroPlayer || !controls || !map) return;
    const currentMapId = map.getMap()?.id;
    if (savedGameState.mapId && currentMapId && savedGameState.mapId !== currentMapId) {
        return;
    }
    heroPlayer.position.set(savedGameState.coords.x, savedGameState.coords.y, savedGameState.coords.z);
    controls.target.copy(heroPlayer.position);
    snapCameraToPlayer();
}

busSubscriptions.push(
    eventBus.subscribe(Topics.UI.SettingsApplied, ({ settings }) => {
        applyVideoSettings(settings || {});
    })
);

busSubscriptions.push(
    eventBus.subscribe(Topics.Creator.PointerClicked, ({ mode }) => {
        if (mode === 'pointer') {
            shoot = true;
        }
    })
);

busSubscriptions.push(
    eventBus.subscribe(Topics.Creator.ObjectPlaced, ({ message }) => {
        if (message && Array.isArray(message.coordinates) && message.asset) {
            serverManager?.send("object", message);
        }
    })
);

busSubscriptions.push(
    eventBus.subscribe(Topics.UI.HUD.MapSelected, async ({ map: selected }) => {
        eventBus.publish(Topics.UI.Dialog, { visible: true, title: 'Loading', body: 'Preparing scene...' });

        if (!map) {
            map = await TerrainManager.CreateMap(selected, scene, controls, creatorController, eventBus);
            map.initPlayerEvents();
        } else {
            await map.updateScene(selected);
        }
        await map.addToScene();

        if (!grassSystem) {
            // Initialize new foliage system
            grassSystem = new GrassSystem({
                patchSize: GRASS_CONFIG.patchSize,
                densityPerSqM: GRASS_CONFIG.densityPerSqM,
                maxDistance: GRASS_CONFIG.maxDistance,
                windStrength: GRASS_CONFIG.windStrength,
                windSpeed: GRASS_CONFIG.windSpeed,
                windDirection: GRASS_CONFIG.windDirection,
                lodDistances: GRASS_CONFIG.lodDistances,
                seed: map.getTerrainParams().seed ?? 12345,
                enabled: GRASS_CONFIG.enabled,
            });
            grassSystem.setTerrainSampler(map.getHeightSampler());
            grassSystem.setTerrainParams(map.getTerrainParams());
            grassSystem.attach(scene);
        } else {
            // Update terrain reference when map changes
            grassSystem.setTerrainSampler(map.getHeightSampler());
            grassSystem.setTerrainParams(map.getTerrainParams());
        }

        await map.preloadAroundSpawn();

        if (!animationRunning) {
            creatorController.updateView();
            FrameLoop.onFrame(animate);
            FrameLoop.start();
            animationRunning = true;
        }
        map.respawn(heroPlayer);
        snapCameraToPlayer();
        applySavedPosition();
        if (minimapTextureCleanup) {
            minimapTextureCleanup();
            minimapTextureCleanup = null;
        }
        const hudMini = document.getElementById('HUD-minimap') as HTMLDivElement | null;
        minimap = new MinimapController({
            boundingBox: map.getBoundingBox() || undefined,
            texture: selected.texture || '',
            eventBus,
            target: hudMini || undefined,
        });
        const spawn = map.getSpawnPoint();
        minimap.setPatch({ x: spawn.x, z: spawn.z }, map.getProceduralPatchSize());
        minimapTextureCleanup = map.onMinimapTextureUpdated(({ texture, center, span }) => {
            if (!minimap) {
                return;
            }
            minimap.setPatch(center, span);
            minimap.setTexture(texture || selected.texture || '');
        });

        // Notify new UI system that game is now playing (shows HUD, hides menu)
        eventBus.publish(Topics.Game.StateChanged, { state: 'playing' });
        eventBus.publish(Topics.UI.Dialog, { visible: false });
    })
);


init();

async function init() {
    // Initialize new Preact-based UI system
    initializeUI();

    hudController.renderMenu();
    savedGameState = readSavedGame();

    camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 1, 2000 );
    scene = new THREE.Scene();
    scene.background = new THREE.Color("white");
    hero = await Hero.Create(scene);
    heroPlayer = hero.getObject();
    //heroPlayer.position.copy(camera.position);
    hero.addToScene();

    // Snap camera once right after creation to desired TPS distance
    snapCameraToPlayer();

    const { renderer: createdRenderer, canvas } = createRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer = createdRenderer;
    document.body.appendChild(canvas);

    controls = new OrbitControls( camera, renderer.domElement );
    controls.mouseButtons = {
        LEFT: null,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE,
    };
    window.onfocus = function () {
        isTabActive = true;
        if (animationRunning) {
            FrameLoop.start();
        }
    };

    window.onblur = function () {
        isTabActive = false;
        if (animationRunning) {
            FrameLoop.stop();
        }
    };

    scene.add( controls.object );
    const onKeyDown = function ( event: KeyboardEvent ) {
         isChatActive = hudController.isChatActive();
         if(isChatActive) {
            if(event.key == "Enter") {
                const text = hudController.getMessage();
                if (text) {
                    if (!serverManager.isActive()) {
                        hudController.bufferMessage(text);
                    }
                    serverManager.send("data", {type: "msg", msg: text})
                }
                hudController.clearMessage();
                hudController.toggleChat();
                isChatActive = !isChatActive;
            }
            else if (event.key.length === 1) {
                hudController.type(event.key);
            } else if(event.key === 'Backspace') {
                hudController.backspace()
            } else if(event.key === 'Delete') {
                hudController.delete()
            } else if (event.key === 'ArrowLeft') {
                hudController.updateCursor(-1);
            } else if (event.key === 'ArrowRight') {
                hudController.updateCursor(1);
            }
        } else if(event.code == "KeyT") {
            hudController.toggleChat();
            isChatActive = !isChatActive;
        } else if (event.key === 'Escape') {
            saveGameState();
            hudController.renderPauseMenu();
        }
    };

    document.addEventListener( 'keydown', onKeyDown, false );

    // Keep renderer and camera in sync with window size via ResizeSystem
    const resizer = new ResizeSystem({ renderer, camera, eventBus });
    resizer.start();

    // Apply persisted video settings now that renderer exists
    const storedVideo = readVideoSettings();
    if (storedVideo) {
        applyVideoSettings(storedVideo);
    }

    const sky = new ATSky(scene);
    sky.addToScene();
    clouds = new Clouds(scene);
    clouds.addToScene();
    creatorController = new CreatorController(scene, hudController, hero, controls, eventBus);
    await creatorController.updateShadowObject();
    serverManager = new ServerManager(scene, hudController, eventBus);

    // Initialize HUD with persisted player name and default health
    try {
        const storedName = localStorage.getItem('player:name');
        if (storedName) hudController.setPlayerName(storedName);
    } catch (e) { /* ignore */ }
    hudController.setHealth(100, 100);

    // Publish initial state to new UI system
    eventBus.publish(Topics.Player.HealthChanged, {
        current: 100,
        max: 100,
        regenRate: 2.5
    });
    eventBus.publish(Topics.Player.StaminaChanged, {
        current: 100,
        max: 100,
        regenRate: 5.0
    });

    busSubscriptions.push(
        eventBus.subscribe(Topics.Server.Connected, async () => {
            const assets = await serverManager.get('assets');
            if (Array.isArray(assets)) {
                creatorController.updateAssets(assets);
            }
        })
    );
    busSubscriptions.push(
        eventBus.subscribe(Topics.Server.ObjectReceived, async ({ message }) => {
            if (message.type === "object" && Array.isArray(message.coordinates) && message.asset) {
                const obj = await creatorController.getShadowObjectByIndex(message.asset);
                if (obj &&
                    typeof message.coordinates[0] === "number" &&
                    typeof message.coordinates[1] === "number" &&
                    typeof message.coordinates[3] === "number"
                ) {
                    obj.name = "mesh_bullet_brick";
                    obj.position.set(message.coordinates[0], message.coordinates[1], message.coordinates[3]);
                    scene.add(obj);
                }
            }
        })
    );

    serverManager.connect();

}


function round(num: number) {
    return Math.round(num * 100) / 100
}

function animate(dt: number, elapsed: number) {
    // If tab is hidden or inactive, skip updates and ensure next visible frame uses zero delta
    if (document.hidden || !isTabActive) {
        lastVisibleFrame = true;
        return;
    }

    const cameFromHidden = lastVisibleFrame;
    const delta = cameFromHidden ? 0 : dt;
    const elapsedSeconds = elapsed;
    if (cameFromHidden) {
        lastVisibleFrame = false;
    }

    if ((serverManager.isActive() || map.getMap().id === 'fallback')
        && !isChatActive) {
        const pos = heroPlayer.position;
        //let rotation = controlsObject.rotation;
        //let touchedTerrain = false;


        if (shoot) {
            let dir: Vector3 = camera.getWorldDirection(direction);

            shoot = false
            serverManager.send("shoot", [pos.x, pos.y, pos.z, {
                x: round(dir.x),
                y: round(dir.y),
                z: round(dir.z)
            }])
        }

        const physicsSteps = map.params.physicsSteps || 1;
        let moving = false;
        for ( let i = 0; i < physicsSteps; i ++ ) {
            if (map.updatePlayer(delta / physicsSteps, camera, hero)) {
                moving = true;
            }
        }
        if (moving) {
            serverManager.send("position", [pos.x, pos.y, pos.z]);
        }

        controls.update();

        creatorController.update(delta);

        hero.update(delta);
        serverManager.update(delta);
        grassSystem?.update(delta, heroPlayer.position, camera.position);
    }

    if (heroPlayer) {
        const heroPos = heroPlayer.position;
        eventBus.publish(Topics.Player.PositionChanged, {
            position: { x: heroPos.x, y: heroPos.y, z: heroPos.z },
        });
    }

    const dir = headingVector;
    camera.getWorldDirection(dir);
    dir.y = 0;
    let headingRad = 0;
    if (dir.lengthSq() > 1e-6) {
        dir.normalize();
        headingRad = Math.atan2(dir.x, dir.z);
    }
    eventBus.publish(Topics.Player.HeadingChanged, { radians: headingRad });

    if (clouds) {
        clouds.update(delta, camera.position);
    }

    renderer.render( scene, camera );
}
