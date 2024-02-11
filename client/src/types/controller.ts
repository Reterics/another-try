import { Mesh } from "three";

export interface ShadowType extends Mesh {
    refType?: string
}

export interface MousePositionType {
    clientX: number
    clientY: number
}

export type MouseEventLike = WheelEvent|MouseEvent|MousePositionType