// Shared type definitions used across the game

export type Active3DMode = 'far' | 'size' | 'precision' | 'pointer';

export type ControllerView = 'tps' | 'fps';

export type AssetType = 'cursor' | 'point' | 'circle' | 'rect' | 'line' | 'model' | 'plane' | 'water';

export interface Asset {
  id?: string;
  name?: string;
  image?: string;
  type: AssetType;
  x?: number;
  y?: number;
  z?: number;
  color?: string;
  selected?: boolean;
  texture?: string;
  path?: string;
  screenshot?: string;
}

export interface Point extends Asset {
  type: 'point';
  x: number;
  y: number;
}

export interface Circle extends Asset {
  type: 'circle';
  x: number;
  y: number;
  radius: number;
  startAngle?: number;
  endAngle?: number;
  anticlockwise?: boolean;
}

export interface Rectangle extends Asset {
  type: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Line extends Asset {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PlaneConfig extends Asset {
  type: 'plane';
  size: number;
  texture: string;
}

export interface WaterConfig extends Asset {
  type: 'water';
  flowMap?: string;
  normalMap0?: string;
  normalMap1?: string;
}

export type AssetObject = Asset | Rectangle | Circle | Line | Point | PlaneConfig;

export interface ObjectDimensions {
  width: number;
  height: number;
  depth: number;
}

// Message types
export type PositionMessage = number[];

export interface ObjectPositionMessage {
  coordinates: number[];
  asset: number;
  type?: 'object';
}

// Map types
export interface ATMap {
  id: string;
  name?: string;
  author?: string;
  items: AssetObject[];
  texture?: string;
}

export interface ATMapsObject {
  [key: string]: ATMap | undefined;
}
