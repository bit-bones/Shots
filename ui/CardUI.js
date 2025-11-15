/**
 * CardUI - Handles card selection UI with hand formation
 */
class CardUI {
    constructor() {
        this.container = document.getElementById('card-choices');
        this.active = false;
        this.choices = [];
        this.onSelectCallback = null;
        this.fighterColor = '#fff';
        this.cardEntries = [];
        this.interactive = true;
        this.onHoverCallback = null;
        this.onHoverEndCallback = null;
        this.currentHoverIndex = null;

        this.infoContainer = document.getElementById('card-choices-info');
        if (!this.infoContainer) {
            this.infoContainer = document.createElement('div');
            this.infoContainer.id = 'card-choices-info';
            this.container.insertAdjacentElement('afterend', this.infoContainer);
        }
        this.turnInfoEl = this.infoContainer.querySelector('.card-choice-line');
        if (!this.turnInfoEl) {
            this.turnInfoEl = document.createElement('div');
            this.turnInfoEl.className = 'card-choice-line';
            this.infoContainer.appendChild(this.turnInfoEl);
        }
        this.queueInfoEl = this.infoContainer.querySelector('.card-choice-subline');
        if (!this.queueInfoEl) {
            this.queueInfoEl = document.createElement('div');
            this.queueInfoEl.className = 'card-choice-subline';
            this.infoContainer.appendChild(this.queueInfoEl);
        }
        this._updateInfoPanel('', '');
    }

    show(cards, onSelect, fighterColor = '#fff', options = {}) {
        this.active = true;
        this.choices = cards || [];
        this.onSelectCallback = onSelect;
        this.fighterColor = fighterColor;
        this.interactive = options && options.interactive !== false;
        this.onHoverCallback = options && typeof options.onHover === 'function' ? options.onHover : null;
        this.onHoverEndCallback = options && typeof options.onHoverEnd === 'function' ? options.onHoverEnd : null;
        this.currentHoverIndex = null;
        this.cardEntries = [];
        const turnLabel = options && typeof options.turnLabel === 'string' ? options.turnLabel : '';
        const queuedLabel = options && typeof options.queuedLabel === 'string' ? options.queuedLabel : '';
        this._updateInfoPanel(turnLabel, queuedLabel);

        this.container.innerHTML = '';
        this.container.style.pointerEvents = this.interactive ? 'auto' : 'none';
        
        // Hand formation parameters (exact match to original)
        const handRadius = 220;
        const cardWidth = 170;
        const cardHeight = 220;
        const baseAngle = Math.PI / 2;
        const spread = Math.PI / 1.1;
        const denom = Math.max(1, this.choices.length - 1);
        
        for (let i = 0; i < this.choices.length; i++) {
            const card = this.choices[i];
            const rarityColor = card.rarityColor || '#4a5568';
            const rarityLabel = card.rarityLabel || '';
            const rarityBorder = this._colorWithAlpha(rarityColor, 0.6);
            const rarityText = this._colorWithAlpha(rarityColor, 0.9);
            const lines = Array.isArray(card.lines) && card.lines.length ? card.lines : [{ text: card.desc || '', tone: 'neutral' }];
            const lineItems = lines.map(line => {
                const tone = line && line.tone ? line.tone : 'neutral';
                const text = line && line.text ? line.text : '';
                return `<li class="card-line card-line-${tone}">${text}</li>`;
            }).join('');
            const cardEl = document.createElement('div');
            cardEl.className = 'card card-uniform';
            cardEl.dataset.rarityColor = rarityColor;
            cardEl.style.borderColor = '#2f3542';
            cardEl.style.setProperty('--rarity-color', rarityColor);
            cardEl.style.setProperty('--rarity-color-soft', this._colorWithAlpha(rarityColor, 0.24));
            cardEl.style.setProperty('--rarity-color-glow', this._colorWithAlpha(rarityColor, 0.35));
            cardEl.innerHTML = `
                <div class="card-rarity-trim"></div>
                <div class="card-body">
                    <div class="card-header">
                        <b>${card.name}</b>
                        ${rarityLabel ? `<span class="card-rarity-label" style="color:${rarityText}; border-color:${rarityBorder};">${rarityLabel}</span>` : ''}
                    </div>
                    <ul class="card-lines">${lineItems}</ul>
                </div>
            `;
            
            // Calculate position in fan/hand formation
            const theta = this.choices.length === 1
                ? baseAngle
                : baseAngle - (i - (this.choices.length - 1) / 2) * (spread / denom);
            const x = Math.cos(theta) * handRadius;
            const y = Math.sin(theta) * handRadius;
            const rot = (Math.PI / 2 - theta) * 28;
            
            Object.assign(cardEl.style, {
                position: 'absolute',
                left: `calc(50% + ${x}px)`,
                bottom: `calc(-10% + ${y}px)`,
                width: cardWidth + 'px',
                height: cardHeight + 'px',
                transform: `translate(-50%, 0) rotate(${rot}deg)`,
                zIndex: '1'
            });
            
            const entry = {
                index: i,
                element: cardEl,
                card,
                rarityColor,
                rarityBorder,
                rarityText,
                baseBorderColor: '#2f3542',
                defaultTransform: `translate(-50%, 0) rotate(${rot}deg)`,
                applyHover: (silent = false) => {
                    if (this.currentHoverIndex === i) return;
                    this._clearHoverAll(true);
                    this.currentHoverIndex = i;
                    cardEl.classList.add('selected', 'centered');
                    cardEl.style.zIndex = '10';
                    cardEl.style.transform = 'translate(-50%, -60px) scale(1.18) rotate(0deg)';
                    try {
                        cardEl.style.setProperty('border', '3px solid ' + this.fighterColor, 'important');
                        cardEl.style.setProperty('box-shadow', '0 6px 18px ' + this.fighterColor, 'important');
                        const header = cardEl.querySelector('.card-header b');
                        if (header) header.style.setProperty('color', this.fighterColor, 'important');
                        const rarityLabelEl = cardEl.querySelector('.card-rarity-label');
                        if (rarityLabelEl) rarityLabelEl.style.setProperty('border-color', this.fighterColor, 'important');
                        if (rarityLabelEl) rarityLabelEl.style.setProperty('color', this.fighterColor, 'important');
                        if (!cardEl._accentClass) cardEl._accentClass = 'card-accent-' + Math.floor(Math.random() * 1000000);
                        if (!cardEl._accentStyle) {
                            const styleEl = document.createElement('style');
                            styleEl.innerText = `.${cardEl._accentClass}::after{ background: radial-gradient(ellipse at center, ${this.fighterColor}33 0%, #0000 100%) !important; } .${cardEl._accentClass}.centered::after{ background: radial-gradient(ellipse at center, ${this.fighterColor}55 0%, #0000 100%) !important; }`;
                            document.head.appendChild(styleEl);
                            cardEl._accentStyle = styleEl;
                        }
                        cardEl.classList.add(cardEl._accentClass);
                    } catch (e) {}
                    if (!silent && this.onHoverCallback) {
                        this.onHoverCallback(i, card);
                    }
                },
                clearHover: (silent = false) => {
                    if (this.currentHoverIndex !== i && !silent) {
                        // Only fire hover end for the active card
                        return;
                    }
                    if (this.currentHoverIndex === i) {
                        this.currentHoverIndex = null;
                    }
                    cardEl.classList.remove('selected', 'centered');
                    cardEl.style.zIndex = '1';
                    cardEl.style.transform = entry.defaultTransform;
                    try {
                        cardEl.style.removeProperty('border');
                        cardEl.style.removeProperty('border-color');
                        cardEl.style.removeProperty('box-shadow');
                        const header = cardEl.querySelector('.card-header b');
                        if (header) header.style.removeProperty('color');
                        const rarityLabelEl = cardEl.querySelector('.card-rarity-label');
                        if (rarityLabelEl) {
                            rarityLabelEl.style.removeProperty('border-color');
                            rarityLabelEl.style.removeProperty('color');
                            rarityLabelEl.style.setProperty('border-color', entry.rarityBorder);
                            rarityLabelEl.style.setProperty('color', entry.rarityText);
                        }
                        if (cardEl._accentClass) cardEl.classList.remove(cardEl._accentClass);
                        if (cardEl._accentStyle) {
                            cardEl._accentStyle.remove();
                            cardEl._accentStyle = null;
                        }
                        cardEl.style.borderColor = entry.baseBorderColor;
                    } catch (e) {}
                    if (!silent && this.onHoverEndCallback) {
                        this.onHoverEndCallback(i, card);
                    }
                }
            };

            this.cardEntries.push(entry);

            if (this.interactive) {
                cardEl.onmouseenter = () => entry.applyHover();
                cardEl.onmouseleave = () => entry.clearHover();
                cardEl.onclick = () => this.selectCard(card);
            } else {
                cardEl.onmouseenter = null;
                cardEl.onmouseleave = null;
                cardEl.onclick = null;
            }
            
            this.container.appendChild(cardEl);
        }
        
        Object.assign(this.container.style, {
            display: 'flex',
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            height: '320px',
            width: '900px'
        });
        this.container.classList.add('card-bg-visible');
    }

    selectCard(cardOrName) {
        if (!this.active) return;
        
        // If string is passed (for bot auto-select), find the card and highlight it
        if (typeof cardOrName === 'string') {
            const idx = this.cardEntries.findIndex(entry => entry.card.name === cardOrName);
            if (idx !== -1) {
                this.highlightCard(idx);
            }
            return; // Don't close UI yet - caller will handle it
        }
        
        // Normal card selection (human player clicked)
        const card = cardOrName;
        const idx = this.cardEntries.findIndex(entry => entry.card === card || entry.card.name === card.name);
        if (idx !== -1) {
            this.highlightCard(idx);
        }
        this.active = false;
        this.container.style.display = 'none';
        this.container.innerHTML = '';
        this.container.classList.remove('card-bg-visible');
        
        if (this.onSelectCallback) {
            this.onSelectCallback(card.name);
        }
    }

    hide() {
        this.active = false;
        this.container.style.display = 'none';
        this.container.innerHTML = '';
        this.container.classList.remove('card-bg-visible');
        this.container.style.pointerEvents = 'none';
        this.cardEntries = [];
        this.currentHoverIndex = null;
        this.onHoverCallback = null;
        this.onHoverEndCallback = null;
        this._updateInfoPanel('', '');
    }

    isActive() {
        return this.active;
    }

    setInteractionEnabled(enabled) {
        this.interactive = !!enabled;
        this.container.style.pointerEvents = this.interactive ? 'auto' : 'none';
    }

    highlightCard(index) {
        if (!this.active || index === undefined || index === null) return;
        const entry = this.cardEntries[index];
        if (!entry) return;
        entry.applyHover(true);
    }

    clearHighlight() {
        this._clearHoverAll(true);
        this.currentHoverIndex = null;
    }

    _clearHoverAll(silent = false) {
        for (const entry of this.cardEntries) {
            entry.clearHover(silent);
        }
    }

    _updateInfoPanel(turnLabel, queuedLabel) {
        if (!this.infoContainer) return;
        const hasTurn = typeof turnLabel === 'string' && turnLabel.trim().length > 0;
        const hasQueued = typeof queuedLabel === 'string' && queuedLabel.trim().length > 0;
        if (this.turnInfoEl) {
            this.turnInfoEl.innerHTML = hasTurn ? turnLabel : '';
            this.turnInfoEl.style.display = hasTurn ? '' : 'none';
        }
        if (this.queueInfoEl) {
            this.queueInfoEl.textContent = hasQueued ? queuedLabel : '';
            this.queueInfoEl.style.display = hasQueued ? '' : 'none';
        }
        this.infoContainer.style.display = (hasTurn || hasQueued) ? 'flex' : 'none';
    }

        _colorWithAlpha(hex, alpha) {
            if (!hex) return `rgba(74, 85, 104, ${alpha})`;
            let clean = hex.replace('#', '');
            if (clean.length === 3) {
                clean = clean.split('').map(ch => ch + ch).join('');
            }
            if (clean.length !== 6) {
                return `rgba(74, 85, 104, ${alpha})`;
            }
            const r = parseInt(clean.slice(0, 2), 16);
            const g = parseInt(clean.slice(2, 4), 16);
            const b = parseInt(clean.slice(4, 6), 16);
            return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
        }
}

// Export to window
if (typeof window !== 'undefined') {
    window.CardUI = CardUI;
}
