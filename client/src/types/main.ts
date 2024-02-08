import * as THREE from "three";
import {Hero} from "../models/hero.ts";

export interface EventList {
    [key: string]: Function[]
}
export interface PlayerList {
    [key: number|string]: Hero
}
export interface PlayerNames {
    [key: number|string]: string|null|undefined
}
export interface GeneralObject {
    [key: string]: string|null|undefined|string[]|number[]|boolean|number
}

export interface PlayerScores {
    [key: number|string]: number
}
export interface ServerMessage extends GeneralObject {
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

export interface SceneParams {
    displayCollider: boolean,
    displayBVH: boolean,
    visualizeDepth: number,
    gravity: number,
    playerSpeed: number,
    physicsSteps: number,  //5
    spawnCoordinates: number[] // X Y Z
}