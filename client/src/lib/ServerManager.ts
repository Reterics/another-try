import {io, Socket} from "socket.io-client";
import {PlayerList, PlayerNames, PlayerScores, ServerMessage} from "../types/main.ts";
import {Hero} from "../models/hero.ts";
import {Object3D, Scene} from "three";
import {ObjectPositionMessage, PositionMessage} from "../../../types/messages.ts";
import {HUDController} from "../controllers/HUDController.ts";
import {Sphere} from "../models/sphere.ts";
import {EventManager} from "./EventManager.ts";
import {serverURL} from "../utils/model.ts";

export class ServerManager extends EventManager {
    private socket: Socket|undefined;
    private readonly players: PlayerList;
    private readonly playerNames: PlayerNames;
    private readonly scene: Scene;
    private readonly scores: PlayerScores;
    private readonly name: string;
    private active: boolean;
    private playerIndex: number | undefined;
    private hud: HUDController;

    constructor(scene: Scene, hud: HUDController) {
        super();
        this.scene = scene;
        const nameNode = document.getElementById("name") as HTMLInputElement;
        if (nameNode) {
            this.name = nameNode.value;
        } else {
            this.name = 'Player';
        }
        this.playerNames = {} as PlayerNames;
        this.players = {} as PlayerList;
        this.scores = {} as PlayerScores;
        this.hud = hud;
        this.active = false;
    }

    async get(uri: string): Promise<object | null> {
        const response = await fetch(serverURL +
            (uri.startsWith('/') ? uri.substring(1) : uri))
            .catch(e=>console.error(e));
        if (response && response.ok) {
            return await response.json()
        }
        return null;
    }

    disconnect() {
        if (this.socket) {
            this.disconnect();
        }
        this.active = false;
    }
    connect() {
        this.disconnect();
        this.socket = io(serverURL);
        this.socket.on('position', this.position.bind(this));
        this.socket.on('data', this.data.bind(this));
        this.socket.on('shoot', this.shoot.bind(this));
        this.socket.on('object', (msg: ObjectPositionMessage)=> {
            this.emit('object', msg);
        });
        this.socket.on('connect', () => {
            this.active = true;
            this.emit('connect');
        });
    }

    private position(msg: PositionMessage) {
        if(!this.players[msg[3]]) {
            this.players[msg[3]] = new Hero(this.scene, null)
                .setName(this.playerNames[msg[3]] || ('Player ' + msg[3]));
            // Async Model Load
            void this.players[msg[3]].reloadFromGltf();
        } else {
            this.players[msg[3]].changeAnimation('Walk');
            this.players[msg[3]].timeout(()=>{
                this.players[msg[3]].changeAnimation('Idle');
            }, 300);
        }
        this.players[msg[3]].moveTo(msg[0], msg[1], msg[2]);
    }

    update(delta: number) {
        for(const i in this.players) {
            const player = this.players[i];
            if (player) {
                player.update(delta);
            }
        }
    }

    private async data(msg: ServerMessage) {
        let message: string = "";

        if (msg.type == "bul col") {
            if(msg.player == this.playerIndex) {
                message = "You just got shot"
            }
            else if (msg.attacker) {
                message = "\"" + this.playerNames[msg.player] + "\" was shot by \"" + this.playerNames[msg.attacker] + "\""
            }

            if(msg.attacker && this.scores[msg.attacker] == null) { this.scores[msg.attacker] = 0 }

            if (msg.attacker) {
                this.scores[msg.attacker] += 1
            }

            this.hud.updateScores(this.playerNames, this.scores);
        }
        else if(msg.type == "config") {
            this.playerIndex = msg.player as number;
            message = "Welcome. You have successfully joined the game. Good luck :)"

            if (this.name) {
                this.socket?.emit("data", {type: "name", name: this.name})
                this.playerNames[this.playerIndex] = this.name;
            }
        }
        else if(msg.type == "name") {
            message = "\"" + msg.name + "\" has just joined."
            this.playerNames[msg.player] = msg.name;
        }
        else if(msg.type == "msg") {
            message = "<b>" + this.playerNames[msg.player] + ": </b>" + msg.msg
        }
        else if(msg.type == "disconnected") {
            message = "Player \"" + this.playerNames[msg.player] + "\" just disconnected."
        }

        if(message) {
            this.hud.onMessage(message);
        }
    }

    private shoot(msg: PositionMessage) {
        if(msg.length == 1) {
            let bullet = this.scene.getObjectByName("bullet" + msg[0]);
            if (bullet instanceof Object3D) {
                this.scene.remove(bullet)
            }
        }
        else {
            let bullet = this.scene.getObjectByName("bullet" + msg[4]);
            if (!bullet) {
                const sphere = new Sphere(this. scene, 0.5, 15, 15, 'red');
                sphere.setPosition(msg[0], msg[1], msg[2]);
                sphere.name = "bullet" + msg[4];
                sphere.addToScene();
            }
            else {
                bullet.position.set(msg[0], msg[1], msg[2])
            }
        }
    }

    send (ev:string, ...args: any[]) {
        if (this.socket) {
            this.socket.emit(ev, ...args);
        }
    }

    isActive() {
        return !!this.socket && this.active;
    }
}