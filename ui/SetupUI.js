/**
 * SetupUI - Game setup overlay with roster management
 * Displays 4-slot roster with click-to-toggle functionality
 */
class SetupUI {
    constructor(rosterSystem, options = {}) {
        this.roster = rosterSystem;
        this.container = document.getElementById('setup-wrapper');
        this.overlay = document.getElementById('setup-overlay');
        this.rosterGrid = document.getElementById('roster-grid');
        this.rosterNote = document.getElementById('roster-note');
        this.startButton = document.getElementById('start-button');
        this.modeSelect = document.getElementById('game-mode-select');
        this.modeSettingsContainer = document.getElementById('mode-settings');
        this.modeDescriptionEl = document.getElementById('mode-description');
        
        this.onStartCallback = null;
        this.bound = false;
        this.isJoinerView = false;
        this.onRosterChanged = typeof options.onRosterChanged === 'function' ? options.onRosterChanged : null;
        this.onDisplayNameChange = typeof options.onDisplayNameChange === 'function' ? options.onDisplayNameChange : null;
        this.contextMenuEl = null;
        this.contextMenuSlot = null;
        this.contextCloser = null;
        this.contextKeyHandler = null;
        this.inlineRenameSlot = null;
        this.readyStates = {};
        this.isMultiplayerMode = false;
        this.onReadyToggle = null;
        this.onBotDifficultyChange = null;
        this.onModeChange = null;
        this.onModeSettingsChange = null;
        this.onAssignTeam = null;
        this.teamOptionsProvider = null;
        this.modeFlags = {};
        this.modeSettingInputs = new Map();
        this.modeOptions = [];
        this.modeSettingDescriptors = [];
        this.modeSettingValues = {};
        this.activeModeKey = null;
        this._suppressModeSelectEvent = false;
        this.settingsLocked = false;
    }

    bind() {
        if (this.bound) return;
        
        // Bind roster slot clicks
        if (this.rosterGrid) {
            const slots = this.rosterGrid.querySelectorAll('.roster-slot');
            slots.forEach(btn => {
                btn.addEventListener('click', () => {
                    const slotIndex = parseInt(btn.getAttribute('data-slot'), 10);
                    this.onSlotClicked(slotIndex);
                });
                btn.addEventListener('contextmenu', (ev) => {
                    ev.preventDefault();
                    const slotIndex = parseInt(btn.getAttribute('data-slot'), 10);
                    this.onSlotContextMenu(slotIndex, ev.clientX, ev.clientY);
                    return false;
                });
            });
        }

        // Bind start button
        if (this.startButton) {
            this.startButton.addEventListener('click', () => {
                if (this.isJoinerView) {
                    return;
                }
                if (this.onStartCallback) {
                    const proceed = this.onStartCallback();
                    if (proceed === false) {
                        return;
                    }
                }
                this.hide();
            });
            this.updateStartButtonState();
        }

        if (this.modeSelect) {
            this.modeSelect.addEventListener('change', (ev) => {
                const key = ev.target.value;
                this.activeModeKey = key || null;
                this._updateModeDescriptionByKey(key);
                if (this._suppressModeSelectEvent) {
                    return;
                }
                if (typeof this.onModeChange === 'function') {
                    this.onModeChange(key);
                }
            });
        }

        this.bound = true;
    }

    onSlotClicked(slotIndex) {
        if (this.inlineRenameSlot !== null) {
            return;
        }
        this.hideContextMenu();
        const fighter = this.roster.describeSlot(slotIndex).fighter;
        if (this.isMultiplayerMode && fighter && fighter.isLocal && !fighter.isBot) {
            if (this.onReadyToggle) {
                this.onReadyToggle(slotIndex);
            }
            return;
        }
        // Toggle slot state: empty ↔ bot (host only)
        const desc = this.roster.describeSlot(slotIndex);
        if (desc.fighter && !desc.fighter.isBot && !desc.fighter.isLocal) {
            return;
        }

        this.roster.toggleSlot(slotIndex);
        if (this.onRosterChanged) {
            this.onRosterChanged();
        }
        this.render();
    }

    show() {
        if (this.container) this.container.style.display = 'flex';
        this.render();
    }

    hide() {
        if (this.container) this.container.style.display = 'none';
        this.hideContextMenu();
    }

    render() {
        if (!this.rosterGrid) return;

        this.hideContextMenu();

        const slots = this.rosterGrid.querySelectorAll('.roster-slot');
        
        slots.forEach((btn) => {
            const slotIndex = parseInt(btn.getAttribute('data-slot'), 10);
            const desc = this.roster.describeSlot(slotIndex);
            const fighter = desc.fighter;

            const titleEl = btn.querySelector('.slot-title');
            const bodyEl = btn.querySelector('.slot-body');
            const subEl = btn.querySelector('.slot-subtext');
            const chipWrap = btn.querySelector('.slot-actions');

            // Reset classes
            btn.classList.remove('empty', 'human', 'bot', 'placeholder');
            desc.classes.forEach(cls => btn.classList.add(cls));

            // Update text content
            if (titleEl) titleEl.textContent = `Slot ${slotIndex + 1}`;
            const isRenaming = this.inlineRenameSlot === slotIndex && bodyEl && bodyEl.querySelector('.roster-inline-rename');
            if (bodyEl && !isRenaming) {
                bodyEl.textContent = desc.body;
                bodyEl.style.color = desc.bodyColor || '';
            } else if (isRenaming && bodyEl) {
                bodyEl.style.color = desc.bodyColor || '';
            }
            if (subEl) subEl.textContent = desc.subtext;

            // Add cursor icon for human slots (top right corner)
            // Show for slot 0 (always Player 1), or any slot with a human fighter
            const shouldShowCursor = (slotIndex === 0) || (fighter && !fighter.isBot);
            const existingIcon = btn.querySelector('.roster-cursor-icon');

            if (shouldShowCursor && !existingIcon) {
                // Create new cursor icon
                const cursorIcon = document.createElement('div');
                cursorIcon.className = 'roster-cursor-icon';
                this.renderCursorIcon(cursorIcon, fighter);
                btn.appendChild(cursorIcon);
            } else if (shouldShowCursor && existingIcon) {
                // Update existing cursor icon (use fighter metadata if available)
                this.renderCursorIcon(existingIcon, fighter);
            } else if (!shouldShowCursor && existingIcon) {
                // Remove cursor icon if slot is now a bot or remote
                if (existingIcon.parentNode) {
                    existingIcon.parentNode.removeChild(existingIcon);
                }
            }

            // Update chip badges (Bot badge)
            if (chipWrap) {
                chipWrap.innerHTML = '';
            }

            const ready = !!this.readyStates[slotIndex];
            const isBot = fighter && fighter.isBot;
            if (isBot) {
                btn.classList.remove('ready');
                this._renderReadyIndicator(btn, false);
                this._renderBotDifficultyBadge(btn, fighter);
            } else {
                this._removeBotDifficultyBadge(btn);
                btn.classList.toggle('ready', ready);
                this._renderReadyIndicator(btn, ready);
            }

            if (this.modeFlags.showTeamLabels) {
                this._renderTeamLabel(btn, fighter);
            } else {
                this._removeTeamLabel(btn);
            }

            const lockHuman = fighter && !fighter.isBot && !fighter.isLocal;
            const localHuman = fighter && fighter.isLocal && !fighter.isBot;
            const shouldDisable =
                lockHuman ||
                (!localHuman && slotIndex === 0) ||
                (this.isJoinerView && !localHuman);

            btn.disabled = shouldDisable;
            btn.classList.toggle('ready-clickable', this.isMultiplayerMode && localHuman);
            if (shouldDisable) {
                btn.classList.remove('selected');
            }
        });

        // Update roster note
        if (this.rosterNote) {
            this.rosterNote.textContent = 'Host: click a slot to toggle an AI bot. Players fill empty slots automatically.';
        }
    }

    setMultiplayerMode(enabled) {
        this.isMultiplayerMode = !!enabled;
        if (!this.isMultiplayerMode) {
            this.isJoinerView = false;
        }
        this.updateStartButtonState();
    }

    setSettingsLocked(locked) {
        this.settingsLocked = !!locked;
        this._applySettingsLock();
    }

    setReadyState(slotIndex, ready) {
        this.readyStates[slotIndex] = !!ready;
        if (!this.rosterGrid) return;
        const btn = this.rosterGrid.querySelector(`.roster-slot[data-slot="${slotIndex}"]`);
        if (btn) {
            const fighter = this.roster ? this.roster.getSlot(slotIndex) : null;
            if (fighter && fighter.isBot) {
                btn.classList.remove('ready');
                this._renderReadyIndicator(btn, false);
                this._renderBotDifficultyBadge(btn, fighter);
                return;
            }
            this._removeBotDifficultyBadge(btn);
            btn.classList.toggle('ready', !!ready);
            this._renderReadyIndicator(btn, !!ready);
        }
    }

    clearReadyStates() {
        this.readyStates = {};
        if (!this.rosterGrid) return;
        const indicators = this.rosterGrid.querySelectorAll('.ready-indicator');
        indicators.forEach(ind => {
            ind.style.display = 'none';
        });
        this.rosterGrid.querySelectorAll('.roster-slot').forEach(btn => btn.classList.remove('ready'));
    }

    updateStartButtonState() {
        if (!this.startButton) return;
        this.startButton.disabled = !!this.isJoinerView;
        this.startButton.classList.toggle('waiting-for-host', !!this.isJoinerView);
    }

    setModeFlags(flags = {}) {
        this.modeFlags = Object.assign({}, flags || {});
        this.render();
    }

    setTeamOptionsProvider(provider) {
        this.teamOptionsProvider = typeof provider === 'function' ? provider : null;
    }

    setTeamAssignmentHandler(handler) {
        this.onAssignTeam = typeof handler === 'function' ? handler : null;
    }

    setModeOptions(options = [], activeKey = null) {
        this.modeOptions = Array.isArray(options) ? options.slice() : [];
        if (!this.modeSelect) return;

        this._suppressModeSelectEvent = true;
        this.modeSelect.innerHTML = '';

        if (!this.modeOptions.length) {
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = 'No modes available';
            this.modeSelect.appendChild(placeholder);
            this._suppressModeSelectEvent = false;
            this.setActiveModeKey(null);
            return;
        }

        for (const mode of this.modeOptions) {
            if (!mode || !mode.key) continue;
            const opt = document.createElement('option');
            opt.value = mode.key;
            opt.textContent = mode.label || mode.key;
            if (mode.description) {
                opt.title = mode.description;
            }
            this.modeSelect.appendChild(opt);
        }

        this._suppressModeSelectEvent = false;

        const keyToUse = activeKey && this.modeOptions.some(opt => opt.key === activeKey)
            ? activeKey
            : this.modeOptions[0].key;
        this.setActiveModeKey(keyToUse || null);
        this._applySettingsLock();
    }

    setActiveModeKey(key) {
        this.activeModeKey = key || null;
        if (this.modeSelect) {
            const resolved = key || '';
            if (this.modeSelect.value !== resolved) {
                this._suppressModeSelectEvent = true;
                this.modeSelect.value = resolved;
                this._suppressModeSelectEvent = false;
            }
        }
        this._updateModeDescriptionByKey(key);
    }

    setModeSettings(settings = [], values = {}) {
        const descriptors = Array.isArray(settings) ? settings.slice() : [];
        const normalizedValues = {};

        for (const desc of descriptors) {
            if (!desc || !desc.id) continue;
            const incoming = Object.prototype.hasOwnProperty.call(values || {}, desc.id)
                ? values[desc.id]
                : desc.default;
            normalizedValues[desc.id] = this._normalizeSettingValue(desc, incoming);
        }

        this.modeSettingDescriptors = descriptors;
        this.modeSettingValues = normalizedValues;
        this._renderModeSettingsUI();
        this._applySettingsLock();
    }

    getModeSettingsValues() {
        return Object.assign({}, this.modeSettingValues || {});
    }

    setModeDescription(text) {
        if (!this.modeDescriptionEl) return;
        const content = (text || '').toString().trim();
        this.modeDescriptionEl.textContent = content;
        this.modeDescriptionEl.style.display = content.length ? 'block' : 'none';
    }

    _updateModeDescriptionByKey(key) {
        if (!this.modeOptions || !this.modeOptions.length) {
            this.setModeDescription('');
            return;
        }
        const match = this.modeOptions.find(mode => mode && mode.key === key) || null;
        this.setModeDescription(match && match.description ? match.description : '');
    }

    _renderModeSettingsUI() {
        if (!this.modeSettingsContainer) return;

        this.modeSettingsContainer.innerHTML = '';
        this.modeSettingInputs.clear();

        if (!this.modeSettingDescriptors || this.modeSettingDescriptors.length === 0) {
            this.modeSettingsContainer.style.display = 'none';
            return;
        }

        this.modeSettingsContainer.style.display = 'block';

        for (const desc of this.modeSettingDescriptors) {
            if (!desc || !desc.id) continue;

            const entry = document.createElement('div');
            entry.className = 'mode-setting-entry';

            const header = document.createElement('div');
            header.className = 'mode-setting-header';
            const labelEl = document.createElement('span');
            labelEl.textContent = desc.label || desc.id;
            header.appendChild(labelEl);

            const currentValue = this._normalizeSettingValue(desc, this.modeSettingValues[desc.id]);
            this.modeSettingValues[desc.id] = currentValue;

            const valueEl = document.createElement('span');
            valueEl.className = 'mode-setting-value';
            valueEl.textContent = this._formatModeSettingValue(desc, currentValue);
            header.appendChild(valueEl);

            entry.appendChild(header);

            const inputType = (desc.type || 'range').toLowerCase();
            const input = document.createElement('input');
            input.className = 'mode-setting-input';

            if (inputType === 'range' || inputType === 'number') {
                input.type = inputType;
                if (Number.isFinite(desc.min)) input.min = String(desc.min);
                if (Number.isFinite(desc.max)) input.max = String(desc.max);
                if (Number.isFinite(desc.step)) input.step = String(desc.step);
                input.value = String(currentValue);
                input.addEventListener('input', (ev) => {
                    this._handleModeSettingInput(desc, ev.target.value, valueEl);
                });
                input.addEventListener('change', (ev) => {
                    this._handleModeSettingInput(desc, ev.target.value, valueEl);
                });
            } else if (inputType === 'checkbox') {
                input.type = 'checkbox';
                input.checked = !!currentValue;
                input.addEventListener('change', (ev) => {
                    this._handleModeSettingInput(desc, ev.target.checked, valueEl);
                });
            } else {
                input.type = inputType;
                input.value = currentValue;
                input.addEventListener('change', (ev) => {
                    this._handleModeSettingInput(desc, ev.target.value, valueEl);
                });
            }

            entry.appendChild(input);

            if (desc.description) {
                const descEl = document.createElement('div');
                descEl.className = 'mode-setting-desc';
                descEl.textContent = desc.description;
                entry.appendChild(descEl);
            }

            this.modeSettingsContainer.appendChild(entry);
            this.modeSettingInputs.set(desc.id, { input, valueEl, descriptor: desc });
        }
        this._applySettingsLock();
    }

    _handleModeSettingInput(desc, rawValue, valueEl) {
        if (!desc || !desc.id) return;
        const type = (desc.type || 'range').toLowerCase();
        let resolved;
        if (type === 'checkbox') {
            resolved = !!rawValue;
        } else {
            resolved = this._normalizeSettingValue(desc, rawValue);
        }
        this.modeSettingValues[desc.id] = resolved;
        if (valueEl) {
            valueEl.textContent = this._formatModeSettingValue(desc, resolved);
        }
        this._emitModeSettingsChange();
    }

    _applySettingsLock() {
        const locked = !!this.settingsLocked;
        if (this.modeSelect) {
            this.modeSelect.disabled = locked;
            this.modeSelect.classList.toggle('locked', locked);
        }
        if (this.modeSettingInputs && this.modeSettingInputs.size) {
            this.modeSettingInputs.forEach(({ input }) => {
                if (!input) return;
                input.disabled = locked;
                input.classList.toggle('locked', locked);
            });
        }
    }

    _formatModeSettingValue(desc, value) {
        const type = (desc && desc.type) ? desc.type.toLowerCase() : 'range';
        if (type === 'checkbox') {
            return value ? 'On' : 'Off';
        }
        const numeric = typeof value === 'number' ? value : parseFloat(value);
        if (!Number.isFinite(numeric)) {
            return (value !== undefined && value !== null) ? String(value) : '—';
        }

        let displayValue = numeric;
        let decimals = this._resolveStepDecimals(desc ? desc.step : null);
        const suffix = desc && desc.suffix ? desc.suffix : '';

        if (suffix === '%' && numeric <= 1) {
            displayValue = numeric * 100;
            decimals = Math.max(0, decimals - 2);
        }

        if (decimals < 0) decimals = 0;
        const factor = Math.pow(10, Math.min(decimals, 4));
        const rounded = factor > 0 ? Math.round(displayValue * factor) / factor : displayValue;
        const formatted = decimals > 0 ? rounded.toFixed(decimals) : String(Math.round(rounded));
        return suffix ? `${formatted}${suffix}` : formatted;
    }

    _resolveStepDecimals(step) {
        if (!Number.isFinite(step)) return 0;
        let decimals = 0;
        let test = step;
        while (decimals < 6 && Math.round(test) !== test) {
            test *= 10;
            decimals += 1;
        }
        return decimals;
    }

    _normalizeSettingValue(desc, rawValue) {
        if (!desc) return rawValue;
        const type = (desc.type || 'range').toLowerCase();
        if (type === 'checkbox') {
            if (typeof rawValue === 'boolean') return rawValue;
            if (typeof rawValue === 'string') {
                const lower = rawValue.toLowerCase();
                return lower === 'true' || lower === '1' || lower === 'yes';
            }
            return !!rawValue;
        }

        let value = typeof rawValue === 'number' ? rawValue : parseFloat(rawValue);
        if (!Number.isFinite(value)) {
            const defaultValue = Number(desc.default);
            if (Number.isFinite(defaultValue)) {
                value = defaultValue;
            }
        }
        if (!Number.isFinite(value)) {
            const minValue = Number(desc.min);
            if (Number.isFinite(minValue)) {
                value = minValue;
            }
        }
        if (!Number.isFinite(value)) {
            value = 0;
        }
        return this._clampSettingValue(desc, value);
    }

    _clampSettingValue(desc, value) {
        if (!desc) return value;
        let result = value;
        if (Number.isFinite(desc.min)) {
            result = Math.max(desc.min, result);
        }
        if (Number.isFinite(desc.max)) {
            result = Math.min(desc.max, result);
        }
        return result;
    }

    _emitModeSettingsChange() {
        if (typeof this.onModeSettingsChange !== 'function') return;
        try {
            this.onModeSettingsChange(this.getModeSettingsValues());
        } catch (e) {
            console.warn('[SetupUI] onModeSettingsChange handler failed:', e);
        }
    }

    _renderReadyIndicator(btn, ready) {
        if (!btn) return;
        let indicator = btn.querySelector('.ready-indicator');
        if (!indicator) {
            indicator = document.createElement('span');
            indicator.className = 'ready-indicator';
            btn.appendChild(indicator);
        }
        indicator.textContent = 'Ready';
        indicator.style.display = ready ? 'flex' : 'none';
    }

    _renderBotDifficultyBadge(btn, fighter) {
        if (!btn) return;
        const data = this._resolveBotDifficultyData(fighter);
        let badge = btn.querySelector('.bot-difficulty-indicator');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'bot-difficulty-indicator';
            btn.appendChild(badge);
        }

        const difficultyKey = data.key || 'normal';
        badge.textContent = data.label || this._formatDifficultyLabel(difficultyKey);
        badge.dataset.difficulty = difficultyKey;

        const baseClass = 'bot-difficulty-indicator';
        const prefix = 'bot-difficulty-';
        Array.from(badge.classList).forEach(cls => {
            if (cls !== baseClass && cls.startsWith(prefix)) {
                badge.classList.remove(cls);
            }
        });
        badge.classList.add(`${prefix}${difficultyKey}`);
        badge.style.display = 'flex';
    }

    _removeBotDifficultyBadge(btn) {
        if (!btn) return;
        const badge = btn.querySelector('.bot-difficulty-indicator');
        if (badge) {
            badge.style.display = 'none';
        }
    }

    _renderTeamLabel(btn, fighter) {
        if (!btn) return;
        const wrapperClass = 'slot-team-label';
        let labelEl = btn.querySelector(`.${wrapperClass}`);
        if (!fighter || !fighter.metadata || !fighter.metadata.teamId) {
            if (labelEl) {
                labelEl.remove();
            }
            return;
        }
        if (!labelEl) {
            labelEl = document.createElement('div');
            labelEl.className = wrapperClass;
            btn.insertBefore(labelEl, btn.firstChild);
        }
        labelEl.textContent = fighter.metadata.teamName || 'Team';
        labelEl.style.color = fighter.metadata.teamColor || fighter.color || '#ffd86b';
    }

    _removeTeamLabel(btn) {
        if (!btn) return;
        const label = btn.querySelector('.slot-team-label');
        if (label) {
            label.remove();
        }
    }

    _resolveBotDifficultyData(fighter) {
        const presets = (typeof BOT_DIFFICULTY_PRESETS !== 'undefined') ? BOT_DIFFICULTY_PRESETS : null;
        const key = fighter && fighter.metadata && fighter.metadata.botDifficulty
            ? fighter.metadata.botDifficulty
            : (fighter && fighter.botDifficulty) ? fighter.botDifficulty : 'normal';
        if (presets && presets[key]) {
            const entry = presets[key];
            return {
                key: entry.key || key,
                label: entry.label || this._formatDifficultyLabel(entry.key || key)
            };
        }
        return {
            key: key || 'normal',
            label: this._formatDifficultyLabel(key || 'normal')
        };
    }

    _formatDifficultyLabel(key) {
        if (!key) return 'Normal';
        const clean = key.toString().toLowerCase();
        return clean.charAt(0).toUpperCase() + clean.slice(1);
    }

    _getBotDifficultyOptions(fighter) {
        const presets = (typeof BOT_DIFFICULTY_PRESETS !== 'undefined') ? BOT_DIFFICULTY_PRESETS : null;
        const order = ['easy', 'normal', 'hard'];
        const keys = presets ? Object.keys(presets) : order;
        const uniqueKeys = Array.from(new Set(keys.concat(order)));
        const currentKey = fighter && fighter.metadata && fighter.metadata.botDifficulty
            ? fighter.metadata.botDifficulty
            : (fighter && fighter.botDifficulty) ? fighter.botDifficulty : 'normal';

        const options = uniqueKeys.map(key => {
            const entry = presets && presets[key] ? presets[key] : null;
            const normalizedKey = entry && entry.key ? entry.key : key;
            return {
                key: normalizedKey,
                label: entry && entry.label ? entry.label : this._formatDifficultyLabel(normalizedKey),
                active: currentKey === normalizedKey
            };
        });

        options.sort((a, b) => {
            const indexA = order.indexOf(a.key);
            const indexB = order.indexOf(b.key);
            return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
        });

        return options;
    }

    // Accept optional fighter so we can use fighter.metadata.cursorStyle/cursorColor
    renderCursorIcon(iconEl, fighter) {
        if (!iconEl) return;

        // Prefer fighter metadata when available, but FALLBACK to localStorage so
        // single-player/local previews always show user's chosen cursor.
        let cursorStyle = null;
        let cursorColor = null;
        try {
            if (fighter && fighter.metadata) {
                cursorStyle = fighter.metadata.cursorStyle || null;
                cursorColor = fighter.metadata.cursorColor || null;
            }

            if (!cursorStyle) {
                cursorStyle = localStorage.getItem('shape_shot_cursor') || 'reticle';
            }
            if (!cursorColor) {
                cursorColor = localStorage.getItem('shape_shot_color') || '#ffd86b';
            }
        } catch (e) {
            cursorStyle = cursorStyle || 'reticle';
            cursorColor = cursorColor || '#ffd86b';
        }

        const c = cursorColor;
        let svgData = '';

        if (cursorStyle === 'reticle') {
            svgData = "<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><g fill='none' stroke='"+c+"' stroke-width='1.8'><circle cx='16' cy='16' r='7.2'/></g><g stroke='"+c+"' stroke-width='1.6'><path d='M16 2v4'/><path d='M16 30v-4'/><path d='M2 16h4'/><path d='M30 16h-4'/></g></svg>";
        } else if (cursorStyle === 'crosshair') {
            svgData = "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><g fill='none' stroke='"+c+"' stroke-width='1.6'><path d='M12 0v5'/><path d='M12 24v-5'/><path d='M0 12h5'/><path d='M24 12h-5'/></g></svg>";
        } else if (cursorStyle === 'dot') {
            svgData = "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'><circle cx='8' cy='8' r='2' fill='"+c+"'/></svg>";
        } else if (cursorStyle === 'bigdot') {
            svgData = "<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><circle cx='16' cy='16' r='5' fill='"+c+"'/></svg>";
        } else if (cursorStyle === 'scope') {
            svgData = "<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'><g fill='none' stroke='"+c+"' stroke-width='1.6'><circle cx='20' cy='20' r='10'/></g><circle cx='20' cy='20' r='3' fill='"+c+"' /><g stroke='"+c+"' stroke-width='1.2'><path d='M20 2v6'/><path d='M20 38v-6'/><path d='M2 20h6'/><path d='M38 20h-6'/></g></svg>";
        } else {
            svgData = "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'><path d='M1 1l5 13 3-7 7-3z' fill='"+c+"'/></svg>";
        }

        iconEl.innerHTML = svgData;
    }

    onStart(callback) {
        this.onStartCallback = callback;
    }

    // ==================== MULTIPLAYER METHODS ====================

    showSessionCode(code) {
        // Display session code in roster panel
        const sessionRow = document.getElementById('mp-session-row');
        const sessionLabel = document.getElementById('mp-session-label');
        if (sessionRow && sessionLabel) {
            sessionLabel.textContent = code;
            sessionRow.style.display = 'block';
        }
        
        // Also display in modal
        const mpSessionCode = document.getElementById('mp-session-code');
        if (mpSessionCode) {
            mpSessionCode.value = code;
        }
        
        // Update roster note for hosting
        if (this.rosterNote) {
            this.rosterNote.textContent = 'Hosting multiplayer game. Joiners will occupy the next available slot automatically.';
        }
    }

    onPeerJoined(joinerIndex, name) {
        // A peer joined - update their slot in roster
        console.log('[SetupUI] Peer joined at index:', joinerIndex, name || '');
        // The roster system will handle assigning the joiner
        this.render();
    }

    onPeerLeft(joinerIndex) {
        // A peer left - clear their slot
        console.log('[SetupUI] Peer left:', joinerIndex);
        this.roster.clearJoiner(joinerIndex);
        this.render();
    }

    onJoinedAsJoiner(code, joinerIndex, name) {
        // Joined as a joiner - show in roster panel
        this.isJoinerView = true;
        this.updateStartButtonState();

        const sessionRow = document.getElementById('mp-session-row');
        const sessionLabel = document.getElementById('mp-session-label');
        if (sessionRow && sessionLabel) {
            sessionLabel.textContent = code;
            sessionRow.style.display = 'block';
        }
        
        if (this.rosterNote) {
            const displayName = name && name.trim().length > 0 ? name.trim() : `Player ${joinerIndex + 2}`;
            this.rosterNote.textContent = `${displayName} connected. Waiting for the host to start the game...`;
        }
        
        // Disable all roster slot buttons for joiners (except their own for ready toggles)
        this.render();
    }

    onSlotContextMenu(slotIndex, clientX, clientY) {
        if (this.inlineRenameSlot !== null) return;

        const desc = this.roster.describeSlot(slotIndex);
        const fighter = desc.fighter;
        const canRenameBot = fighter && fighter.isBot && !this.isJoinerView;
        const canRenameLocal = fighter && fighter.isLocal;
        const allowTeamMenu = !!(this.modeFlags.enableTeamContextMenu && typeof this.teamOptionsProvider === 'function' && !this.isJoinerView);

        if (!canRenameBot && !canRenameLocal && !allowTeamMenu) {
            this.hideContextMenu();
            return;
        }

        const mode = canRenameBot ? 'bot' : (canRenameLocal ? 'local' : null);
        this.showContextMenu(slotIndex, clientX, clientY, { mode, fighter, allowTeamMenu });
    }

    showContextMenu(slotIndex, clientX, clientY, options = {}) {
        this.hideContextMenu();

        const menu = document.createElement('div');
        menu.className = 'roster-context-menu';
        menu.style.left = `${clientX}px`;
        menu.style.top = `${clientY}px`;

        const fighter = options.fighter || null;
        const renameMode = options.mode === 'bot' || options.mode === 'local' ? options.mode : null;
        let hasItems = false;

        if (renameMode) {
            const item = document.createElement('div');
            item.className = 'roster-context-item';
            item.textContent = renameMode === 'local' ? 'Change display name' : 'Rename bot';
            item.addEventListener('click', (ev) => {
                ev.stopPropagation();
                this.hideContextMenu();
                this.startInlineRename(slotIndex, { mode: renameMode });
            });
            menu.appendChild(item);
            hasItems = true;

            if (renameMode === 'bot' && typeof this.onBotDifficultyChange === 'function') {
                const difficultyOptions = this._getBotDifficultyOptions(fighter);
                if (difficultyOptions.length) {
                    const diffItem = document.createElement('div');
                    diffItem.className = 'roster-context-item has-submenu';
                    diffItem.textContent = 'Difficulty';
                    menu.appendChild(diffItem);

                    const submenu = document.createElement('div');
                    submenu.className = 'roster-context-submenu';
                    submenu.style.position = 'absolute';
                    submenu.style.display = 'none';

                    difficultyOptions.forEach(opt => {
                        const optItem = document.createElement('div');
                        optItem.className = 'roster-context-item';
                        optItem.textContent = opt.label;
                        if (opt.active) {
                            optItem.classList.add('active');
                        }
                        optItem.addEventListener('click', (ev) => {
                            ev.stopPropagation();
                            submenu.style.display = 'none';
                            if (typeof this.onBotDifficultyChange === 'function') {
                                this.onBotDifficultyChange(slotIndex, opt.key);
                            }
                            this.hideContextMenu();
                        });
                        submenu.appendChild(optItem);
                    });

                    menu.appendChild(submenu);

                    const showSubmenu = () => {
                        submenu.style.display = 'block';
                    };
                    const maybeHideSubmenu = (ev) => {
                        if (submenu.contains(ev.relatedTarget) || diffItem.contains(ev.relatedTarget)) {
                            return;
                        }
                        submenu.style.display = 'none';
                    };

                    diffItem.addEventListener('mouseenter', showSubmenu);
                    diffItem.addEventListener('mouseleave', maybeHideSubmenu);
                    submenu.addEventListener('mouseenter', showSubmenu);
                    submenu.addEventListener('mouseleave', maybeHideSubmenu);

                    requestAnimationFrame(() => {
                        submenu.style.top = `${diffItem.offsetTop}px`;
                        submenu.style.left = `${menu.offsetWidth - 4}px`;
                    });

                    hasItems = true;
                }
            }
        }

        if (options.allowTeamMenu && typeof this.teamOptionsProvider === 'function') {
            // Build dynamic team submenu when the active mode exposes team choices
            const teamData = this.teamOptionsProvider(slotIndex, fighter) || {};
            const teamOptions = Array.isArray(teamData.teams) ? teamData.teams : [];
            const actions = Array.isArray(teamData.actions) ? teamData.actions : [];
            const label = teamData.label || 'Assign team';

            if (teamOptions.length) {
                const teamItem = document.createElement('div');
                teamItem.className = 'roster-context-item has-submenu';
                teamItem.textContent = label;
                menu.appendChild(teamItem);

                const teamSubmenu = document.createElement('div');
                teamSubmenu.className = 'roster-context-submenu';
                teamSubmenu.style.position = 'absolute';
                teamSubmenu.style.display = 'none';

                teamOptions.forEach(opt => {
                    const optItem = document.createElement('div');
                    optItem.className = 'roster-context-item';
                    optItem.textContent = opt.label || opt.name || 'Team';
                    if (opt.color) {
                        optItem.style.color = opt.color;
                    }
                    if (opt.active) {
                        optItem.classList.add('active');
                    }
                    if (opt.disabled) {
                        optItem.classList.add('disabled');
                        optItem.style.opacity = '0.6';
                    }
                    optItem.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        if (opt.disabled) {
                            return;
                        }
                        const targetTeamId = opt.teamId != null ? opt.teamId : opt.id;
                        if (!targetTeamId) {
                            return;
                        }
                        teamSubmenu.style.display = 'none';
                        if (typeof opt.onSelect === 'function') {
                            opt.onSelect({ slotIndex, fighter, teamId: targetTeamId });
                        } else if (typeof this.onAssignTeam === 'function') {
                            const fighterId = fighter && fighter.id ? fighter.id : null;
                            if (this.onAssignTeam.length >= 3) {
                                this.onAssignTeam(slotIndex, fighterId, targetTeamId, fighter);
                            } else {
                                this.onAssignTeam({ slotIndex, fighterId, teamId: targetTeamId, fighter });
                            }
                        }
                        this.hideContextMenu();
                    });
                    teamSubmenu.appendChild(optItem);
                });

                menu.appendChild(teamSubmenu);

                const showTeamSubmenu = () => {
                    teamSubmenu.style.display = 'block';
                };
                const maybeHideTeamSubmenu = (ev) => {
                    if (teamSubmenu.contains(ev.relatedTarget) || teamItem.contains(ev.relatedTarget)) {
                        return;
                    }
                    teamSubmenu.style.display = 'none';
                };

                teamItem.addEventListener('mouseenter', showTeamSubmenu);
                teamItem.addEventListener('mouseleave', maybeHideTeamSubmenu);
                teamSubmenu.addEventListener('mouseenter', showTeamSubmenu);
                teamSubmenu.addEventListener('mouseleave', maybeHideTeamSubmenu);

                requestAnimationFrame(() => {
                    teamSubmenu.style.top = `${teamItem.offsetTop}px`;
                    teamSubmenu.style.left = `${menu.offsetWidth - 4}px`;
                });

                hasItems = true;
            }

            actions.forEach(action => {
                if (!action || !action.label) return;
                const actionItem = document.createElement('div');
                actionItem.className = 'roster-context-item';
                actionItem.textContent = action.label;
                actionItem.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    if (typeof action.onSelect === 'function') {
                        action.onSelect({ slotIndex, fighter });
                    }
                    this.hideContextMenu();
                });
                menu.appendChild(actionItem);
                hasItems = true;
            });
        }

        if (!hasItems) {
            return;
        }

        document.body.appendChild(menu);
        this.contextMenuEl = menu;
        this.contextMenuSlot = slotIndex;

        setTimeout(() => {
            this.contextCloser = (ev) => {
                if (!this.contextMenuEl) return;
                if (this.contextMenuEl.contains(ev.target)) return;
                this.hideContextMenu();
            };
            this.contextKeyHandler = (ev) => {
                if (ev.key === 'Escape') {
                    this.hideContextMenu();
                }
            };
            window.addEventListener('click', this.contextCloser, true);
            window.addEventListener('contextmenu', this.contextCloser, true);
            window.addEventListener('keydown', this.contextKeyHandler, true);
        }, 0);
    }

    hideContextMenu() {
        if (this.contextMenuEl && this.contextMenuEl.parentNode) {
            this.contextMenuEl.parentNode.removeChild(this.contextMenuEl);
        }
        this.contextMenuEl = null;
        this.contextMenuSlot = null;
        if (this.contextCloser) {
            window.removeEventListener('click', this.contextCloser, true);
            window.removeEventListener('contextmenu', this.contextCloser, true);
            this.contextCloser = null;
        }
        if (this.contextKeyHandler) {
            window.removeEventListener('keydown', this.contextKeyHandler, true);
            this.contextKeyHandler = null;
        }
    }

    startInlineRename(slotIndex, options = {}) {
        const mode = options.mode || 'bot';
        if (mode === 'bot' && this.isJoinerView) return;
        this.hideContextMenu();
        const desc = this.roster.describeSlot(slotIndex);
        const fighter = desc.fighter;
        if (!fighter) return;
        if (mode === 'bot' && !fighter.isBot) return;
        if (mode === 'local' && !fighter.isLocal) return;

        const btn = this.rosterGrid.querySelector(`.roster-slot[data-slot="${slotIndex}"]`);
        if (!btn) return;
        const bodyEl = btn.querySelector('.slot-body');
        if (!bodyEl) return;

        const currentName = fighter.name || (mode === 'local' ? `Player ${slotIndex + 1}` : `Bot ${slotIndex + 1}`);

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'roster-inline-rename';
        input.value = currentName;
        input.maxLength = 32;

        bodyEl.textContent = '';
        bodyEl.appendChild(input);
        this.inlineRenameSlot = slotIndex;

        let handled = false;
        const commit = (shouldApply) => {
            if (handled) return;
            handled = true;

            const trimmed = (input.value || '').toString().trim().slice(0, 32);
            if (shouldApply && trimmed.length > 0 && trimmed !== fighter.name) {
                const updated = this.roster.updateFighter(fighter.id, { name: trimmed });
                if (updated) {
                    if (this.onRosterChanged) {
                        this.onRosterChanged();
                    }
                    if (mode === 'local' && this.onDisplayNameChange) {
                        this.onDisplayNameChange(slotIndex, fighter.id, trimmed);
                    }
                }
            }

            this.inlineRenameSlot = null;
            this.render();
        };

        input.addEventListener('keydown', (ev) => {
            ev.stopPropagation();
            if (ev.key === 'Enter') {
                ev.preventDefault();
                commit(true);
            } else if (ev.key === 'Escape') {
                ev.preventDefault();
                commit(false);
            }
        });

        input.addEventListener('keyup', (ev) => {
            ev.stopPropagation();
        });

        input.addEventListener('blur', () => {
            commit(true);
        });

        setTimeout(() => {
            input.focus();
            input.select();
        }, 0);
    }
}

// Export to window
if (typeof window !== 'undefined') {
    window.SetupUI = SetupUI;
}
