import * as THREE from 'three'
import {Object3D, PerspectiveCamera, Raycaster, Scene, Vector3, WebGLRenderer} from 'three'
import type {Socket} from 'socket.io-client';
import {io} from 'socket.io-client';
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls.js";
import {Player} from "./models/player";
import {Sphere} from "./models/sphere";
import {initSky} from "./initMethods";
import {GltfScene} from "./terrain/gltfScene";
import {Hero} from "./models/hero";
import {HUDController} from "./controllers/HUDController.ts";
import {acceleratedRaycast, computeBoundsTree, disposeBoundsTree} from "three-mesh-bvh";
import {CreatorController} from "./controllers/CreatorController.ts";
import {PlayerList, PlayerNames, PlayerScores, ServerMessage} from "./types/main.ts";
import {createShadowObject} from "./utils/model.ts";
import {AssetObject} from "./types/assets.ts";

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

let socket: Socket;
let playerNames:PlayerNames = {}

let players: PlayerList = {}

let playerNo: string|number;

let scores: PlayerScores = {}

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
let raycaster: Raycaster;
let creatorController: CreatorController;

init();

async function init() {
    camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 1, 2000 );
    scene = new THREE.Scene();
    scene.background = new THREE.Color("white");
    hero = new Hero(scene, null); // Preparing to await Hero.Create();
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

    loadSocket();

    scene.add( controls.object );
    const onKeyDown = function ( event: KeyboardEvent ) {
         isChatActive = hudController.isChatActive();
         if(isChatActive) {
            if(event.key == "Enter") {
                const text = hudController.getMessage();
                if (text) {
                    socket.emit("data", {type: "msg", msg: text})
                }
                hudController.clearMessage();
                hudController.toggleChat();
                isChatActive = !isChatActive;
            }
            else {
                hudController.type(event.key);
            }
        } else if(event.code == "KeyT") {
            hudController.toggleChat();
            isChatActive = !isChatActive;
        }
    };

    const onClick = function() {
        if(controls.enabled) {
            shoot = true
        }
    }

    document.addEventListener( 'keydown', onKeyDown, false );
    document.addEventListener("click", onClick, false);

    raycaster = new THREE.Raycaster( new THREE.Vector3(), new THREE.Vector3( 0, - 1, 0 ), 0, 10 );


    window.addEventListener( 'resize', onWindowResize, false );

    hudController.renderMenu();
    initSky(scene);
    hudController.onLoadMap(async (selectedMap, options)=> {
        if (!map) {
            map = await GltfScene.CreateMap(selectedMap, scene, controls);
            map.initPlayerEvents();
        } else {
            await map.updateScene(selectedMap);
        }
        await map.addToScene();
        if (options.y && options.x && options.z) {
            map.setSpawnCoordinates(Number(options.x), Number(options.y), Number(options.z));
        }

        map.respawn(camera as THREE.PerspectiveCamera, heroPlayer);

        if (!animationRunning) {
            animate();
        }
    });

    creatorController = new CreatorController(scene, hudController, hero, controls);
    createShadowObject({
        "type": "rect",
        "w": 3,
        "h": 3
    } as AssetObject).then(shadowObject=>{
        scene.add(shadowObject);
        creatorController.updateShadowObject();
    });
}

function loadSocket() {
    const name:HTMLInputElement = document.getElementById("name") as HTMLInputElement;

    if(socket == null) {

        socket = io('//localhost:3000/')

        socket.on('position', function(msg) {
            if(players[msg[3]] == null) {createPlayer(msg[3])}
            players[msg[3]].setPosition(msg[0], msg[1], msg[2]);
        });

        socket.on('data', function(msg: ServerMessage) {
            let message: string = "";

            if(msg.type == "bul col") {
                if(msg.player == playerNo) {
                    message = "You just got shot"
                }
                else if (msg.attacker) {
                    message = "\"" + playerNames[msg.player] + "\" was shot by \"" + playerNames[msg.attacker] + "\""
                }

                if(msg.attacker && scores[msg.attacker] == null) { scores[msg.attacker] = 0 }

                if (msg.attacker) {
                    scores[msg.attacker] += 1
                }

                hudController.updateScores(playerNames, scores);
            }
            else if(msg.type == "config") {
                playerNo = msg.player
                message = "Welcome. You have successfully joined the game. Good luck :)"

                if (name) {
                    socket.emit("data", {type: "name", name: name.value})
                    playerNames[playerNo] = name.value
                }
            }
            else if(msg.type == "name") {
                message = "\"" + msg.name + "\" has just joined."
                playerNames[msg.player] = msg.name;
            }
            else if(msg.type == "msg") {
                message = "<b>" + playerNames[msg.player] + ": </b>" + msg.msg
            }
            else if(msg.type == "disconnected") {
                message = "Player \"" + playerNames[msg.player] + "\" just disconnected."
            }

            if(message) {
                hudController.onMessage(message);
            }
        });

        socket.on('shoot', function(msg) {
            if(msg.length == 1) {
                let bullet = scene.getObjectByName("bullet" + msg[0]);
                if (bullet instanceof Object3D) {
                    scene.remove(bullet)
                }
            }
            else {
                let bullet = scene.getObjectByName("bullet" + msg[4]);
                if (!bullet) {
                    createBullet(msg)
                }
                else {
                    bullet.position.set(msg[0], msg[1], msg[2])
                }
            }
        });
    }
}


function createBullet(msg: number[]) {
    console.log("create bullet")
    console.log(msg)
    const sphere = new Sphere(scene, 0.5, 15, 15, 'red');
    sphere.setPosition(msg[0], msg[1], msg[2]);
    sphere.name = "bullet" + msg[4];
    sphere.addToScene();
}

function createPlayer(playerNo: string|number) {
    players[playerNo] = new Player(scene);
    players[playerNo].addToScene()
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

    if (socket != null && !isChatActive) {
        const pos = heroPlayer.position;
        //let rotation = controlsObject.rotation;
        //let touchedTerrain = false;

        socket.emit("position", [pos.x, pos.y, pos.z])

        if (shoot) {
            let dir: Vector3 = camera.getWorldDirection(direction);

            shoot = false
            socket.emit("shoot", [pos.x, pos.y, pos.z, {
                x: round(dir.x),
                y: round(dir.y),
                z: round(dir.z)
            }])
        }

        raycaster.ray.origin.copy(pos);
        raycaster.ray.origin.y -= 9;

        // const intersections = raycaster.intersectObjects( objects );

        // const onObject = intersections.length > 1;

        const delta = ( time - prevTime ) / 1000;
        //heroPlayer.position.copy(camera.position);
        if (creatorController.view === 'tps') {
            controls.maxPolarAngle = Math.PI / 2;
            controls.minDistance = 1;
            controls.maxDistance = 20;
        } else if (creatorController.view === 'fps') {
            controls.maxPolarAngle = Math.PI;
            controls.minDistance = 1e-4;
            controls.maxDistance = 1e-4;
        }

        map.updatePlayer(delta, camera, heroPlayer);

        controls.update();

        creatorController.update(delta)

    }

    prevTime = time;

    renderer.render( scene, camera );

}
