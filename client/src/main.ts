import * as THREE from 'three'
import type { Socket } from 'socket.io-client';
import {io} from 'socket.io-client';
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls";
import {Player} from "./models/player";
import {Sphere} from "./models/sphere";
import {initSky} from "./initMethods";
import {GltfScene} from "./terrain/gltfScene";
import {Hero} from "./models/hero";
import {HUDController} from "./hud";
import {Mesh, Object3D, PerspectiveCamera, Raycaster, Scene, Vector3, WebGLRenderer} from "three";
import {acceleratedRaycast, computeBoundsTree, disposeBoundsTree} from "three-mesh-bvh";

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

let socket: Socket;


let camera:PerspectiveCamera,
    scene: Scene,
    renderer: WebGLRenderer,
    controls: PointerLockControls;
// const objects: Mesh[] = [];

// TODO: Move interfaces outside
interface PlayerList {
    [key: number|string]: Player
}
interface PlayerNames {
    [key: number|string]: string|null|undefined
}
interface PlayerScores {
    [key: number|string]: number
}
interface ServerMessage {
    type: string;
    player: string|number;
    attacker?: string|number;
    name?: string;
    past?: boolean;
    msg?: string;
}
export interface CapsuleInfo {
    radius: number,
    segment: THREE.Line3
}
let playerNames:PlayerNames = {}

let players: PlayerList = {}

let playerNo: string|number;

let scores: PlayerScores = {}

let typingAMessage = false

let raycaster: Raycaster;

let shoot = false;

let prevTime = performance.now();
const direction = new THREE.Vector3();
let heroPlayer: Mesh;
let map: GltfScene;
let animationRunning = false;

const hudController = new HUDController();
init();


function init() {
    camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 1, 1000 );
    camera.position.y = 1;
    camera.position.x = 15;
    camera.position.z = 1;

    scene = new THREE.Scene();
    scene.background = new THREE.Color("white");

    const hero = new Hero(scene);
    heroPlayer = hero.getMesh();
    heroPlayer.position.copy(camera.position);
    hero.addToScene();

    controls = new PointerLockControls( camera, document.body );

    /*const blocker = document.getElementById( 'blocker' );
    const crosshair = document.getElementById( 'crosshair' )
    const instructions = document.getElementById( 'instructions' );
    const paused = document.getElementById( 'paused' )

    blockerContents.addEventListener( 'click', function() {
        controls.lock()
    }, false );*/
    const featuredMessage = document.getElementById("featuredMessage");
    const msg3 = document.getElementById("msg3");
    const msg2 = document.getElementById("msg2");
    const msg1 = document.getElementById("msg1");
    const name:HTMLInputElement = document.getElementById("name") as HTMLInputElement;
    controls.addEventListener( 'lock', function () {
        /*instructions.style.display = 'none';
        blocker.style.display = 'none';
        crosshair.style.display = 'block'*/

        if(socket == null) {

            socket = io('//localhost:3000/')

            socket.on('position', function(msg) {
                if(players[msg[3]] == null) {createPlayer(msg[3])}
                players[msg[3]].setPosition(msg[0], msg[1], msg[2]);
            });

            socket.on('data', function(msg: ServerMessage) {
                let message: string = "";
                let showMsg = true

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

                    showScores()
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
                    if(msg.past) { showMsg = false }
                    message = "\"" + msg.name + "\" has just joined."
                    playerNames[msg.player] = msg.name;
                }
                else if(msg.type == "msg") {
                    message = "<b>" + playerNames[msg.player] + ": </b>" + msg.msg
                }
                else if(msg.type == "disconnected") {
                    message = "Player \"" + playerNames[msg.player] + "\" just disconnected."
                }

                if(showMsg && message) {
                    if (featuredMessage) {
                        featuredMessage.innerHTML = message;
                    }

                    setTimeout(function(){
                        if (msg1 && msg2 && msg3) {
                            msg3.innerHTML = msg2.innerHTML;
                            msg2.innerHTML = msg1.innerHTML;
                            msg1.innerHTML = message;
                        }


                        if(featuredMessage && featuredMessage.innerHTML == message) {
                            featuredMessage.innerHTML = ""
                        }
                    }, 3000);
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
    } );

    /*controls.addEventListener( 'unlock', function () {

        blocker.style.display = 'block';
        paused.style.display = 'block'

        crosshair.style.display = 'none'

    } );*/

    scene.add( controls.getObject() );
    const typedMessage = document.getElementById("typedMessage") || document.createElement('div');
    const typedMessageOutput = document.getElementById("typedMessageOutput") || document.createElement('div');
    const messageList = document.getElementById("messageList") || document.createElement('div');

    const onKeyDown = function ( event: KeyboardEvent ) {

        if(typingAMessage) {
            if(event.keyCode == 191) {
                typingAMessage = false
                typedMessage.style.display = "none"
            }
            else if(event.keyCode == 13) {
                typingAMessage = false
                typedMessage.style.display = "none"

                socket.emit("data", {type: "msg", msg: typedMessageOutput.innerHTML})
            }
            else {
                let letter = String.fromCharCode(event.keyCode)
                let expression = new RegExp("^[A-Z0-9_ ]*$")

                if(expression.test(letter)) {
                    if(typedMessageOutput.innerHTML == "<b>Type a message... (press enter to send or / to cancel)</b>") {
                        typedMessageOutput.innerHTML = letter
                    }
                    else {
                        typedMessageOutput.innerHTML += letter
                    }
                }
            }
        }
        else {
            switch ( event.keyCode ) {

                case 77: //m
                    if(messageList.style.display == "none") {
                        messageList.style.display = "block"
                    }
                    else {
                        messageList.style.display = "none"
                    }

                    break;

                case 191: //   /
                    if(controls.isLocked) {
                        typingAMessage = true
                        typedMessage.style.display = "block"
                        typedMessageOutput.innerHTML = "<b>Type a message... (press enter to send or / to cancel)</b>"
                    }

                    break;


            }
        }
    };

    const onClick = function() {
        if(controls.isLocked) {
            shoot = true
        }
    }

    document.addEventListener( 'keydown', onKeyDown, false );
    document.addEventListener("click", onClick, false);

    raycaster = new THREE.Raycaster( new THREE.Vector3(), new THREE.Vector3( 0, - 1, 0 ), 0, 10 );

    renderer = new THREE.WebGLRenderer( { antialias: true } );
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( window.innerWidth, window.innerHeight );
    document.body.appendChild( renderer.domElement );

    //

    window.addEventListener( 'resize', onWindowResize, false );

    hudController.renderMenu();
    if (controls) {
        hudController.setControls(controls);
        hudController.onLoadMap((selectedMap, options)=>{
            if (map) {
                return map.updateScene(selectedMap).then((map: GltfScene) => {
                    map.addToScene();
                    if (options.y) {
                        camera.position.y = Number(options.y);
                    }

                    if (options.x) {
                        camera.position.x = Number(options.x);
                    }

                    if (options.z) {
                        camera.position.y = Number(options.z);
                    }
                });
            }
            map = new GltfScene(selectedMap, scene, controls,(map:GltfScene)=>{ //'dungeon_low_poly_game_level_challenge/scene.gltf'
                map.addToScene();
                map.initPlayerEvents();
            });
            if (!animationRunning) {
                animate();
            }
        })
    }

    initSky(scene);

}


function showScores() {
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

    const HUDInformation = document.getElementById("HUD-information");
    if (HUDInformation) {
        HUDInformation.innerHTML = output
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

    if ( controls.isLocked && socket != null) {
        let controlsObject = controls.getObject()
        let pos = controlsObject.position
        //let rotation = controlsObject.rotation;
        //let touchedTerrain = false;

        socket.emit("position", [pos.x, pos.y, pos.z])

        if(shoot) {
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
        map.updatePlayer(delta, camera, heroPlayer);
    }

    prevTime = time;

    renderer.render( scene, camera );

}
