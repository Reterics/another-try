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
import {GrassManager} from "./models/grass/grassManager.ts";
import EventBus, { Subscription } from '@shared/events/EventBus.ts';
import { Topics } from '@shared/events/topics.ts';
import { FrameLoop } from '@engine/render/FrameLoop.ts';
import ResizeSystem from '@engine/render/ResizeSystem.ts';
import createRenderer from '@engine/render/RendererFactory.ts';

// Typed EventBus (non-destructive wiring): instantiated here and passed to FrameLoop only.
const eventBus = new EventBus();
FrameLoop.setEventBus(eventBus);
const busSubscriptions: Subscription[] = [];

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
let grassManager: GrassManager | null = null;
let controls: OrbitControls;
let creatorController: CreatorController;
let serverManager: ServerManager;
let clouds: Clouds;
// Grass configuration (world units; 1 unit = 1 meter)
const GRASS_PATCH_INSTANCES = 10000;
const GRASS_PATCH_SIZE = 12;
const GRASS_PATCH_RADIUS = 128; // circle radius for real blades (units)
const GRASS_IMPOSTOR_RADIUS = 300 + GRASS_PATCH_SIZE + GRASS_PATCH_RADIUS; // outer ring radius for impostors (units)
const GRASS_IMPOSTOR_DENSITY = 3; // impostors per chunk cell in the annulus
const GRASS_LOD_STEPS = [ 0.5, 0.45, 0.1];
const GRASS_LOD_RADII = [1, 64, GRASS_PATCH_RADIUS]; // must match GRASS_LOD_STEPS length; last equals GRASS_PATCH_RADIUS
const GRASS_WIND_INTENSITY = 0.35;

let minimap: MinimapController;
let minimapTextureCleanup: (() => void) | null = null;

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
        hudController.openDialog('Loading', 'Create Map...');
        if (!map) {
            map = await TerrainManager.CreateMap(selected, scene, controls, creatorController);
            map.initPlayerEvents();
        } else {
            await map.updateScene(selected);
        }
        hudController.openDialog('Loading', 'Add to scene');
        await map.addToScene();

        if (!grassManager) {
            grassManager = new GrassManager(scene, map, {
                patchRadius: GRASS_PATCH_RADIUS,
                impostorRadius: GRASS_IMPOSTOR_RADIUS,
                lodRadii: GRASS_LOD_RADII,
                instancesPerPatch: GRASS_PATCH_INSTANCES,
                lodSteps: GRASS_LOD_STEPS,
                windIntensity: GRASS_WIND_INTENSITY,
                impostorDensity: GRASS_IMPOSTOR_DENSITY,
                patchSize: GRASS_PATCH_SIZE,
            });
        } else {
            grassManager.setTerrain(map);
        }

        await map.preloadAroundSpawn();

        if (!animationRunning) {
            creatorController.updateView();
            FrameLoop.onFrame(animate);
            FrameLoop.start();
            animationRunning = true;
        }
        map.respawn(heroPlayer);
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

        hudController.closeDialog();
    })
);


init();

async function init() {
    hudController.renderMenu();

    camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 1, 2000 );
    scene = new THREE.Scene();
    scene.background = new THREE.Color("white");
    hero = await Hero.Create(scene);
    heroPlayer = hero.getObject();
    //heroPlayer.position.copy(camera.position);
    hero.addToScene();

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
                const text = hudController.getMessage(true);
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
        }
    };

    document.addEventListener( 'keydown', onKeyDown, false );

    // Keep renderer and camera in sync with window size via ResizeSystem
    const resizer = new ResizeSystem({ renderer, camera, eventBus });
    resizer.start();

    const sky = new ATSky(scene);
    sky.addToScene();
    clouds = new Clouds(scene);
    clouds.addToScene();
    creatorController = new CreatorController(scene, hudController, hero, controls, eventBus);
    await creatorController.updateShadowObject();
    serverManager = new ServerManager(scene, hudController, eventBus);
    hudController.renderMaps();

    // Initialize HUD with persisted player name and default health
    try {
        const storedName = localStorage.getItem('player:name');
        if (storedName) hudController.setPlayerName(storedName);
    } catch (e) { /* ignore */ }
    hudController.setHealth(100, 100);

    busSubscriptions.push(
        eventBus.subscribe(Topics.Server.Connected, async () => {
            const maps = await serverManager.get('maps');
            if (maps && Array.isArray(maps)) {
                const filteredMaps = hudController.getMaps().filter(map=>map.id === 'fallback');
                maps.forEach(map => {
                    if(map.id !== 'fallback'){
                        filteredMaps.push(map)
                    }
                });

                hudController.setMaps(filteredMaps);
                hudController.renderMaps();
            }
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
        grassManager?.update(heroPlayer.position, camera.position, elapsedSeconds);
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
