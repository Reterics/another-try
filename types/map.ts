import {AssetObject} from "./assets";

export interface ATMap {
    id: string,
    name?: string,
    author?: string,
    items: AssetObject[],
    texture?: string
}