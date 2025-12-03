export type AssetType = 'cursor'|'point'|'circle'|'rect'|'line'|'model'|'plane'|'water';

export interface Asset {
    id?: string,
    name?: string,
    image?: string,
    type: AssetType,
    x?: number,
    y?: number,
    z?: number,
    /**
     * Optional target height in meters for 3D models (1 unit = 1 meter).
     * If provided for a model asset, the loader will uniformly scale the scene to match this height.
     */
    heightMeters?: number,
    color?: string,
    selected?:boolean,
    texture?:string,
    path?:string,
    screenshot?:string
}

export interface Point extends Asset {
    type: 'point',
    x: number,
    y: number
}

export interface Circle extends Asset{
    type: 'circle',
    x: number,
    y: number,
    radius: number,
    startAngle?: number,
    endAngle?: number,
    anticlockwise?: boolean
}

export interface Rectangle extends Asset {
    type: 'rect',
    x: number,
    y: number,
    w: number,
    h: number,
}

export interface Line extends Asset {
    type: 'line',
    x1: number,
    y1: number,
    x2: number,
    y2: number
}

export type AssetObject = Asset|Rectangle|Circle|Line|Point|PlaneConfig;

export interface ObjectDimensions {
    width: number,
    height: number,
    depth: number
}

export interface PlaneConfig extends Asset {
    type: 'plane'
    size: number,
    texture:string
}

export interface WaterConfig extends Asset {
    type: 'water'
    flowMap?: string,
    normalMap0?: string,
    normalMap1?: string
}
