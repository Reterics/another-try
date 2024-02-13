import {firebaseCollections, getById} from "../firebase/config";
import {ATMap} from "../../types/map";


class MapService {
    async get(id: string) {
        return await getById(id, firebaseCollections.maps) as ATMap | null;
    }

    fallback() : ATMap {
        return {
            id: 'fallback',
            name: 'Scene on Siménai by hillforts.eu',
            items: [
                {
                    type: "model",
                    path: 'assets/scenes/simenai/simenai.glb',
                    name: 'simenai'
                }
            ],
            texture: './assets/scenes/simenai/textures/Simenai_diffuse.jpeg'
        }
    }
}


export default new MapService();