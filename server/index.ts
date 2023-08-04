import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import { Server } from "socket.io";
import {GameController} from "./controllers/Game";

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3000;

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
