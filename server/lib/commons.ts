import * as https from "https";
import http from "http";
import {httpInput, httpResponse} from "../types/network";

export function isInMargin(playerPos: number, bulletPos: number) {
    let marginSize = 5
    let bottomMargin = bulletPos - (marginSize / 2)
    let topMargin = bulletPos + (marginSize / 2)

    return (playerPos > bottomMargin) && (playerPos < topMargin);
}


export async function downloadURL(options: httpInput):Promise<httpResponse> {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res:http.IncomingMessage) => {
            const chunks: Uint8Array[] = [];

            res.on('data', (chunk: Uint8Array) => {
                chunks.push(chunk);
            });

            res.on('end', () => {
                const response = {
                    status: res.statusCode,
                    headers: res.headers,
                    body: Buffer.concat(chunks),
                } as httpResponse;

                resolve(response);
            });
        });

        req.on('error', (error: Error) => {
            reject(error);
        });

        req.end();
    });
}