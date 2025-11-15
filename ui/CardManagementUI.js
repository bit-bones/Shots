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
        
        this.setupHandlers();
        this.loadSettings();
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
            '#5c7cff'
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
            '#a06cc7'
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
    renderCardList(cards, container, enabledSet, onToggle, fallbackColor = '#5c7cff') {
        const prevScrollTop = container ? container.scrollTop : 0;
        container.innerHTML = '';
        
        cards.forEach(card => {
            const isEnabled = enabledSet.has(card.name);
            
            const cardBtn = document.createElement('div');
            cardBtn.className = 'card-deck-btn';
            cardBtn.textContent = card.name;
            if (card && card.desc) {
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
            
            container.appendChild(cardBtn);
        });

        if (container && prevScrollTop) {
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
            worldMods: Array.from(this.cards.enabledWorldMods)
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
            
            // Restore saved settings
            if (settings.powerups) {
                settings.powerups.forEach(name => this.cards.enabledPowerups.add(name));
            }
            
            if (settings.worldMods) {
                settings.worldMods.forEach(name => this.cards.enabledWorldMods.add(name));
            }
        } catch (err) {
            console.error('Failed to load card settings:', err);
        }
    }
}
