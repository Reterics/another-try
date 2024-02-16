import * as THREE from 'three'
import {Object3D, PerspectiveCamera, Scene, Vector3, WebGLRenderer} from 'three'
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls.js";
import {initSky} from "./initMethods";
import {GltfScene} from "./terrain/gltfScene";
import {Hero} from "./models/hero";
import {HUDController} from "./controllers/HUDController.ts";
import {acceleratedRaycast, computeBoundsTree, disposeBoundsTree} from "three-mesh-bvh";
import {CreatorController} from "./controllers/CreatorController.ts";
import {ServerManager} from "./lib/ServerManager.ts";
import {ObjectPositionMessage} from "../../types/messages.ts";
import {ATMap} from "../../types/map.ts";
import {MinimapController} from "./controllers/MinimapController.ts";

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

let shoot = false,
    isChatActive = false;

let prevTime = performance.now();
let isTabActive: boolean = true;
const direction = new THREE.Vector3();
let heroPlayer: Object3D;
let map: GltfScene;
let animationRunning = false;

const hudController = new HUDController();
let camera: PerspectiveCamera;
let renderer: WebGLRenderer;
let scene: Scene;
let hero: Hero;
let controls: OrbitControls;
let creatorController: CreatorController;
let serverManager: ServerManager;

let minimap: MinimapController;


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

    renderer = new THREE.WebGLRenderer( { antialias: true } );
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( window.innerWidth, window.innerHeight );
    document.body.appendChild( renderer.domElement );

    controls = new OrbitControls( camera, renderer.domElement );
    controls.mouseButtons = {
        LEFT: null,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE,
    };
    window.onfocus = function () {
        isTabActive = true;
    };

    window.onblur = function () {
        isTabActive = false;
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
    window.addEventListener( 'resize', onWindowResize, false );

    initSky(scene);
    creatorController = new CreatorController(scene, hudController, hero, controls);
    await creatorController.updateShadowObject();
    creatorController.on('click', () => {
        if (creatorController.active === 'pointer') {
            shoot = true;
        }
    });
    creatorController.on('object', (msg: ObjectPositionMessage) => {
        if (msg && Array.isArray(msg.coordinates) && msg.asset) {
            serverManager.send("object", msg);
        }
    });

    serverManager = new ServerManager(scene, hudController);
    hudController.renderMaps();

    serverManager.connect();
    serverManager.on('connect', async () => {
        const map = await serverManager.get('map');
        if (map) {
            hudController.setMaps([map as ATMap]);
            hudController.renderMaps();
        }
        const assets = await serverManager.get('assets');
        if (Array.isArray(assets)) {
            creatorController.updateAssets(assets);
        }

    });
    serverManager.on('object', async (msg: ObjectPositionMessage) => {
        if (msg.type === "object" && Array.isArray(msg.coordinates) && msg.asset) {
            const obj = await creatorController.getShadowObjectByIndex(msg.asset);
            if (obj &&
                typeof msg.coordinates[0] === "number" &&
                typeof msg.coordinates[1] === "number" &&
                typeof msg.coordinates[3] === "number"
            ) {
                obj.name = "mesh_bullet_brick";
                obj.position.set(msg.coordinates[0], msg.coordinates[1], msg.coordinates[3]);
                scene.add(obj);
            }
        }
    })
    hudController.on('map:select', async (selected: ATMap)=> {
        hudController.openDialog('Loading', 'Create Map...');
        if (!map) {
            map = await GltfScene.CreateMap(selected, scene, controls);
            map.initPlayerEvents();
        } else {
            await map.updateScene(selected);
        }
        hudController.openDialog('Loading', 'Add to scene');
        await map.addToScene();

        // renderer.render( scene, camera );
        if (!animationRunning) {
            animate();
        }
        map.respawn(heroPlayer);
        minimap = new MinimapController({
            boundingBox: map.getBoundingBox() || undefined,
            texture: selected.texture || ''
        });

        hudController.closeDialog();
    });

}


function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize( window.innerWidth, window.innerHeight );

}

function round(num: number) {
    return Math.round(num * 100) / 100
}

function animate() {
    requestAnimationFrame( animate );
    if (!animationRunning) {
        animationRunning = true;
    }
    if (document.hidden || !isTabActive) { // No render if the tab is not open
        prevTime = 0;
        return;
    }
    const time = performance.now();

    if (prevTime === 0) { // We came from hidden
        prevTime = time;
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


        const delta = ( time - prevTime ) / 1000;
        //heroPlayer.position.copy(camera.position);
        if (creatorController.view === 'tps') {
            controls.maxPolarAngle = Math.PI / 2;
            controls.minDistance = 1;
            controls.maxDistance = 40;
            if (!heroPlayer.visible) {
                heroPlayer.visible = true;
            }
        } else if (creatorController.view === 'fps') {
            controls.maxPolarAngle = Math.PI;
            controls.minDistance = 1e-4;
            controls.maxDistance = 1e-4;
            if (heroPlayer.visible) {
                heroPlayer.visible = false;
            }
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
    }

    prevTime = time;

    renderer.render( scene, camera );
    if (minimap) {
        minimap.update(heroPlayer.position, heroPlayer.rotation);
    }
}
