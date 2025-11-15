import { BufferGeometry, Clock, Mesh, RawShaderMaterial, Scene, Object3D, Vector3 } from "three";

export interface Grass {
    clock: Clock;
    scene: Scene;
    readonly instances: number;
    readonly grassMaterial: RawShaderMaterial;
    size: number;
    mesh?: Mesh<BufferGeometry, RawShaderMaterial>;
    enabled: Boolean;
    geometry: BufferGeometry;

    getFromScene: ()=>Object3D|undefined

    regenerateGrassCoordinates: ()=>void
    addToScene: ()=>void
    refresh: (cameraPosition?: Vector3)=>void
    destroy: ()=>void
    isEnabled: (bool: boolean)=>Boolean
    setSize: (size: number)=>void
    setAnchor: (anchor: Vector3)=>void
    setSampler: (sampler: (x: number, z: number)=>number)=>void
}

export interface GrassOptions {
    instances?: number
    size?: number
    enabled?: boolean
    sampler?: (x: number, z: number)=>number
    anchor?: Vector3
}

export interface GrassManagerOptions {
    patchRadius?: number
    instancesPerPatch?: number
    maxPatches?: number
    enabled?: boolean
    lodSteps?: number[]
    windIntensity?: number
    impostorRadius?: number
    impostorDensity?: number
}
