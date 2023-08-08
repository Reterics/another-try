import { NodeGlobalsPolyfillPlugin } from "@esbuild-plugins/node-globals-polyfill";
import { defineConfig } from "vite";
import { splitVendorChunkPlugin } from 'vite'

export default defineConfig({
    plugins: [splitVendorChunkPlugin()],
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
    build: {
        rollupOptions: {
            /*external: ['three'],
            output: {
                globals: {
                    three: 'THREE'
                }
            }*/
        }
    }
});
