# Battle Among Regions — Development Workflow

## Architecture

The game has **three deployment targets** built from the same codebase:

| Target | How it runs | Purpose |
|---|---|---|
| **Vite Dev Server** | `npm run dev` → localhost:3000 | Day-to-day gameplay testing & development |
| **Netlify** (static site) | Auto-deploys from git → `npm run build` → serves `dist/` | Online/web version (shareable link) |
| **Render.com** (WebSocket server) | Runs `node server/server.mjs` | Online multiplayer backend (pairs with Netlify) |
| **Electron** | `npm run electron:build` → portable `.exe` | Desktop/offline distribution |

## Development Workflow

### 1. Work & Test Locally First — Always

- Run `npm run dev` (or `start_game.bat`) to launch the Vite dev server.
- Test all gameplay changes here before committing. Fast hot-reload, no deployment wait.
- For online multiplayer testing locally, run `npm run server` in a second terminal alongside `npm run dev`.

### 2. Git — Commit to `main` Only When Stable

- Don't push half-finished features. Work locally, playtest, then commit.
- Use **feature branches** (`git checkout -b feature/new-mechanic`) for anything experimental.
- Merge to `main` only when the feature is working.
- Every push to `main` = a new live Netlify deployment. Treat `main` as **production**.

### 3. Netlify — Public-Facing Web Build

- Netlify runs `npm run build` (optimize images → Vite build → `dist/`).
- Serves the **static client only** — no server-side code runs here.
- Online multiplayer connects to Render.com via `.env.production` (`wss://bar-game-server.onrender.com`).
- Only push to `main` when you want the live site updated.

### 4. Render.com — Multiplayer Server

- `server/server.mjs` is deployed separately via `render.yaml`.
- Only redeploy when you change the multiplayer server logic.
- Auto-deploys from the same repo via the Render dashboard.

## Quick Reference

```
Local dev (npm run dev)  →  Test & iterate
        ↓ ready?
Feature branch → main   →  Git push
        ↓ auto-deploy
   Netlify (client)  +  Render (server)
```

**Golden rule:** If you haven't tested it locally, don't push it.
