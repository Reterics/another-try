import path from "path";
import * as fs from "fs";
import {Asset} from "../../types/assets";


class CacheService {
    private readonly folder?: string;

    constructor(folder: string|undefined) {
        if (folder && fs.existsSync(folder)) {
            const cacheFolder = path.resolve(folder, 'cache');
            if (!fs.existsSync(cacheFolder)) {
                fs.mkdirSync(cacheFolder);
            }
            this.folder = cacheFolder;
            console.log('set ', this.folder);
        }
    }

    get(id: string): Asset|null {
        if (!this.folder) {
            return null;
        }
        const assetPath = path.resolve(this.folder, id);
        if (fs.existsSync(assetPath)) {
            let asset;
            try {
                asset = JSON.parse(fs.readFileSync(assetPath).toString()) as Asset;
            } catch (e) {
                console.warn('Invalid cache file');
            }
            if (asset) {
                return asset;
            }
        }
        return null;
    }

    set(asset: Asset) {
        if (!this.folder || !asset.id) {
            return false;
        }
        const assetPath = path.resolve(this.folder, asset.id);
        if (!fs.existsSync(assetPath)) {
            try {
                fs.writeFileSync(assetPath, JSON.stringify(asset));
                return true;
            } catch (e) {
                console.warn('Failed to save asset');
            }
        }
        return false;
    }
}


export default new CacheService(process.env.CLIENT_ASSETS || './cache')