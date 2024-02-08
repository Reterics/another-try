

export type PositionMessage = number[];

export interface ObjectPositionMessage {
    coordinates: number[]
    asset: number
    type?: 'object'
}