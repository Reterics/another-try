import { Group, Mesh } from "three";
import { Water } from "three/examples/jsm/objects/Water2";
import {Object3D} from "three/src/core/Object3D";

export type Active3DMode = 'far'|'size'|'precision'|'pointer';

export type ControllerView = 'tps'|'fps';

export type MeshOrGroup = Mesh | Group;

export interface RenderedPlane extends Mesh {
    heightMap?: string
}

export interface RenderedWater extends Water {
    flowMap?: string
}

export interface TerrainEnvironment {
    name: string,
    environment: Group,
    shaders: Object3D[]
}