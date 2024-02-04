import http from "http";
import https from "https";


export interface httpResponse {
    status: number | undefined;
    headers: http.IncomingHttpHeaders;
    body: Buffer;
}

export type httpInput = string | https.RequestOptions | URL;