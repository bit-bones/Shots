/**
 * CardsUI - Shows active PowerUp cards for each fighter at the top of the screen
 * Exact match to original game's card badges system
 */
class CardsUI {
    constructor() {
        this.container = document.getElementById('cards-ui');
        if (!this.container) {
            // Create if doesn't exist
            this.container = document.createElement('div');
            this.container.id = 'cards-ui';
            document.body.appendChild(this.container);
        }
        
        // Create rows for up to 4 fighters
        this.rows = [];
        for (let i = 0; i < 4; i++) {
            const row = document.createElement('div');
            row.id = `cards-row-${i}`;
            row.style.display = 'none';
            this.container.appendChild(row);
            this.rows.push(row);
        }
        
        // Create world modifiers row
        this.worldRow = document.createElement('div');
        this.worldRow.id = 'cards-row-world';
        this.worldRow.style.display = 'none';
        this.container.appendChild(this.worldRow);
    }

    update(fighters, activeWorldModifiers = []) {
        // Clear all rows
        this.rows.forEach(row => {
            row.innerHTML = '';
            row.style.display = 'none';
        });
        this.worldRow.innerHTML = '';
        this.worldRow.style.display = 'none';

        // Update fighter card badges (up to 4 fighters)
        for (let i = 0; i < Math.min(4, fighters.length); i++) {
            const fighter = fighters[i];
            if (!fighter || !fighter.alive) continue;

            const row = this.rows[i];
            const cards = fighter.cards || [];
            
            // Build cards HTML
            let cardsHtml = this.buildCardsHtml(cards);
            
            // Color-code by fighter (matches original)
            const colors = ['#65c6ff', '#ff5a5a', '#ffe066', '#2ecc71'];
            const color = fighter.color || colors[i];
            
            row.innerHTML = `<div class="cards-list"><span style="font-weight:bold; color:${color};">${fighter.name} Cards:</span> ${cardsHtml}</div>`;
            row.style.display = '';
        }

        // Update world modifiers row
        if (activeWorldModifiers && activeWorldModifiers.length > 0) {
            const worldHtml = this.buildCardsHtml(activeWorldModifiers);
            this.worldRow.innerHTML = `<div class="cards-list"><span style="font-weight:bold; color:#a06cc7;">World Cards:</span> ${worldHtml}</div>`;
            this.worldRow.style.display = '';
        }
    }

    buildCardsHtml(cards) {
        if (!cards || cards.length === 0) {
            return '<span class="card-badge none">None</span>';
        }

        // Count occurrences of each card (for stacking display)
        let counts = {};
        for (let c of cards) {
            counts[c] = (counts[c] || 0) + 1;
        }

        // Build HTML for each unique card
        let badges = [];
        for (let cardName of Object.keys(counts)) {
            const count = counts[cardName];
            const card = this.getCardByName(cardName);
            const desc = card ? card.desc : cardName;
            const titleText = desc ? String(desc).replace(/"/g, '&quot;').replace(/\n/g, '&#10;') : cardName;
            const rarityColor = card && card.rarityColor ? card.rarityColor : null;
            const styleParts = [];
            if (rarityColor) {
                styleParts.push(`border-color:${rarityColor}`);
                styleParts.push('color:#ffffff');
                const backdrop = this._rarityBadgeBackground(rarityColor);
                if (backdrop) {
                    styleParts.push(`background:${backdrop}`);
                }
            }
            const badgeStyle = styleParts.length ? `style="${styleParts.join(';')}"` : '';
            const suffix = count > 1 ? ` <small style="opacity:0.85; margin-left:6px;">x${count}</small>` : '';
            badges.push(`<span class="card-badge" ${badgeStyle} title="${titleText}">${cardName}${suffix}</span>`);
        }

        return badges.join('');
    }

    _rarityBadgeBackground(hex) {
        if (!hex) return null;
        const rgba = this._hexToRgba(hex, 0.18);
        return rgba;
    }

    _hexToRgba(hex, alpha) {
        if (!hex) return null;
        let clean = hex.replace('#', '');
        if (clean.length === 3) {
            clean = clean.split('').map(ch => ch + ch).join('');
        }
        if (clean.length !== 6) return null;
        const r = parseInt(clean.slice(0, 2), 16);
        const g = parseInt(clean.slice(2, 4), 16);
        const b = parseInt(clean.slice(4, 6), 16);
        const safeAlpha = Math.max(0, Math.min(1, alpha));
        return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
    }

    getCardByName(name) {
        // Try POWERUPS first
        if (typeof POWERUPS !== 'undefined') {
            const card = POWERUPS.find(c => c.name === name);
            if (card) return card;
        }

        // Try WORLD_MODIFIERS
        if (typeof WORLD_MODIFIERS !== 'undefined') {
            const mod = WORLD_MODIFIERS.find(m => m.name === name);
            if (mod) return mod;
        }

        return null;
    }

    hide() {
        this.rows.forEach(row => row.style.display = 'none');
        this.worldRow.style.display = 'none';
    }

    show() {
        // Show rows that have content
        this.rows.forEach(row => {
            if (row.innerHTML) row.style.display = '';
        });
        if (this.worldRow.innerHTML) this.worldRow.style.display = '';
    }
}

// Export to window
if (typeof window !== 'undefined') {
    window.CardsUI = CardsUI;
}
