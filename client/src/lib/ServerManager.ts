import {io, Socket} from "socket.io-client";
import {EventList, PlayerList, PlayerNames, PlayerScores, ServerMessage} from "../types/main.ts";
import {Hero} from "../models/hero.ts";
import {Object3D, Scene} from "three";
import {PositionMessage} from "../../../types/messages.ts";
import {HUDController} from "../controllers/HUDController.ts";
import {Sphere} from "../models/sphere.ts";

const serverURL = '//localhost:3000/';
export class ServerManager {
    private socket: Socket|undefined;
    private readonly players: PlayerList;
    private readonly playerNames: PlayerNames;
    private readonly scene: Scene;
    private readonly scores: PlayerScores;
    private readonly name: string;
    private playerIndex: number | undefined;
    private hud: HUDController;
    private readonly events: EventList;

    constructor(scene: Scene, hud: HUDController) {
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
        this.events = {};
    }

    on (event: string, method: () => void, preventAll = false) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        if (preventAll || !this.events[event].find(ev=>ev === method)) {
            this.events[event].push(method);
        }
    }

    trigger(event: string) {
        if (this.events[event]) {
            for (let i = 0; i < this.events['connect'].length; i++) {
                this.events[event][i]();
            }
        }
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
    }
    connect() {
        this.disconnect();
        this.socket = io(serverURL);
        this.socket.on('position', this.position.bind(this));
        this.socket.on('data', this.data.bind(this));
        this.socket.on('shoot', this.shoot.bind(this));
        this.socket.on('connect', () => this.trigger('connect'));
    }

    private async position(msg: PositionMessage) {
        if(this.players[msg[3]] == null) {
            this.players[msg[3]] = (await Hero.Create(this.scene)).addToScene()
        }
        this.players[msg[3]].moveTo(msg[0], msg[1], msg[2]);
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

    emit (ev:string, ...args: any[]) {
        if (this.socket) {
            this.socket.emit(ev, ...args);
        }
    }

    isActive() {
        return !!this.socket;
    }
}