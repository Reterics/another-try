import { NodeGlobalsPolyfillPlugin } from "@esbuild-plugins/node-globals-polyfill";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
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
            // Workspace packages (use source during development for hot reload)
            "@game/shared": fileURLToPath(new URL("../packages/shared/src/index.ts", import.meta.url)),
            "@game/ui": fileURLToPath(new URL("../packages/ui/src/index.tsx", import.meta.url)),
            // Project path aliases
            "@app": fileURLToPath(new URL("./src", import.meta.url)),
            "@engine": fileURLToPath(new URL("./src/engine", import.meta.url)),
            "@features": fileURLToPath(new URL("./src/features", import.meta.url)),
            "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
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
