import express from 'express';
import AssetService from "../services/assetService";


class AssetController {
    async getAll(req: express.Request, res: express.Response) {

        res.status(200).send(await AssetService.getAll());
    }

    async get(req: express.Request, res: express.Response) {
        let id;
        if (req.params && req.params.id) {
            id = req.params.id;
        } else if (req.query && req.query.id) {
            id = req.query.id;
        } else if (req.body && req.body.id) {
            id = req.body.id;
        }
        if (!id) {
            return res.sendStatus(400);
        }
        const asset = await AssetService.get(id);
        if (asset) {
            return res.status(200).send(asset);
        }
        res.sendStatus(404);
    }
}

export default new AssetController();