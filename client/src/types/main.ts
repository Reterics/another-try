import {Player} from "../models/player.ts";
import * as THREE from "three";

export interface PlayerList {
    [key: number|string]: Player
}
export interface PlayerNames {
    [key: number|string]: string|null|undefined
}
export interface PlayerScores {
    [key: number|string]: number
}
export interface ServerMessage {
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