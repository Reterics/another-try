import {Box3, Mesh} from "three";
import type { EventBus } from "@game/shared";

export interface ShadowType extends Mesh {
    refType?: string
}

export interface MousePositionType {
    clientX: number
    clientY: number
}

export type MouseEventLike = WheelEvent|MouseEvent|MousePositionType

export interface MinimapInputArguments {
    boundingBox?: Box3
    texture?: string
    target?: HTMLDivElement
    eventBus?: EventBus
}

export interface MinimapDimensions {
    top: number
    left: number
    bottom: number
    right: number
    width: number
    height: number
}
