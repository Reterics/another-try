<p align="center">
  <img src="./client/public/assets/images/png/logo-no-background.png" alt="Another Try Logo" height="85"/>
</p>

[![backend](https://github.com/Reterics/another-try/actions/workflows/npm-build-backend.yml/badge.svg)](https://github.com/Reterics/another-try/actions/workflows/npm-build-backend.yml) [![frontend](https://github.com/Reterics/another-try/actions/workflows/npm-build-frontend.yml/badge.svg)](https://github.com/Reterics/another-try/actions/workflows/npm-build-frontend.yml) [![License: GPLv3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://opensource.org/license/gpl-3-0)

Another Try is a TypeScript-first, web-native multiplayer RPG targeting WebGL2-class devices. The project focuses on procedural generation, scalable networking, and rendering techniques that remain performant on low-end hardware.

> Vision: An infinite, procedural, multiplayer world that runs on low-end devices.

---

## Status

- Stage: Pre-Alpha (active development)
- Client: Vite + Three.js + custom GLSL pipeline
- Server: Node.js + Express + Socket.IO

Screenshots:

![ingame5.png](client/public/ingame5.png)

---

## Architecture Overview

- Monorepo with separate `client` and `server` packages.
- Client renders a procedurally generated world using Three.js and custom shaders.
- Server provides real-time state sync and session orchestration over WebSockets (Socket.IO) with REST endpoints where appropriate.
- Asset management via Firebase Storage (planned/experimental) to offload static/procedural artifacts.

High-level data flows:

- Player input → client-side prediction → reconciliation from server snapshots.
- Procedural terrain and environment chunks streamed/instantiated on demand.
- Deterministic seeds to ensure consistent generation across clients/servers when feasible.

---

## Tech Stack

- Language: TypeScript (client and server)
- Client:
  - Three.js (WebGL2)
  - Vite build tool
  - Custom GLSL shaders (terrain, water, clouds, grass impostors)
- Server:
  - Node.js 18+
  - Express
  - Socket.IO
  - Firebase (storage integration)
- Tooling / Infra:
  - GitHub Actions (frontend/backend build workflows)
  - npm workstreams (per-package scripts)

---

## Repository Layout

```
another-try/
├─ client/                  # Web client (Vite, Three.js, shaders)
│  ├─ public/               # Static assets (images, textures, screenshots)
│  ├─ src/                  # Application code
│  │  ├─ models/            # Domain-specific render/game objects (terrain, grass, hero, etc.)
│  │  └─ ...
│  └─ vite.config.ts        # Build configuration
├─ server/                  # Game backend (Node.js, Express, Socket.IO)
│  ├─ services/             # Backend services (e.g., assets)
│  ├─ firebase/             # Firebase integrations
│  └─ ...                   # Entry compiled to dist/server/index.js
├─ types/                   # Shared TypeScript types/interfaces
├─ .github/workflows/       # CI pipelines (frontend/backend)
├─ LICENSE
├─ README.md
└─ REFERENCE_README.md      # Style reference used for this README
```

---

## Getting Started

Prerequisites:

- Node.js 18+ and npm 9+
- Modern browser with WebGL 2.0 support

Check versions:

```bash
node --version
npm --version
```

### Quick Start (local, two terminals)

Client:

```bash
cd client
npm install
npm run dev
```

Server:

```bash
cd server
npm install
npm run start
```

Builds:

```bash
# Client production build
cd client && npm run build

# Server transpile only
cd server && npm run build
```

---

## Configuration

Server environment variables (create a `.env` in `server/`):

```
# Example placeholders — replace with real values
PORT=3000
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...   # use proper escaping for newlines in .env
STORAGE_BUCKET=...
```

Client configuration:

- Vite aliases and polyfills are configured in `client/vite.config.ts` for browser compatibility (`process`, `stream`, `util`).
- Assets live under `client/public` and are served directly in dev/prod builds.

---

## Development Notes

- Shaders: GLSL sources live under `client/src/models/**` (e.g., `cloud.vert`, `cloud.frag`).
- Rendering: Uses Three.js primitives with optimizations such as BVH acceleration (e.g., `three-mesh-bvh`) for interactions like character movement.
- Procedural Content: Terrain/grass/water pipelines are iterating; expect breaking changes during Pre-Alpha.
- Networking: Socket.IO used for real-time transport; client-side prediction and reconciliation are under development.

Common scripts:

```bash
# Client
npm run dev       # hot-reload dev server
npm run build     # production build

# Server
npm run start     # transpile then start dist/server/index.js
npm run build     # typescript -> dist
```

---

## Roadmap (abridged)

- Pre-Alpha:
  - Procedural terrain generation and chunk streaming
  - Base building blocks and world interaction
  - Multiplayer session sync and chat
- Alpha:
  - NPCs (fauna, humanoids)
  - Extended building system
  - Improved shaders (terrain, grass, water, atmosphere)
- Early Access:
  - Accounts and basic progression
  - Character customization
  - Day/night and weather systems
  - Chat improvements
- Open Beta:
  - Hunting, items, quests, vendors

For detailed planning and issue tracking, see GitHub Issues and Projects.

---

## Troubleshooting

- Ensure WebGL 2.0 is enabled in the browser; check GPU/driver support.
- Clear Vite cache when changing shader or asset pipelines: delete `client/node_modules/.vite` and restart dev server.
- Verify `.env` on the server for Firebase credentials and correct bucket names.

---

## License

GPLv3 — see [LICENSE](LICENSE).

## Credits

- [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) for spatial acceleration used in movement/collision.
