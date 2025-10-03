# Four-Fighter Match Upgrade Roadmap

## Goals
- Allow up to four combatants (human or AI) per match.
- Support mixed lobbies: any blend of remote players and local AI bots.
- Preserve WorldMaster flows; unlock the fourth AI enemy slot only when a solo player is acting as WorldMaster.
- Keep the host authoritative and minimize rewrites of existing combat systems.
- Encapsulate new logic in focused modules instead of expanding `main.js`.

## Key Constraints & Considerations
- Existing global variables (`player`, `enemy`, `NET`, `waitingForCard`, etc.) assume exactly two fighters.
- Both UI setup and server message schemas are built around host/joiner roles.
- Card draft flow pauses the game once per round; we now need a per-elimination loop.
- Multiplayer sync must stay deterministic: bots run on the host and broadcast via snapshots.
- Avoid blocking joiners during long choice sequences—queue selections and keep everyone in sync.

## Current Architecture Snapshot
- Fighter entities live in `classes/player.js`, with IDs tied to host/joiner.
- Combat loop, spawning, and round reset logic sit in `main.js` (~8k LOC).
- Server (`server.js`) stores exactly two sockets per session (`sessions[code][0|1]`).
- `GameEventSystem.js` already supports arbitrary events—can be reused for multi-fighter updates.

## Implementation Phases

### Phase 1 — Data & Module Foundations
1. Introduce a `managers/PlayerRoster.js` module that owns fighter slots, metadata (user/bot), and lookup helpers. This will appear at all times, even in single player.
2. Add a `managers/MatchLifecycleManager.js` to orchestrate round lifecycle (start, elimination, scoring) and expose hooks used by `main.js`.
3. Create `systems/CardDraftManager.js` for card queue handling (powerups + world mods). Persist choice queue so it works offline/online.
4. Provide transition helpers in `main.js` that proxy to the new managers while leaving the existing global names temporarily valid (to avoid huge diff).

### Phase 2 — UI & Setup Screen
1. Replace the enemyt AI checkbox with the ability to click empty roster slots and add/remove enemy AI to the match that way.
2. Surface a lobby roster widget that shows four slots, indicates human/AI, and allows host to add/remove bots.
3. Update WorldMaster setup UI to allow assigning the WM role to any player slot.
4. Broadcast roster + bot count during setup via existing WebSocket messages (extend `setup-sync`).

### Phase 3 — Server & Networking
1. Refactor `server.js` to track sessions as `{ host: ws, joiners: [] }` with up to three joiner sockets.
    - Extend relay logic to broadcast to all peers except sender.
2. Expand handshake messages to include `slotIndex` and `playerId`.
3. In `NET`, create `remoteInputs` and `remoteSnapshots` maps keyed by fighter ID.
4. Adjust snapshot payloads to include an array of fighters instead of `[player, enemy]`.
5. Add lightweight compression (e.g., omit unchanged fighters) if bandwidth becomes an issue; design payload schema accordingly.

### Phase 4 — Match Loop & Elimination Flow
1. Move round reset logic from `main.js` into `MatchLifecycleManager.startRound()`.
2. Maintain a `livingFighters` set; when someone hits 0 HP:
    - Freeze simulation using " isSelectionPauseActive() ", queue a card choice for that fighter.
    - After choice resolves, close the modal and resume the round, without respawning them yet.
    - Repeat until only one fighter remains; award that fighter a point and finish the round.
3. Update victory conditions to read target wins from `MatchLifecycleManager` instead of global `ROUNDS_TO_WIN` usage, but the victory conditions will remain and work the same, round winds are just gained by being the last player standing that round, not on kills.

### Phase 5 — AI & Control Routing
1. Build `systems/BotController.js` to encapsulate AI loops for any number of bots, using existing AI helpers from `main.js`.
2. Host assigns bot controllers to fighter slots flagged as AI and steps them each frame.
3. For remote human fighters, collect inputs per slot and feed into roster.
4. Gate local input handling by slot ownership so a user only controls their assigned fighter.

### Phase 6 — UI Feedback & HUD
1. Update HUD elements (health bars, cooldowns, nameplates) to iterate the roster instead of `[player, enemy]`.
2. Add to the existing scoreboard layout to display up to four fighters, with the new fighters displayed in the other corners of the game canvas, just like how the host is top let and joiner is top right.
3. Add elimination announcements briefly before showing the card selection UI to everyone to see what the eliminated character chooses. We will use the same card choosing logic that is currently in place, but support mid-match pausing and choosing for elimnated characters.

### Phase 7 — Multiplayer Sync Edge Cases
1. Queue card choices and world modifier offers so that joiners receive them even if they connect mid-flow.
2. Add a "disconnected" message and re-connect button if connection issues occur and theyre able to re-establish connection.
3. Prevent host/guest divergence by letting the host resolve any ties (e.g., simultaneous death) and broadcasting authoritative order.

### Phase 8 — Testing & Stabilization
1. Add development helpers to spawn four AI bots locally for stress testing.
2. Verify card flow, world modifiers, and healer/worldmaster events in each scenario.
3. Record regression cases: teledash behavior, healer spawns, obstacle burning sync.

## Module Ownership Summary

| Module | Purpose |
| --- | --- |
| `managers/PlayerRoster.js` | Central source of truth for fighters, slot assignment, lifecycle helpers, serialization. |
| `managers/MatchLifecycleManager.js` | Round start/end orchestration, elimination loop, scoring, victory detection. |
| `systems/CardDraftManager.js` | Manages queued card offers, world modifiers, network broadcasts, and UI triggers. |
| `systems/BotController.js` | Runs AI updates for bot-controlled fighters (host-side only). |
| `net/SessionManager.js` (optional) | Wraps `NET` state expansion for multi-fighter sync, isolates message parsing. |

Keep these modules loosely coupled. `main.js` should primarily glue them together and handle rendering/input.

## Networking Schema Updates
- **Setup broadcast**: `{ type: 'lobby-sync', fighters: [{ slot, kind: 'human'|'bot', name, color }], worldMasterSlot }`
- **Input relay**: `{ type: 'input', fighterId, seq, payload }`
- **Snapshot**: `{ type: 'snapshot', fighters: [{ id, x, y, hp, cooldowns, statusFlags }], bullets: [...], obstacles: [...] }`
- **Card queue**: `{ type: 'card-offer', fighterId, choices, offerId }` followed by `{ type: 'card-picked', fighterId, cardName, offerId }`
- **Round events**: `{ type: 'round-state', phase: 'starting'|'in-progress'|'elimination'|'complete', survivors, scores }`

Document these schemas in `docs/networking.md` once finalized.

## Card Flow & Elimination Sequence
1. `MatchLifecycleManager` detects KO → emits `ELIMINATION_STARTED` event.
2. `CardDraftManager` enqueues a powerup offer for the eliminated fighter and pauses using " isSelectionPauseActive() ".
3. On selection, `CardDraftManager` notifies roster, applies effects, and emits `ELIMINATION_RESOLVED`.
4. If more than one fighter remains, resume combat; otherwise trigger `ROUND_COMPLETE`.
5. World modifiers remain tied to every N eliminations or round completions (decide during implementation) and can reuse the same queue mechanism.

## WorldMaster Integration.
- Ensure WM deck sync uses fighter IDs instead of hard-coded player/enemy references.
- If WM is remote, include WM authority assignments in lobby sync payload so every client knows which slot they control.

## Testing & Verification Checklist
- [ ] Host-only four bots idle test (no crashes, consistent card flow).
- [ ] Host + joiner + 2 bots with repeated eliminations.
- [ ] Snapshot bandwidth stays under acceptable threshold (< 10 KB at 30 Hz, adjust if needed).
- [ ] Regression: healer spawn logic, world modifier deck sync, teledash warmup visuals.

## Rollout Strategy
1. Ship Phase 1 modules behind feature flag (`window.EXPERIMENT_FOUR_FIGHTERS`).
2. Migrate host-side logic to use roster while keeping compatibility with legacy two-player naming.
3. Once stable locally, update server + networking and gate for QA (host + bots only).
4. After multiplayer validation, expose UI slider and update documentation/marketing.

---
Use this roadmap to coordinate work items and PRs; keep each phase focused and well-scoped to avoid regressions.
