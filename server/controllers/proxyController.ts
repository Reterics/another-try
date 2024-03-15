import express from "express";
import {getRequestParams, httpsPromise} from "../lib/restAPI";



class ProxyController {

    async get (req: express.Request, res: express.Response) {
        let url;
        if (req.params && req.params.url) {
            url = req.params.url;
        } else if (req.query && req.query.url) {
            url = req.query.url;
        } else if (req.body && req.body.url) {
            url = req.body.url;
        }
        if (!url) {
            return res.sendStatus(400);
        }

        const options = getRequestParams(url, {
            path: undefined,
            method: "GET",
            headers: {
                'User-Agent': req.header('user-agent') || null
            }
        });
        const response = await httpsPromise(options);
        for (const key in response.headers) {
            if (response.headers[key]) res.setHeader(key, response.headers[key] as string);
        }
        res.status(response.status || 200).send(response.body);
    }
}

export default new ProxyController();