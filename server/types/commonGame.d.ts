
export interface PlayerPosition {
    x: number
    y: number
    z: number
}

export interface Game {
    players: number
    bullets: number
    playerPositions: PlayerPosition[]
    playerNames: string[]
    scores: number[]
}
