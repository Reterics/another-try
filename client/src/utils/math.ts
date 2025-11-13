import {Point, Rectangle} from "../../../types/assets.ts";
import {Coord, Position} from "../types/math.ts";
import {Vector3} from "three";

export const degToRad = (degrees: number) => (Math.PI / 180) * degrees;

export const getDistance = (x1: number, y1: number, x2: number, y2: number) => {
    const y = x2 - x1, x = y2 - y1;

    return Math.sqrt(x * x + y * y);
};

export const isPointInRectangle = (point: Point, rectangle: Rectangle) => {
    // Check if the point is within the rectangle's bounds
    return point.x >= rectangle.x &&
        point.x <= rectangle.x + rectangle.w &&
        point.y >= rectangle.y &&
        point.y <= rectangle.y + rectangle.h;
};

export const isPointOnLine = (x: number, y: number, x1: number, y1: number, x2: number, y2: number) => {
    const m = (y2 - y1) / (x2 - x1);
    const b = y1 - m * x1;

    // Check if the point is on the line
    return Math.abs(y - (m * x + b)) < 1e-6; // Use a small epsilon to account for floating-point precision issues
};

export const isPointInsideCircle = (x: number, y: number, centerX: number, centerY: number, radius: number) => {
    const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
    return distance < radius;
};

export const math = {
    range: (a: number, b:number) => Math.random() * (b - a) + a,
    rand: (a: number, b: number) => Math.round(math.range(a, b))
}

export const roundToPrecision = (value: number, precision: number) => {
    const multiplier = Math.pow(10, precision || 0);
    return Math.round(value * multiplier) / multiplier;
}

export const stringToCoord = (name: string): Coord => {
    const parts = name.split('-');
    const x = Number(parts.shift() || 0);
    const y = Number(parts.shift() || 0);
    return [
        Number.isNaN(x) ? 0 : x,
        Number.isNaN(y) ? 0 : y
    ];
};

export const coordToString = (coord: Coord): string => {
    const x = coord[0] < 0 ? 1000 + coord[0] : coord[0];
    const y = coord[1] < 0 ? 1000 + coord[1] : coord[1];

    return x.toString().padStart(4, '0') + '-' + y.toString().padStart(4, '0')
}

export const vector3ToCoord = (position: Vector3): Coord => {
    let x = Math.floor(position.x / 1000),
        y = Math.floor(position.z / 1000);
    return [x, y]
}

export const coordToCoordDiff = (target: Coord, source: Coord): Vector3 => {
    // Compute world-space delta vector between tile coordinates.
    // Each tile is 1000 units wide, and our world axes use X (east-west) and Z (north-south).
    // Delta should be target - source, not a sum.
    const xDiff = (target[0] - source[0]);
    const yDiff = (target[1] - source[1]);
    return new Vector3(xDiff * 1000, 0, yDiff * 1000);
}

export const getCoordNeighbours = (position: Position, limit = 100) => {
    const xMin = 1000 * Math.floor(position[0] / 1000) + limit,
        xMax = 1000 * Math.ceil(position[0] / 1000) - limit,
        yMin = 1000 * Math.floor(position[1] / 1000) + limit,
        yMax = 1000 * Math.ceil(position[1] / 1000) - limit;

    const output: Coord[] = [];

    // West
    if (position[0] < xMin) {
        output.push([Math.floor(position[0] / 1000) - 1, Math.floor(position[1] / 1000)]);
    }
    // East
    if (position[0] > xMax) {
        output.push([Math.ceil(position[0] / 1000), Math.floor(position[1] / 1000)]);
    }
    // North
    if (position[1] < yMin) {
        output.push([Math.floor(position[0] / 1000), Math.floor(position[1] / 1000) - 1]);
    }
    // South
    if (position[1] > yMax) {
        output.push([Math.floor(position[0] / 1000), Math.ceil(position[1] / 1000)]);
    }
    // Southwest
    if (position[0] < xMin && position[1] > yMax) {
        output.push([Math.floor(position[0] / 1000) - 1, Math.ceil(position[1] / 1000)]);
    }
    // Northwest
    if (position[0] < xMin && position[1] < yMin) {
        output.push([Math.floor(position[0] / 1000) - 1, Math.floor(position[1] / 1000) - 1]);
    }
    // Southeast
    if (position[0] > xMax && position[1] > yMax) {
        output.push([Math.ceil(position[0] / 1000), Math.ceil(position[1] / 1000)]);
    }
    // Northeast
    if (position[0] > xMax && position[1] < yMin) {
        output.push([Math.ceil(position[0] / 1000), Math.floor(position[1] / 1000) - 1]);
    }

    return output;
};