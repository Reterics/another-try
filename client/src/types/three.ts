import {Group, Mesh} from "three";

export type Active3DMode = 'far'|'size'|'precision'|'pointer';

export type ControllerView = 'tps'|'fps';

export type MeshOrGroup = Mesh | Group;

export interface RenderedPlane extends Mesh {
    isHeightMap?: boolean
}
