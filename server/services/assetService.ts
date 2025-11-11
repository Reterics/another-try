import {getFileURL} from "../firebase/storage";
import {AssetObject} from "../../types/assets";
import {firebaseCollections, getById, getCollection} from "../firebase/config";
import {downloadURL} from "../lib/commons";


class AssetService {
    async getAll() {
        const assets = (await getCollection(firebaseCollections.assets)) as AssetObject[];
        for (let i = 0; i < assets.length; i++) {
            if (assets[i].name && !assets[i].image) {
                assets[i].image = await getFileURL('screenshots/' + assets[i].name + '.png');
                if (assets[i].image) {
                    const url = assets[i].image as string;
                    const imageBuffer = await downloadURL(url).catch(e=>console.error(e));
                    if (imageBuffer && imageBuffer.body) {
                        assets[i].image = imageBuffer.body.toString('base64');
                    }
                }
            }
        }
        return assets;
    }

    async get(id: string) {
        const asset = await getById(id, firebaseCollections.assets) as AssetObject|null;
        if (!asset) {
            return null;
        }

        if (!asset.image && asset.name) {
            asset.image = await getFileURL('screenshots/' + asset.name + '.png');
            if (asset.image) {
                const url = asset.image as string;
                const imageBuffer = await downloadURL(url).catch(e=>console.error(e));
                if (imageBuffer && imageBuffer.body) {
                    asset.image = imageBuffer.body.toString('base64');
                }
            }
        }
        if (asset.path && asset.path.startsWith('files')) {
            asset.path = await getFileURL(asset.path);
        }
        return asset;
    }
}

export default new AssetService();