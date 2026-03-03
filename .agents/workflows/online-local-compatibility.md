---
description: How to ensure game changes work for both online and local (AI) modes
---

# Online + Local Mode Compatibility

The game uses a **shared engine** architecture. Online is the **primary mode**. Follow these rules to ensure changes work in both modes:

## Architecture Overview

- **Game Engine** (`src/engine/`): `GameController`, `CombatEngine`, `ManaSystem`, `TurnManager`, `EffectEngine` — shared by both local and server. The server imports these same files.
- **Server** (`server/server.mjs`): Creates a `GameController` instance per match, routes WebSocket messages to controller methods.
- **UI** (`src/ui/GameUI.js`): Uses `isOnline` flag. Calls `_doAction()` which routes to either `controller.method()` (local) or `net.method()` (online).

## Checklist for Any Engine Change

When adding or modifying any game feature, go through this checklist:

- [ ] **Engine logic** lives in `src/engine/` — never in UI or server files
- [ ] **`serializeCard()`** in `server.mjs` uses auto-spread (`...card`) — new card fields are included automatically
- [ ] **Callback parameters** forwarded in server — if engine callbacks gain new parameters (like `chainContext` in `onOpponentResponse`), update the server to forward them over the network
- [ ] **Server validates before sending options** — e.g. `onOpponentResponse` filters cards through `ActionValidator` before sending to client
- [ ] **Test online mode** — AI mode working is NOT enough, always verify with two clients

## Rules for Adding New Actions

1. Add the method to `GameController.js`
2. Add a case to `NetworkManager.js` (client sends)
3. Add a case to `_doAction()` in `GameUI.js` — remember:
   - **Local**: `controller.method(playerId, ...args)`
   - **Online**: `net.method(...args)` — **NO playerId** (server knows identity via WebSocket)
   - `_doAction` receives `(playerId, ...args)` and strips `playerId` via `args.slice(1)` for network calls
4. Add a case to `handleAction()` in `server/server.mjs`

## Rules for UI Changes

1. **All in-game rendering is in `GameUI.js`** — used by both modes.
2. Use `this._gs` to get game state (works for both modes).
3. Use `this._isMyTurn()` to check turn (works for both modes).
4. Use `this._doAction(type, playerId, ...args)` for all actions — it routes automatically.
5. Avoid `this.controller.something` directly in render/UI code — use `_gs` or `_doAction` instead.
6. **Client-side validation** (the `if (this.isOnline)` checks in `_renderHand`, `_onHandCardClick`) is for **UI hints only** — the server always has final say.

## Common Pitfalls

- **Don't send JS objects over the network** — serialize to IDs. The server has its own object instances.
- **Don't skip the `_doAction` router** — calling `controller.method()` directly won't work in online mode.
- **`gameMode`** is `'ai'` locally and `'duel'` online — don't use it for engine logic branching.
- **Don't add new card properties without checking `serializeCard()`** — the auto-spread should handle this, but verify internal-only fields are excluded if needed.
- **Don't trust client-side validation** — always validate on the server. Client checks are hints for UI feedback.
