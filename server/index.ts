import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server } from "socket.io";
import {GameController} from "./controllers/game";

dotenv.config({
    path: process.cwd() + '/.env'
});

const app: Express = express();
const port = process.env.PORT || 3000;

import AssetController from "./controllers/assetController";
import MapController from "./controllers/mapController";

app.use(cors())


app.route('/assets')
    .get(AssetController.getAll)
app.route('/asset')
    .get(AssetController.get)
app.route('/map')
    .get(MapController.get)

app.get('/', (req: Request, res: Response) => {
    res.send('Another Try Server');
});

const server = require('http').createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*'
    }
});

const gameController = new GameController(io);

io.on('connection', (socket) => {
    gameController.connectPlayer(socket);
});

server.listen(port);
