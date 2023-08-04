import * as THREE from 'three'
import { io } from 'socket.io-client';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

let socket

let playerNames = {}

let camera, scene, renderer, controls;

const objects = [];

let players = {}

let land

let playerNo

let scores = {}

let energy = 10

let typingAMessage = false

let raycaster;

let timeUntilSprintOptionDisables;

let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let sprinting = false;
let canJump = false;
let shoot = false;

let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const vertex = new THREE.Vector3();
const color = new THREE.Color();

init();
animate();

function init() {
    camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 1, 1000 );
    camera.position.y = 0;

    scene = new THREE.Scene();
    scene.background = new THREE.Color("white");

    controls = new PointerLockControls( camera, document.body );

    const blocker = document.getElementById( 'blocker' );
    const crosshair = document.getElementById( 'crosshair' )
    const instructions = document.getElementById( 'instructions' );
    const paused = document.getElementById( 'paused' )

    blockerContents.addEventListener( 'click', function() {
        controls.lock()
    }, false );

    controls.addEventListener( 'lock', function () {
        instructions.style.display = 'none';
        blocker.style.display = 'none';
        crosshair.style.display = 'block'

        if(socket == null) {

            socket = io('//localhost:3000/')

            socket.on('position', function(msg) {
                if(players[msg[3]] == null) {createPlayer(msg[3])}

                players[msg[3]].position.set(msg[0], msg[1], msg[2])
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

    controls.addEventListener( 'unlock', function () {

        blocker.style.display = 'block';
        paused.style.display = 'block'

        crosshair.style.display = 'none'

    } );

    scene.add( controls.getObject() );

    const onKeyDown = function ( event ) {
        console.log(event.keyCode)

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

                case 38: // up
                case 87: // w
                    if(!moveForward) {
                        let now = new Date()

                        if(timeUntilSprintOptionDisables != null && timeUntilSprintOptionDisables > now) {
                            sprinting = true
                        }

                        now.setSeconds(now.getSeconds() + 1)
                        timeUntilSprintOptionDisables = now
                    }

                    moveForward = true;
                    break;

                case 37: // left
                case 65: // a
                    moveLeft = true;
                    break;

                case 40: // down
                case 83: // s
                    moveBackward = true;
                    break;

                case 39: // right
                case 68: // d
                    moveRight = true;
                    break;

                case 32: // space
                    if ( canJump === true ) velocity.y += 350;
                    canJump = false;
                    break;

            }
        }
    };

    const onKeyUp = function ( event ) {

        switch ( event.keyCode ) {

            case 38: // up
            case 87: // w
                moveForward = false;
                sprinting = false;
                break;

            case 37: // left
            case 65: // a
                moveLeft = false;
                break;

            case 40: // down
            case 83: // s
                moveBackward = false;
                break;

            case 39: // right
            case 68: // d
                moveRight = false;
                break;

        }

    };

    const onClick = function() {
        if(controls.isLocked === true) {
            shoot = true
        }
    }

    document.addEventListener( 'keydown', onKeyDown, false );
    document.addEventListener( 'keyup', onKeyUp, false );
    document.addEventListener("click", onClick, false);

    raycaster = new THREE.Raycaster( new THREE.Vector3(), new THREE.Vector3( 0, - 1, 0 ), 0, 10 );


    //THE MAP
    createObject([300, 0, 300], [0, 0, 0], "grey")

    //

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
    const geometry = new THREE.SphereGeometry( 0.5, 15, 15 );
    const material = new THREE.MeshBasicMaterial( {color: "red"} );
    const sphere = new THREE.Mesh( geometry, material );
    sphere.position.set(msg[0], msg[1], msg[2])
    sphere.name = "bullet" + msg[4]
    scene.add(sphere);
}

function createPlayer(playerNo) {
    const geometry = new THREE.SphereGeometry( 3, 32, 32 );
    const material = new THREE.MeshBasicMaterial( {color: "red"} );
    const sphere = new THREE.Mesh( geometry, material );
    sphere.position.set(0, 10, 0)
    scene.add(sphere);
    players[playerNo] = sphere
}

function createObject(size, pos, colour) {
    const geometry = new THREE.BoxGeometry(size[0], size[1], size[2] );
    const material = new THREE.MeshBasicMaterial( {color: colour} );
    const object = new THREE.Mesh( geometry, material );
    object.position.set(pos[0], pos[1], pos[2])
    scene.add(object);
    objects.push(object)
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
        let rotation = controlsObject.rotation

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

        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        velocity.y -= 9.8 * 100.0 * delta; // 100.0 = mass

        direction.z = Number( moveForward ) - Number( moveBackward );
        direction.x = Number( moveRight ) - Number( moveLeft );
        direction.normalize(); // this ensures consistent movements in all directions


        if ( moveForward || moveBackward ) velocity.z -= direction.z * 400.0 * delta;
        if ( moveLeft || moveRight ) velocity.x -= direction.x * 400.0 * delta;

        if(sprinting) {
            if(energy > 0) {
                velocity.z -= 12
                energy -= 0.05
            }
            else {
                sprinting = false
            }
        }
        else {
            if(energy < 20) {
                energy += 0.02
            }
        }

        document.getElementById("HUD-energy").innerHTML = Math.round(energy)

        if(pos.x > 150) {
            pos.x = 150
        }
        else if(pos.x < -150) {
            pos.x = -150
        }

        if(pos.z > 150) {
            pos.z = 150
        }
        else if(pos.z < -150) {
            pos.z = -150
        }

        if ( onObject === true ) {
            velocity.y = Math.max( 0, velocity.y );
            canJump = true;
        }

        controls.moveRight( - velocity.x * delta );
        controls.moveForward( - velocity.z * delta );

        controls.getObject().position.y += ( velocity.y * delta ); // new behavior

        if ( controls.getObject().position.y < 10 ) {
            velocity.y = 0;
            controls.getObject().position.y = 10;

            canJump = true;
        }

    }

    prevTime = time;

    renderer.render( scene, camera );

}
