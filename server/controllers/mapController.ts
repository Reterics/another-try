import express from "express";
import MapService from "../services/mapService";


class MapController {
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
            return res.status(200).send(MapService.fallback());
        }
        const map = await MapService.get(id);
        if (map) {
            return res.status(200).send(map);
        }
        res.sendStatus(404);
    }
}

export default new MapController();