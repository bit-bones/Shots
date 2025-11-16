/**
 * CardManagementUI.js
 * Handles card management modals for PowerUps and World Modifiers
 */

class CardManagementUI {
    constructor(cardSystem) {
        this.cards = cardSystem;
        
        // PowerUp modal elements
        this.powerupBtn = document.getElementById('manage-powerups-btn');
        this.powerupModal = document.getElementById('powerup-modal');
        this.powerupClose = document.getElementById('powerup-modal-close');
        this.powerupList = document.getElementById('powerup-card-list');
        this.powerupEnableAll = document.getElementById('powerup-enable-all');
        this.powerupDisableAll = document.getElementById('powerup-disable-all');
        
        // World Modifier modal elements
        this.worldmodBtn = document.getElementById('manage-worldmods-btn');
        this.worldmodModal = document.getElementById('worldmod-modal');
        this.worldmodClose = document.getElementById('worldmod-modal-close');
        this.worldmodList = document.getElementById('worldmod-card-list');
        this.worldmodEnableAll = document.getElementById('worldmod-enable-all');
        this.worldmodDisableAll = document.getElementById('worldmod-disable-all');

        // Context menu state
        this._contextMenu = null;
        this._contextMenuMeta = null;
        this._contextMenuSubItems = [];
        this._contextMenuSubmenu = null;
        this._contextMenuStylesInjected = false;
        this._contextMenuHandlersBound = false;
        
        this.setupHandlers();
        this.loadSettings();
        this._ensureContextMenuStyles();
        this._bindGlobalContextMenuHandlers();
    }
    
    setupHandlers() {
        // PowerUp modal handlers
        this.powerupBtn.onclick = () => {
            this.powerupModal.style.display = 'flex';
            this.renderPowerupList();
        };
        
        this.powerupClose.onclick = () => {
            this.powerupModal.style.display = 'none';
        };
        
        this.powerupEnableAll.onclick = () => {
            POWERUPS.forEach(card => this.cards.togglePowerup(card.name, true));
            this.saveSettings();
            this.renderPowerupList();
        };
        
        this.powerupDisableAll.onclick = () => {
            POWERUPS.forEach(card => this.cards.togglePowerup(card.name, false));
            this.saveSettings();
            this.renderPowerupList();
        };
        
        // World Modifier modal handlers
        this.worldmodBtn.onclick = () => {
            this.worldmodModal.style.display = 'flex';
            this.renderWorldModList();
        };
        
        this.worldmodClose.onclick = () => {
            this.worldmodModal.style.display = 'none';
        };
        
        this.worldmodEnableAll.onclick = () => {
            WORLD_MODIFIERS.forEach(card => this.cards.toggleWorldMod(card.name, true));
            this.saveSettings();
            this.renderWorldModList();
        };
        
        this.worldmodDisableAll.onclick = () => {
            WORLD_MODIFIERS.forEach(card => this.cards.toggleWorldMod(card.name, false));
            this.saveSettings();
            this.renderWorldModList();
        };
    }
    
    renderPowerupList() {
        const sortedPowerups = this._getSortedPowerups();
        this.renderCardList(
            sortedPowerups,
            this.powerupList,
            this.cards.enabledPowerups,
            (cardName, enabled) => {
                this.cards.togglePowerup(cardName, enabled);
                this.saveSettings();
                this.renderPowerupList();
            },
            '#5c7cff',
            'powerup'
        );
        this.updateCount('powerup', this.cards.enabledPowerups.size);
    }
    
    renderWorldModList() {
        this.renderCardList(
            WORLD_MODIFIERS,
            this.worldmodList,
            this.cards.enabledWorldMods,
            (cardName, enabled) => {
                this.cards.toggleWorldMod(cardName, enabled);
                this.saveSettings();
                this.renderWorldModList();
            },
            '#a06cc7',
            'world'
        );
        this.updateCount('worldmod', this.cards.enabledWorldMods.size);
    }
    
    updateCount(type, count) {
        const countEl = document.getElementById(type + '-count');
        if (countEl) {
            countEl.textContent = `(${count} active)`;
        }
    }
    
    /**
     * Render card list in a modal (matches original game's grid layout)
     * @param {Array} cards - Array of card objects
     * @param {HTMLElement} container - Container element to render into
     * @param {Set} enabledSet - Set of enabled card names
     * @param {Function} onToggle - Callback when a card is toggled (cardName, enabled)
     */
    renderCardList(cards, container, enabledSet, onToggle, fallbackColor = '#5c7cff', type = 'powerup') {
        if (!container) return;
        const list = Array.isArray(cards) ? cards : [];
        const prevScrollTop = container.scrollTop || 0;
        container.innerHTML = '';

        // Close any open context menu before rerendering the list
        this._hideContextMenu();

        list.forEach(card => {
            if (!card || !card.name) return;
            const isEnabled = enabledSet && typeof enabledSet.has === 'function' ? enabledSet.has(card.name) : false;

            const cardBtn = document.createElement('div');
            cardBtn.className = 'card-deck-btn';
            cardBtn.textContent = card.name;
            if (card.desc) {
                cardBtn.title = card.desc;
            }

            const rarityColor = this._resolveCardColor(card, fallbackColor);
            const style = this._computeCardStyles(rarityColor, isEnabled);
            cardBtn.style.background = style.background;
            cardBtn.style.border = style.border;
            cardBtn.style.boxShadow = style.shadow;
            cardBtn.style.color = style.text;
            cardBtn.style.opacity = style.opacity;

            cardBtn.onclick = () => {
                onToggle(card.name, !isEnabled);
            };

            cardBtn.addEventListener('contextmenu', (event) => {
                this._handleCardContextMenu(event, card, type);
            });

            const startStacks = type === 'world'
                ? this.cards.getStartWorldModStacks(card.name)
                : this.cards.getStartPowerupStacks(card.name);

            if (startStacks > 0) {
                const badge = document.createElement('div');
                badge.className = 'card-start-badge';
                badge.textContent = `S${startStacks}`;
                badge.title = `Activate on start: ${startStacks} stack${startStacks === 1 ? '' : 's'}`;
                badge.style.background = type === 'world' ? 'rgba(160,108,199,0.85)' : 'rgba(92,124,255,0.85)';
                badge.style.border = '1px solid rgba(255,255,255,0.18)';
                if (!cardBtn.style.position) {
                    cardBtn.style.position = 'relative';
                }
                cardBtn.appendChild(badge);
            }

            container.appendChild(cardBtn);
        });

        if (prevScrollTop) {
            container.scrollTop = prevScrollTop;
        }
    }

    _resolveCardColor(card, fallbackHex) {
        if (card && card.rarityColor) return card.rarityColor;
        if (typeof POWERUP_LOOKUP !== 'undefined' && POWERUP_LOOKUP) {
            const refName = card && card.name;
            if (refName && POWERUP_LOOKUP[refName] && POWERUP_LOOKUP[refName].rarityColor) {
                return POWERUP_LOOKUP[refName].rarityColor;
            }
        }
        return fallbackHex || '#5c7cff';
    }

    _computeCardStyles(colorHex, enabled) {
        const rgb = this._parseHexColor(colorHex);
        const base = rgb || { r: 101, g: 198, b: 255 };
        const tintStrong = enabled ? 0.26 : 0.12;
        const tintSoft = enabled ? 0.16 : 0.06;
        const borderAlpha = enabled ? 0.88 : 0.35;
        const glowAlpha = enabled ? 0.16 : 0.06;
        const textColor = enabled ? '#f5f8ff' : 'rgba(213, 222, 235, 0.84)';
        const opacity = enabled ? '1' : '0.78';

        const background = `linear-gradient(135deg, rgba(${base.r}, ${base.g}, ${base.b}, ${tintStrong}) 0%, rgba(${base.r}, ${base.g}, ${base.b}, ${tintSoft}) 100%)`;
        const border = `1.8px solid rgba(${base.r}, ${base.g}, ${base.b}, ${borderAlpha})`;
        const shadow = enabled
            ? `0 8px 18px rgba(${base.r}, ${base.g}, ${base.b}, ${glowAlpha}), inset 0 0 0 1px rgba(0, 0, 0, 0.18)`
            : `inset 0 1px 0 rgba(${base.r}, ${base.g}, ${base.b}, ${glowAlpha})`;

        return {
            background,
            border,
            shadow,
            text: textColor,
            opacity
        };
    }

    _parseHexColor(hex) {
        if (!hex || typeof hex !== 'string') {
            return { r: 101, g: 198, b: 255 };
        }
        let value = hex.trim();
        if (value.startsWith('#')) {
            value = value.slice(1);
        }
        if (value.length === 3) {
            value = value.split('').map(ch => ch + ch).join('');
        }
        if (value.length !== 6) {
            return { r: 101, g: 198, b: 255 };
        }
        const num = parseInt(value, 16);
        if (Number.isNaN(num)) {
            return { r: 101, g: 198, b: 255 };
        }
        return {
            r: (num >> 16) & 0xff,
            g: (num >> 8) & 0xff,
            b: num & 0xff
        };
    }

    _getSortedPowerups() {
        if (!Array.isArray(POWERUPS)) return [];
        return POWERUPS.slice().sort((a, b) => this._comparePowerupCards(a, b));
    }

    _comparePowerupCards(a, b) {
        const rankA = this._getPowerupRarityRank(a && a.rarity);
        const rankB = this._getPowerupRarityRank(b && b.rarity);
        if (rankA !== rankB) return rankA - rankB;
        const nameA = (a && a.name) || '';
        const nameB = (b && b.name) || '';
        return nameA.localeCompare(nameB);
    }

    _getPowerupRarityRank(rarity) {
        const order = this._getPowerupRarityOrder();
        const index = order.indexOf(rarity);
        return index === -1 ? order.length : index;
    }

    _getPowerupRarityOrder() {
        if (this._powerupRarityOrder) return this._powerupRarityOrder;
        const order = [];
        if (typeof POWERUP_RARITIES !== 'undefined' && POWERUP_RARITIES) {
            const keys = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];
            keys.forEach(key => {
                if (POWERUP_RARITIES[key]) {
                    order.push(POWERUP_RARITIES[key]);
                }
            });
        }
        this._powerupRarityOrder = order;
        return order;
    }
    
    /**
     * Save card settings to localStorage
     */
    saveSettings() {
        const settings = {
            powerups: Array.from(this.cards.enabledPowerups),
            worldMods: Array.from(this.cards.enabledWorldMods),
            startPowerups: this.cards.getStartPowerupEntries(),
            startWorldMods: this.cards.getStartWorldModEntries()
        };
        
        localStorage.setItem('shape_shot_card_settings', JSON.stringify(settings));
    }
    
    /**
     * Load card settings from localStorage
     */
    loadSettings() {
        const saved = localStorage.getItem('shape_shot_card_settings');
        if (!saved) return;
        
        try {
            const settings = JSON.parse(saved);
            
            // Clear current sets
            this.cards.enabledPowerups.clear();
            this.cards.enabledWorldMods.clear();
            this.cards.clearStartPowerupStacks();
            this.cards.clearStartWorldModStacks();
            
            // Restore saved settings
            if (settings.powerups) {
                settings.powerups.forEach(name => this.cards.enabledPowerups.add(name));
            }
            
            if (settings.worldMods) {
                settings.worldMods.forEach(name => this.cards.enabledWorldMods.add(name));
            }

            if (Array.isArray(settings.startPowerups)) {
                settings.startPowerups.forEach(entry => {
                    if (!entry) return;
                    if (Array.isArray(entry)) {
                        this.cards.setStartPowerupStacks(entry[0], entry[1]);
                    } else if (typeof entry === 'object' && entry.name !== undefined) {
                        this.cards.setStartPowerupStacks(entry.name, entry.count);
                    }
                });
            }

            if (Array.isArray(settings.startWorldMods)) {
                settings.startWorldMods.forEach(entry => {
                    if (!entry) return;
                    if (Array.isArray(entry)) {
                        this.cards.setStartWorldModStacks(entry[0], entry[1]);
                    } else if (typeof entry === 'object' && entry.name !== undefined) {
                        this.cards.setStartWorldModStacks(entry.name, entry.count);
                    }
                });
            }
        } catch (err) {
            console.error('Failed to load card settings:', err);
        }
    }

    _handleCardContextMenu(event, card, type = 'powerup') {
        if (event) {
            if (typeof event.preventDefault === 'function') event.preventDefault();
            if (typeof event.stopPropagation === 'function') event.stopPropagation();
        }
        if (!card || !card.name) return;
        this._ensureContextMenu();
        if (!this._contextMenu) return;

        const scrollX = window.scrollX !== undefined ? window.scrollX : window.pageXOffset || 0;
        const scrollY = window.scrollY !== undefined ? window.scrollY : window.pageYOffset || 0;
        const clientX = event && typeof event.clientX === 'number' ? event.clientX : 0;
        const clientY = event && typeof event.clientY === 'number' ? event.clientY : 0;

        this._showContextMenu(card.name, type, clientX + scrollX, clientY + scrollY);
    }

    _ensureContextMenu() {
        if (this._contextMenu || typeof document === 'undefined') return;
        this._ensureContextMenuStyles();

        const menu = document.createElement('div');
        menu.className = 'card-context-menu';
        menu.style.display = 'none';

        const item = document.createElement('div');
        item.className = 'card-context-item has-submenu';

        const label = document.createElement('span');
        label.textContent = 'Activate on start';
        item.appendChild(label);

        const arrow = document.createElement('span');
        arrow.className = 'submenu-arrow';
        arrow.textContent = '\u25B6';
        item.appendChild(arrow);

        const submenu = document.createElement('div');
        submenu.className = 'card-context-submenu';
        item.appendChild(submenu);
        this._contextMenuSubmenu = submenu;
        this._contextMenuSubItems = [];

        const options = [
            { value: 0, label: 'Off' },
            { value: 1, label: '1 Stack' },
            { value: 2, label: '2 Stacks' },
            { value: 3, label: '3 Stacks' },
            { value: 4, label: '4 Stacks' },
            { value: 5, label: '5 Stacks' }
        ];

        options.forEach(opt => {
            const optionEl = document.createElement('div');
            optionEl.className = 'submenu-item';
            optionEl.textContent = opt.label;
            optionEl.dataset.value = String(opt.value);
            optionEl.addEventListener('click', (ev) => {
                if (ev) {
                    ev.stopPropagation();
                    ev.preventDefault();
                }
                this._handleContextMenuSelection(opt.value);
            });
            submenu.appendChild(optionEl);
            this._contextMenuSubItems.push(optionEl);
        });

        menu.appendChild(item);
        document.body.appendChild(menu);
        this._contextMenu = menu;
    }

    _ensureContextMenuStyles() {
        if (this._contextMenuStylesInjected || typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.id = 'card-context-menu-styles';
        style.textContent = `
.card-context-menu { position:absolute; z-index:10000; background:#101521; color:#d9e1f7; border:1px solid rgba(255,255,255,0.08); border-radius:8px; min-width:180px; box-shadow:0 14px 28px rgba(0,0,0,0.45); padding:4px 0; font-size:13px; user-select:none; }
.card-context-item { display:flex; align-items:center; justify-content:space-between; padding:8px 12px; cursor:pointer; gap:12px; }
.card-context-item:hover { background:rgba(92,124,255,0.16); }
.card-context-item.has-submenu { position:relative; }
.card-context-item .submenu-arrow { font-size:11px; opacity:0.6; }
.card-context-submenu { position:absolute; top:0; left:100%; margin-left:6px; background:#101521; border:1px solid rgba(255,255,255,0.08); border-radius:8px; min-width:140px; box-shadow:0 14px 28px rgba(0,0,0,0.42); padding:4px 0; display:none; }
.card-context-submenu.submenu-left { left:auto; right:100%; margin-left:0; margin-right:6px; }
.card-context-item.has-submenu:hover .card-context-submenu { display:block; }
.card-context-submenu .submenu-item { padding:7px 12px; white-space:nowrap; cursor:pointer; color:#d9e1f7; }
.card-context-submenu .submenu-item:hover { background:rgba(92,124,255,0.22); }
.card-context-submenu .submenu-item.active { background:rgba(92,124,255,0.32); color:#ffffff; }
.card-start-badge { position:absolute; top:6px; right:8px; border-radius:999px; padding:2px 7px; font-size:11px; font-weight:600; color:#ffffff; pointer-events:none; box-shadow:0 2px 6px rgba(0,0,0,0.35); }
`; 
        const head = document.head || document.getElementsByTagName('head')[0];
        if (!head) return;
        head.appendChild(style);
        this._contextMenuStylesInjected = true;
    }

    _bindGlobalContextMenuHandlers() {
        if (this._contextMenuHandlersBound || typeof document === 'undefined') return;
        const dismiss = (event) => this._handleGlobalContextMenuDismiss(event);
        document.addEventListener('click', dismiss, true);
        document.addEventListener('contextmenu', dismiss, true);
        document.addEventListener('scroll', dismiss, true);
        window.addEventListener('resize', dismiss, true);
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this._handleGlobalContextMenuDismiss(event);
            }
        });
        this._contextMenuDismiss = dismiss;
        this._contextMenuHandlersBound = true;
    }

    _handleGlobalContextMenuDismiss(event) {
        if (!this._contextMenu || this._contextMenu.style.display !== 'block') return;
        if (event) {
            if (event.type === 'keydown' && event.key !== 'Escape') return;
            if ((event.type === 'click' || event.type === 'contextmenu') && this._contextMenu.contains(event.target)) {
                return;
            }
        }
        this._hideContextMenu();
    }

    _showContextMenu(cardName, type, pageX, pageY) {
        if (!this._contextMenu) return;
        this._contextMenuMeta = { cardName, type };
        this._contextMenu.style.display = 'block';
        this._contextMenu.style.visibility = 'hidden';

        const currentStacks = type === 'world'
            ? this.cards.getStartWorldModStacks(cardName)
            : this.cards.getStartPowerupStacks(cardName);
        this._highlightContextMenuSelection(currentStacks);

        this._contextMenu.style.left = `${pageX}px`;
        this._contextMenu.style.top = `${pageY}px`;

        const menuRect = this._contextMenu.getBoundingClientRect();
        const scrollX = window.scrollX !== undefined ? window.scrollX : window.pageXOffset || 0;
        const scrollY = window.scrollY !== undefined ? window.scrollY : window.pageYOffset || 0;
        const viewportRight = scrollX + (window.innerWidth || document.documentElement.clientWidth || 0);
        const viewportBottom = scrollY + (window.innerHeight || document.documentElement.clientHeight || 0);

        let left = pageX;
        let top = pageY;
        if (left + menuRect.width > viewportRight) {
            left = viewportRight - menuRect.width - 6;
        }
        if (left < scrollX) {
            left = scrollX;
        }
        if (top + menuRect.height > viewportBottom) {
            top = viewportBottom - menuRect.height - 6;
        }
        if (top < scrollY) {
            top = scrollY;
        }

        this._contextMenu.style.left = `${Math.max(0, left)}px`;
        this._contextMenu.style.top = `${Math.max(0, top)}px`;

        if (this._contextMenuSubmenu) {
            this._contextMenuSubmenu.classList.remove('submenu-left');
            const submenuRect = this._contextMenuSubmenu.getBoundingClientRect();
            if (submenuRect.right > viewportRight) {
                this._contextMenuSubmenu.classList.add('submenu-left');
            }
        }

        this._contextMenu.style.visibility = 'visible';
    }

    _hideContextMenu() {
        if (!this._contextMenu) return;
        this._contextMenu.style.display = 'none';
        this._contextMenuMeta = null;
    }

    _highlightContextMenuSelection(value) {
        const targetValue = Number(value) || 0;
        if (!Array.isArray(this._contextMenuSubItems)) return;
        this._contextMenuSubItems.forEach(item => {
            if (!item) return;
            const itemValue = Number(item.dataset.value) || 0;
            if (itemValue === targetValue) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    _handleContextMenuSelection(value) {
        if (!this._contextMenuMeta) return;
        const meta = this._contextMenuMeta;
        const stacks = Math.max(0, Math.min(5, Number(value) || 0));
        const { cardName, type } = meta;
        this._hideContextMenu();

        if (type === 'world') {
            this.cards.setStartWorldModStacks(cardName, stacks);
            this.saveSettings();
            this.renderWorldModList();
        } else {
            this.cards.setStartPowerupStacks(cardName, stacks);
            this.saveSettings();
            this.renderPowerupList();
        }
    }
}
