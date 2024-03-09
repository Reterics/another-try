import {firebaseCollections, getById, getCollection} from "../firebase/config";
import {ATMap} from "../../types/map";
import {AssetObject} from "../../types/assets";


class MapService {
    async getAll() {
        const maps = await getCollection(firebaseCollections.maps) as AssetObject[];
        for (let i = 0; i < maps.length; i++) {
            maps[i].selected = undefined;
        }
        return maps.filter(map => map.name && map.name.match(/(\d{4}-\d{4})/g));
    }

    async get(id: string) {
        return await getById(id, firebaseCollections.maps) as ATMap | null;
    }

    fallback() : ATMap {
        return {
            id: 'fallback',
            items: []
        }
    }
}


export default new MapService();