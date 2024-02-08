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
import {ServerMessage} from "./types/main.ts";

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

let shoot = false,
    isChatActive = false;

let prevTime = performance.now();
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

init();

async function init() {
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
    }

    scene.add( controls.object );
    const onKeyDown = function ( event: KeyboardEvent ) {
         isChatActive = hudController.isChatActive();
         if(isChatActive) {
            if(event.key == "Enter") {
                const text = hudController.getMessage();
                if (text) {
                    serverManager.send("data", {type: "msg", msg: text})
                }
                hudController.clearMessage();
                hudController.toggleChat();
                isChatActive = !isChatActive;
            }
            else if (event.key.length === 1) {
                hudController.type(event.key);
            }
        } else if(event.code == "KeyT") {
            hudController.toggleChat();
            isChatActive = !isChatActive;
        }
    };

    document.addEventListener( 'keydown', onKeyDown, false );
    window.addEventListener( 'resize', onWindowResize, false );

    hudController.renderMenu();
    initSky(scene);
    creatorController = new CreatorController(scene, hudController, hero, controls);
    await creatorController.updateShadowObject();
    creatorController.on('click', () => {
        if (creatorController.active === 'pointer') {
            shoot = true;
        }
    });
    creatorController.on('object', (msg: any) => {
        if (msg && Array.isArray(msg.coordinates) && typeof msg.asset === "number") {
            serverManager.send("object", msg);
        }
    });

    serverManager = new ServerManager(scene, hudController);

    hudController.onLoadMap(async (selectedMap)=> {
        if (!map) {
            map = await GltfScene.CreateMap(selectedMap, scene, controls);
            map.initPlayerEvents();
        } else {
            await map.updateScene(selectedMap);
        }
        await map.addToScene();

        map.respawn(heroPlayer);
        renderer.render( scene, camera );
        if (!animationRunning) {
            animate();
        }

        serverManager.connect();
        serverManager.on('connect', async () => {
            const assets = serverManager.get('assets');
            if (Array.isArray(assets)) {
                creatorController.updateAssets(assets);
            }
        });
        serverManager.on('object', async (msg: ServerMessage) => {
            if (msg.type === "object" && Array.isArray(msg.coordinates) && typeof msg.asset === "number") {
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
    const time = performance.now();

    if (serverManager.isActive() && !isChatActive) {
        const pos = heroPlayer.position;
        //let rotation = controlsObject.rotation;
        //let touchedTerrain = false;

        serverManager.send("position", [pos.x, pos.y, pos.z])

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
        } else if (creatorController.view === 'fps') {
            controls.maxPolarAngle = Math.PI;
            controls.minDistance = 1e-4;
            controls.maxDistance = 1e-4;
        }

        const physicsSteps = map.params.physicsSteps || 1;
        for ( let i = 0; i < physicsSteps; i ++ ) {
            map.updatePlayer(delta / physicsSteps, camera, hero);
        }

        controls.update();

        creatorController.update(delta);

        hero.update(delta);
    }

    prevTime = time;

    renderer.render( scene, camera );

}
