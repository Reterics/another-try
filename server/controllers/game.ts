import {Game} from "../types/commonGame";
import {DefaultEventsMap} from "socket.io/dist/typed-events";
import {Server, Socket} from "socket.io";
import {isInMargin} from "../lib/commons";


export class GameController {
    io: Server;
    games: Game[];
    maxPlayers: number

    constructor(io: Server, maxPlayers: number = 4) {
        this.games = [];
        this.io = io;
        this.maxPlayers = 4;
    }

    connectPlayer(socket: Socket<DefaultEventsMap>) {
        let playerNumber: number;
        let lastGameId = this.games.length - 1;

        let i = 0;
        while (this.games[i]) {
            if (this.games[i] && this.games[i].players < this.maxPlayers) {
                lastGameId = i;
            }
            i++;
        }
        if (!this.games.length || this.games[lastGameId].players >= 4) {
            this.games.push({
                    players: 1,
                    bullets: 0,
                    playerPositions: [{x: 0, y: 0, z: 0}],
                    playerNames: ["Player 1"], scores: [0]
                }
            );
            playerNumber = 0;
            lastGameId = this.games.length - 1;
        }

        this.games[lastGameId].players++;
        playerNumber = this.games[lastGameId].players - 1;

        this.games[lastGameId].playerPositions[playerNumber] = {x: 0, y: 0, z: 0};
        this.games[lastGameId].playerNames[playerNumber] = "Player " + playerNumber
        this.games[lastGameId].scores[playerNumber] = 0;
        const game = this.games[lastGameId];

        socket.join(lastGameId.toString())

        socket.emit("data", {type: "config", player: playerNumber})

        socket.on('data', (msg) => {
            if (msg.type == "name") {
                game.playerNames[playerNumber] = msg.name;
                socket.broadcast.to(lastGameId.toString()).emit("data", {
                    type: "name",
                    "player": playerNumber,
                    "name": msg.name
                })

                game.playerNames.forEach((playerName, player) => {
                    if (player != playerNumber) {
                        socket.emit("data", {
                            type: "name",
                            "player": player,
                            "name": game.playerNames[player],
                            past: true
                        })
                    }
                });
            } else if (msg.type == "msg") {
                if (msg.msg != null) {
                    let message = msg.msg

                    if (message.length > 65) {
                        message = message.substring(0, 62) + "..."
                    }

                    this.io.to(lastGameId.toString()).emit("data", {type: "msg", msg: message, player: playerNumber})
                }
            }
        });

        socket.on('object', (msg) => {
            if (msg && msg.type === "object" && Array.isArray(msg.coordinates) && msg.asset) {
                this.io.to(lastGameId.toString()).emit("object", {coordinates: msg.coordinates, asset: msg.asset});
            }
        })

        socket.on('position', (msg) => {
            if (Array.isArray(msg) && msg.length == 3) {
                if (typeof msg[0] == "number" && typeof msg[1] == "number" && typeof msg[2] == "number") {
                    game.playerPositions[playerNumber].x = msg[0]
                    game.playerPositions[playerNumber].y = msg[1]
                    game.playerPositions[playerNumber].z = msg[2]

                    msg.push(playerNumber)
                    socket.broadcast.to(lastGameId.toString()).emit("position", msg)
                }
            }
        });

        socket.on('shoot', (msg) => {
            if (Array.isArray(msg) && msg.length == 4) {
                if (typeof msg[0] == "number" && typeof msg[1] == "number" && typeof msg[2] == "number" && typeof msg[3] == "object") {
                    game.bullets++
                    msg.push(game.bullets)
                    this.io.to(lastGameId.toString()).emit("shoot", msg)

                    msg[0] += 4 * msg[3].x
                    msg[1] += 4 * msg[3].y
                    msg[2] += 4 * msg[3].z

                    this.bulletCollisionCheck(msg[0], msg[1], msg[2], lastGameId, playerNumber)

                    let count = 0
                    let interval = setInterval(() => {
                        count++;

                        msg[0] += msg[3].x
                        msg[1] += msg[3].y
                        msg[2] += msg[3].z

                        this.bulletCollisionCheck(msg[0], msg[1], msg[2], lastGameId, playerNumber)

                        this.io.to(lastGameId.toString()).emit("shoot", msg)

                        if (count == 100) {
                            clearInterval(interval)
                            this.io.to(lastGameId.toString()).emit("shoot", [msg[4]])
                        }
                    }, 10);
                }
            }
        });
        socket.on('disconnect', () => {
            console.log('user disconnected');

            this.io.to(lastGameId.toString()).emit("data", {type: "disconnected", player: playerNumber})

            game.players -= 1;
        });
    }

    bulletCollisionCheck(x: number, y: number, z: number, gameId: number, playerNumber: number) {
        const playerCollisions: number[] = []
        this.games[gameId].playerPositions.forEach((playerName, player) => {
            let thisPlayer = this.games[gameId].playerPositions[player]
            let inXMargin = isInMargin(thisPlayer.x, x)
            let inYMargin = isInMargin(thisPlayer.y, y)
            let inZMargin = isInMargin(thisPlayer.z, z)

            if (inXMargin && inYMargin && inZMargin) {
                if (player != playerNumber) {
                    if (!playerCollisions.includes(player)) {
                        this.io.to(gameId.toString()).emit("data", {type: "bul col", player: player, attacker: playerNumber})
                        this.games[gameId].scores[playerNumber] += 1
                        playerCollisions.push(player)
                    }
                }
            }
        });
    }


}
