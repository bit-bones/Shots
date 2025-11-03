# Shots Game Refactoring Plan: 4-Player Roster System

## Problem Statement
The game needs to be refactored to:
1. Remove all World Master mode code completely
2. Support up to 4 players using the roster/fighterID system throughout
3. Replace legacy player/enemy variables with roster-based entity management
4. Ensure online multiplayer works properly for 3-4 players

## Current State Analysis

### Codebase Metrics
- **main.js**: 9,154 lines total
- **WorldMaster references**: 256 occurrences
- **player/enemy references**: ~500+ occurrences  
- **Estimated effort**: 40-60 hours (ground-up rebuild)

### Architecture Issues
1. **Tight Coupling**: Game logic heavily coupled to player/enemy variables
2. **WorldMaster Integration**: Deeply embedded throughout:
   - Network sync handlers (lines 1-130)
   - Setup UI (lines 1586-1970)
   - Control system integration
   - Card filtering and UI
3. **Incomplete Roster Integration**: Roster system exists but not fully adopted
4. **Legacy Network Code**: Assumes 2-player model (host=player, joiner=enemy)

## Refactoring Strategy

### Phase 1: Remove World Master Mode ✅ IN PROGRESS

**Completed:**
- [x] Delete WorldMaster directory (5 files, ~1300 lines removed)

**Remaining Work:**
- [ ] Remove WorldMaster network sync handlers (lines 1-130 in main.js)
- [ ] Remove WorldMaster setup functions (lines 1586-1970)
- [ ] Remove World Master player slot logic (worldMasterPlayerIndex, etc.)
- [ ] Clean up WorldMaster UI references in updateCardsUI() 
- [ ] Remove World Master role banner logic
- [ ] Remove World Master control disable logic (window.disablePlayerControls)
- [ ] Remove World Master references from network message handlers
- [ ] Clean up World Master checks in:
  - collectRosterEntries()
  - getFighterRecordForEntity()
  - setupOverlay functions

**Estimated Time**: 4-6 hours

### Phase 2: Roster System Migration (MAJOR EFFORT)

This is the core architectural change. Currently the game uses:
```javascript
player // local player entity
enemy // opponent entity  
```

Needs to be replaced with roster-based access:
```javascript
const entries = collectRosterEntries();
entries.forEach(({fighter, entity}) => {
  // work with fighter record and entity
});
```

**Required Changes:**

####  2.1 Game Loop Refactoring
- [ ] Replace player/enemy update loops with roster iteration
- [ ] Update collision detection for all roster entities
- [ ] Update drawing for all roster entities
- [ ] Handle 3-4 players in spatial calculations

#### 2.2 Input System
- [ ] Refactor collectLocalInput() to work with roster fighterIDs
- [ ] Update input application to find entity via roster
- [ ] Handle multiple local players (split-screen future support)

#### 2.3 Combat System
- [ ] Update bullet ownership to use fighterIDs
- [ ] Fix collision detection between all combinations of fighters
- [ ] Update damage attribution and life steal
- [ ] Fix explosion/AoE damage for 4 players

#### 2.4 Entity Management
- [ ] Replace direct player/enemy assignments
- [ ] Use roster.getEntityReference(fighterId) throughout
- [ ] Ensure entity-fighter bidirectional mapping
- [ ] Handle entity creation/destruction via roster

#### 2.5 Drawing & Rendering
- [ ] Update drawPlayers() to iterate roster
- [ ] Update health bars for all fighters
- [ ] Update score display for 4 players
- [ ] Fix camera/view for 4 players

**Estimated Time**: 20-30 hours

### Phase 3: Network Multiplayer (MAJOR EFFORT)

Current network code assumes:
- Host controls `player` (slot 0)
- Joiner controls `enemy` (slot 1)  

Needs to support:
- Host controls slot 0
- Joiner 0 controls slot 1
- Joiner 1 controls slot 2
- Joiner 2 controls slot 3
- Joiner 3 controls slot 4 (if supporting 5 total)

**Required Changes:**

#### 3.1 Message Protocol
- [ ] Update all messages to use fighterIDs instead of role assumptions
- [ ] Add fighter-to-joiner index mapping
- [ ] Handle 4 concurrent joiners
- [ ] Sync fighter metadata (colors, names, etc.)

#### 3.2 State Synchronization
- [ ] Position/health sync for all fighters
- [ ] Bullet sync with proper fighterID ownership
- [ ] Elimination sync for all fighters
- [ ] Score sync for all fighters
- [ ] Card selection sync for all fighters

#### 3.3 Input Relay
- [ ] Route input from each joiner to correct entity
- [ ] Handle simultaneous inputs from 4 joiners
- [ ] Maintain input authority (no cheating)

#### 3.4 Match Lifecycle
- [ ] Ready check for 4 players
- [ ] Round start with 4 spawns
- [ ] Elimination flow for 4 players
- [ ] Victory conditions with 4 players

**Estimated Time**: 15-20 hours

### Phase 4: Match Lifecycle & UI

- [ ] Spawn positioning for 4 players (currently uses circle arrangement)
- [ ] Round reset for all roster fighters
- [ ] Card selection UI for 4 players
- [ ] Elimination queue handling
- [ ] Victory/defeat screens
- [ ] Lobby UI showing 4 player slots
- [ ] In-game HUD for 4 players

**Estimated Time**: 8-12 hours

### Phase 5: Testing & Polish

- [ ] Single player vs 1 bot
- [ ] Single player vs 2 bots
- [ ] Single player vs 3 bots
- [ ] 2-player local (if supported)
- [ ] 2-player online
- [ ] 3-player online
- [ ] 4-player online
- [ ] All powerups work correctly
- [ ] All world modifiers work correctly
- [ ] Match lifecycle (multiple rounds)
- [ ] Score persistence
- [ ] Performance testing with 4 players

**Estimated Time**: 8-10 hours

## Total Estimated Effort
**55-78 hours** of focused development time

## Recommended Approach

Given the scope, I recommend:

### Option A: Incremental Migration (Lower Risk)
1. Remove WorldMaster code (Phase 1) ✅ 
2. Keep player/enemy for now but add roster parallel tracking
3. Gradually migrate systems one at a time
4. Test after each migration
5. Final cutover when all systems migrated
**Timeline**: 3-4 weeks of part-time work

### Option B: Clean Rebuild (Higher Risk, Cleaner Result)
1. Create new main-refactored.js from scratch
2. Copy over working classes (Player, Bullet, etc.)
3. Rewrite game loop roster-first
4. Port over features incrementally
5. Replace main.js when feature-complete
**Timeline**: 2-3 weeks of full-time focused work

### Option C: Hybrid Approach (Balanced)
1. Remove WorldMaster code completely (Phase 1)
2. Create roster access helpers to wrap player/enemy
3. Migrate high-value systems (network, match lifecycle)
4. Leave some player/enemy references as-is if they work
5. Document remaining technical debt
**Timeline**: 1-2 weeks of focused work

## Current Progress

### Completed ✅
- [x] Analyzed codebase structure
- [x] Identified all WorldMaster integration points
- [x] Deleted WorldMaster directory (1,289 lines removed)
- [x] Created comprehensive refactoring plan

### In Progress 🔄
- [ ] Removing WorldMaster code from main.js

### Not Started ⏸️
- All Phase 2-5 work

## Next Steps

1. **Immediate**: Finish Phase 1 (WorldMaster removal from main.js)
2. **Short-term**: Choose approach (A, B, or C) based on timeline/risk tolerance
3. **Medium-term**: Execute chosen approach with frequent testing
4. **Long-term**: Performance optimization, edge case handling, polish

## Files That Need Changes

### Critical (Must Change)
- `main.js` - Core game loop, needs complete refactor
- `functions/server.js` - Network message handling
- `functions/setupOverlay.js` - Setup UI for 4 players

### Important (Should Change)
- `functions/draw.js` - Drawing functions for roster
- `classes/player.js` - May need roster awareness
- `classes/bullet.js` - Fighter ID ownership

### Supporting (Nice to Change)
- `managers/PlayerRoster.js` - Already good, minor tweaks
- `managers/MatchLifecycleManager.js` - Already good, minor tweaks
- `constants.js` - Already defines POWERUPS and WORLD_MODIFIERS correctly

## Risk Assessment

### High Risk Areas
1. **Network sync breaking**: Easy to create desync bugs
2. **Entity lifecycle**: Managing 4 entities vs 2 is complex
3. **Performance**: 4 players = 2x collision checks
4. **Edge cases**: What if 2 players eliminated simultaneously?

### Mitigation Strategies
1. **Extensive testing** at each phase
2. **Feature flags** to enable/disable new code
3. **Backward compatibility** during transition
4. **Rollback plan** if issues arise

## Success Criteria

- [ ] Game runs without World Master mode
- [ ] 4 players can join and play online match
- [ ] All players see consistent game state
- [ ] Elimination and scoring work correctly
- [ ] All powerups and modifiers work
- [ ] Performance is acceptable (60 FPS with 4 players)
- [ ] No security vulnerabilities introduced
- [ ] Code is cleaner and more maintainable than before

---

**Document Status**: Living document, will be updated as work progresses
**Last Updated**: 2025-11-03
**Author**: GitHub Copilot Agent
