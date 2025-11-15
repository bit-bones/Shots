/**
 * MultiplayerUI.js
 * Handles multiplayer host/join modal UI
 */

class MultiplayerUI {
    constructor(game) {
        this.game = game;
        
        // Modal elements
        this.hostBtn = document.getElementById('host-btn');
        this.joinBtn = document.getElementById('join-btn');
        this.modal = document.getElementById('multiplayer-modal');
        this.closeBtn = document.getElementById('mp-close');
        
        // Host section
        this.hostSection = document.getElementById('mp-host-section');
        this.sessionCode = document.getElementById('mp-session-code');
        this.copyLinkBtn = document.getElementById('mp-copy-link');
        
        // Join section
        this.joinSection = document.getElementById('mp-join-section');
        this.joinCodeInput = document.getElementById('mp-join-code');
        this.joinConfirmBtn = document.getElementById('mp-join-confirm');
        this.pasteBtn = document.getElementById('mp-paste');
        
        // Roster panel session copy button
        this.sessionCopyBtn = document.getElementById('mp-session-copy');
        
        this.setupHandlers();
    }
    
    setupHandlers() {
        // Open modal for hosting
        this.hostBtn.onclick = () => {
            // If already hosting, just show the modal with existing code
            if (this.game.network.role === 'host' && this.game.network.sessionCode) {
                this.modal.style.display = 'flex';
                this.hostSection.style.display = 'flex';
                this.joinSection.style.display = 'none';
                this.sessionCode.value = this.game.network.sessionCode;
                return;
            }
            
            // Otherwise, create new host session
            this.modal.style.display = 'flex';
            this.hostSection.style.display = 'flex';
            this.joinSection.style.display = 'none';
            
            // Start hosting immediately with local fighter's current name
            const localFighter = this.game.roster ? this.game.roster.getLocalFighter() : null;
            const hostName = localFighter && localFighter.name ? localFighter.name : 'Player 1';

            this.game.hostMultiplayerGame(hostName).then(() => {
                // Session code will be shown via network callback
            }).catch(err => {
                console.error('Failed to host:', err);
                alert('Failed to host lobby: ' + err.message);
                this.modal.style.display = 'none';
            });
        };
        
        // Open modal for joining
        this.joinBtn.onclick = () => {
            this.modal.style.display = 'flex';
            this.hostSection.style.display = 'none';
            this.joinSection.style.display = 'flex';
            this.joinCodeInput.value = '';
            this.joinCodeInput.focus();
        };
        
        // Close modal
        this.closeBtn.onclick = () => {
            this.modal.style.display = 'none';
            // Don't disconnect - just close the modal
            // The session remains active in the background
        };
        
        // Copy session link
        this.copyLinkBtn.onclick = () => {
            const code = this.sessionCode.value;
            const link = window.location.origin + window.location.pathname + '?join=' + code;
            navigator.clipboard.writeText(link).then(() => {
                const originalText = this.copyLinkBtn.textContent;
                this.copyLinkBtn.textContent = 'Copied!';
                setTimeout(() => { this.copyLinkBtn.textContent = originalText; }, 1500);
            });
        };
        
        // Join game
        this.joinConfirmBtn.onclick = async () => {
            const code = this.joinCodeInput.value.trim().toUpperCase();
            if (!code) {
                alert('Please enter a session code');
                return;
            }
            
            // Use local fighter's current name as join name
            const localFighter = this.game.roster ? this.game.roster.getLocalFighter() : null;
            const joinName = localFighter && localFighter.name ? localFighter.name : 'Player';
            this.joinConfirmBtn.disabled = true;
            this.joinConfirmBtn.textContent = 'Joining...';
            
            try {
                await this.game.joinMultiplayerGame(code, joinName);
                this.modal.style.display = 'none';
            } catch (err) {
                console.error('Failed to join:', err);
                alert('Failed to join lobby: ' + err.message);
                this.joinConfirmBtn.disabled = false;
                this.joinConfirmBtn.textContent = 'Join';
            }
        };
        
        // Paste button
        this.pasteBtn.onclick = async () => {
            try {
                const text = await navigator.clipboard.readText();
                // Extract code from URL if pasted a link
                const match = text.match(/join=([A-Z0-9]+)/i);
                this.joinCodeInput.value = match ? match[1].toUpperCase() : text.toUpperCase();
            } catch (err) {
                console.error('Failed to paste:', err);
            }
        };
        
        // Copy session code from roster panel
        if (this.sessionCopyBtn) {
            this.sessionCopyBtn.onclick = () => {
                const label = document.getElementById('mp-session-label');
                if (label) {
                    const code = label.textContent;
                    const link = window.location.origin + window.location.pathname + '?join=' + code;
                    navigator.clipboard.writeText(link).then(() => {
                        this.sessionCopyBtn.classList.add('copied');
                        const originalText = this.sessionCopyBtn.textContent;
                        this.sessionCopyBtn.textContent = 'Copied!';
                        setTimeout(() => {
                            this.sessionCopyBtn.textContent = originalText;
                            this.sessionCopyBtn.classList.remove('copied');
                        }, 1500);
                    });
                }
            };
        }
    }
    
    /**
     * Update the session code display (called by network manager)
     */
    updateSessionCode(code) {
        if (this.sessionCode) {
            this.sessionCode.value = code;
        }
    }
}
