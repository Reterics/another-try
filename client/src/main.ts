import * as THREE from 'three'
import { io } from 'socket.io-client';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import {Player} from "./models/player";
import {Box} from "./models/box";
import {Sphere} from "./models/sphere";
import {initSky} from "./initMethods";
import {HeightmapTerrain} from "./terrain/heightmap";
import {GltfScene} from "./terrain/gltfScene";
import {RoundedBoxGeometry} from "three/examples/jsm/geometries/RoundedBoxGeometry";
import {Hero} from "./models/hero";
import {HUDController} from "./hud";

let socket

let playerNames = {}

let camera, scene, renderer,
    controls:PointerLockControls;
let sky, sun;

const objects = [];

let players = {}

let playerNo

let scores = {}

let typingAMessage = false

let raycaster;

let shoot = false;

let prevTime = performance.now();
const direction = new THREE.Vector3();
let heroPlayer;

const hudController = new HUDController();
init();

hudController.renderMenu();
hudController.setControls(controls);
initSky(scene);
//const terrain = initTerrain(scene, controls, 256, 256);
//const mapTerrain = new HeightmapTerrain(scene);
//mapTerrain.render();
const map = new GltfScene('dungeon_low_poly_game_level_challenge/scene.gltf', scene, controls,(map:GltfScene)=>{
    map.addToScene();
    map.initPlayerEvents();
});

window.scene = scene;
window.camera = camera;
window.controls = controls;
window.player = heroPlayer;
animate();

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

            socket.on('data', function(msg) {
                let message
                let showMsg = true

                if(msg.type == "bul col") {
                    if(msg.player == playerNo) {
                        message = "You just got shot"
                    }
                    else {
                        message = "\"" + playerNames[msg.player] + "\" was shot by \"" + playerNames[msg.attacker] + "\""
                    }

                    if(scores[msg.attacker] == null) { scores[msg.attacker] = 0 }

                    scores[msg.attacker] += 1

                    showScores()
                }
                else if(msg.type == "config") {
                    playerNo = msg.player
                    message = "Welcome. You have successfully joined the game. Good luck :)"

                    let name = document.getElementById("name").value
                    socket.emit("data", {type: "name", name: name})
                    playerNames[playerNo] = name
                }
                else if(msg.type == "name") {
                    if(msg.past) { showMsg = false }
                    message = "\"" + msg.name + "\" has just joined."
                    playerNames[msg.player] = msg.name
                }
                else if(msg.type == "msg") {
                    message = "<b>" + playerNames[msg.player] + ": </b>" + msg.msg
                }
                else if(msg.type == "disconnected") {
                    message = "Player \"" + playerNames[msg.player] + "\" just disconnected."
                }

                if(showMsg) {
                    document.getElementById("featuredMessage").innerHTML = message

                    setTimeout(function(){
                        document.getElementById("msg3").innerHTML = document.getElementById("msg2").innerHTML
                        document.getElementById("msg2").innerHTML = document.getElementById("msg1").innerHTML
                        document.getElementById("msg1").innerHTML = message

                        if(document.getElementById("featuredMessage").innerHTML == message) {
                            document.getElementById("featuredMessage").innerHTML = ""
                        }
                    }, 3000);
                }
            });

            socket.on('shoot', function(msg) {
                if(msg.length == 1) {
                    let bullet = scene.getObjectByName("bullet" + msg[0]);
                    scene.remove(bullet)
                }
                else {
                    let bullet = scene.getObjectByName("bullet" + msg[4]);
                    if(bullet == null) {
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

    const onKeyDown = function ( event ) {

        if(typingAMessage) {
            if(event.keyCode == 191) {
                typingAMessage = false
                document.getElementById("typedMessage").style.display = "none"
            }
            else if(event.keyCode == 13) {
                typingAMessage = false
                document.getElementById("typedMessage").style.display = "none"

                socket.emit("data", {type: "msg", msg: document.getElementById("typedMessageOutput").innerHTML})
            }
            else {
                let letter = String.fromCharCode(event.keyCode)
                let expression = new RegExp("^[A-Z0-9_ ]*$")

                if(expression.test(letter)) {
                    if(document.getElementById("typedMessageOutput").innerHTML == "<b>Type a message... (press enter to send or / to cancel)</b>") {
                        document.getElementById("typedMessageOutput").innerHTML = letter
                    }
                    else {
                        document.getElementById("typedMessageOutput").innerHTML += letter
                    }
                }
            }
        }
        else {
            switch ( event.keyCode ) {

                case 77: //m
                    let msgList = document.getElementById("messageList")

                    if(msgList.style.display == "none") {
                        msgList.style.display = "block"
                    }
                    else {
                        msgList.style.display = "none"
                    }

                    break;

                case 191: //   /
                    if(controls.isLocked) {
                        typingAMessage = true
                        document.getElementById("typedMessage").style.display = "block"
                        document.getElementById("typedMessageOutput").innerHTML = "<b>Type a message... (press enter to send or / to cancel)</b>"
                    }

                    break;


            }
        }
    };

    const onClick = function() {
        if(controls.isLocked === true) {
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


    document.getElementById("HUD-information").innerHTML = output
}

function createBullet(msg) {
    console.log("create bullet")
    console.log(msg)
    const sphere = new Sphere(scene, 0.5, 15, 15, 'red');
    sphere.setPosition(msg[0], msg[1], msg[2]);
    sphere.name = "bullet" + msg[4];
    sphere.addToScene();
}

function createPlayer(playerNo) {
    players[playerNo] = new Player(scene);
    players[playerNo].addToScene()
}

function createObject(size, pos, colour) {
    const object = new Box(scene, size, colour);
    object.setPosition(pos[0], pos[1], pos[2]);
    object.addToScene();
    objects.push(object.getMesh());
}

function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize( window.innerWidth, window.innerHeight );

}

function round(num) {
    return Math.round(num * 100) / 100
}

function animate() {
    requestAnimationFrame( animate );

    const time = performance.now();

    if ( controls.isLocked === true && socket != null) {
        let controlsObject = controls.getObject()
        let pos = controlsObject.position
        let rotation = controlsObject.rotation;
        let touchedTerrain = false;

        socket.emit("position", [pos.x, pos.y, pos.z])

        if(shoot) {
            let dir = camera.getWorldDirection(direction);
            dir = {
                x: round(dir.x),
                y: round(dir.y),
                z: round(dir.z)
            }

            shoot = false
            socket.emit("shoot", [pos.x, pos.y, pos.z, dir])
        }

        raycaster.ray.origin.copy(pos);
        raycaster.ray.origin.y -= 9;

        const intersections = raycaster.intersectObjects( objects );

        const onObject = intersections.length > 1;

        const delta = ( time - prevTime ) / 1000;
        //heroPlayer.position.copy(camera.position);
        map.updatePlayer(delta, camera, heroPlayer);
    }

    prevTime = time;

    renderer.render( scene, camera );

}
