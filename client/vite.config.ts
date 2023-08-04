import { NodeGlobalsPolyfillPlugin } from "@esbuild-plugins/node-globals-polyfill";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [],
    optimizeDeps: {
        esbuildOptions: {
            define: {
                global: "globalThis",
            },
            plugins: [
                NodeGlobalsPolyfillPlugin({
                    process: true,
                    buffer: true,
                }),
            ],
        },
    },
    resolve: {
        alias: {
            process: "process/browser",
            stream: "stream-browserify",
            util: "util",
        },
    },
});
