import http from "http";
import https from "https";

interface StringObject {
    [key: string]: string|null
}

interface RequestParamObject {
    path?: string,
    method?: string,
    headers? : StringObject,
    hostname?: string,
    port?: number
}

export function getRequestParams (url: string, opt: RequestParamObject = {}){
    if (!opt.headers){
        opt.headers = {};
    }
    if (!opt.headers['User-Agent']) {
        opt.headers['User-Agent'] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36";
    }
    const parsedHost = url.split('/').splice(2).splice(0, 1).join('/');
    opt.hostname = parsedHost;
    opt.port = 443;

    if (parsedHost && !opt.path) {
        opt.path = url.split('/').splice(3).join('/');
    }

    if (!parsedHost && !url.startsWith("http")){
        return getRequestParams("https://" + url);
    }
    return opt
}

export function httpsPromise(options: any):Promise<{
    status: number | undefined;
    headers: http.IncomingHttpHeaders;
    body: Buffer;
}> {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res:http.IncomingMessage) => {
            const chunks: any[] | Uint8Array[] = [];

            // A chunk of data has been received.
            res.on('data', (chunk: Uint8Array) => {
                chunks.push(chunk);
            });

            // The whole response has been received.
            res.on('end', () => {
                const response = {
                    status: res.statusCode,
                    headers: res.headers,
                    body: Buffer.concat(chunks),
                } as {
                    status: number | undefined;
                    headers: http.IncomingHttpHeaders;
                    body: Buffer;
                };

                resolve(response);
            });
        });

        // Handle errors
        req.on('error', (error: any) => {
            reject(error);
        });

        // End the request
        req.end();
    });
}