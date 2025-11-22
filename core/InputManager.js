/**
 * InputManager - Handles keyboard and mouse input
 */
class InputManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.keys = Object.create(null);
        this.mouseX = 0;
        this.mouseY = 0;
        this.mouseDown = false;
        this.mouseJustPressed = false;
        this.dashRequested = false;
        this.shootRequested = false;
        
        // Load control bindings
        this.loadControlBindings();
        
        this.setupListeners();
    }

    loadControlBindings() {
        // Default control bindings
        this.controls = {
            'shoot-primary': 'LMB',
            'shoot-secondary': 'Space',
            'dash-primary': 'RMB',
            'dash-secondary': 'Shift'
        };

        // Load from localStorage
        try {
            Object.keys(this.controls).forEach(key => {
                const saved = localStorage.getItem(`shape_shot_control_${key}`);
                if (saved) {
                    this.controls[key] = saved;
                }
            });
        } catch (e) {
            console.warn('Failed to load control bindings:', e);
        }
    }

    reloadControlBindings() {
        this.loadControlBindings();
    }

    normalizeKeyName(key) {
        if (key === ' ') return 'Space';
        if (key.length === 1) return key.toUpperCase();
        return key;
    }

    _setKeyState(event, isPressed) {
        if (!event) return;

        const rawKey = event.key;
        if (typeof rawKey === 'string' && rawKey.length > 0) {
            this.keys[rawKey] = isPressed;
            if (rawKey.length === 1) {
                this.keys[rawKey.toLowerCase()] = isPressed;
                this.keys[rawKey.toUpperCase()] = isPressed;
            }
        }

        const code = event.code;
        if (typeof code === 'string' && code.length > 0) {
            this.keys[code] = isPressed;
            // Map common movement aliases for consumers that rely on letter keys
            switch (code) {
                case 'KeyW':
                    this.keys['w'] = isPressed;
                    this.keys['W'] = isPressed;
                    break;
                case 'KeyA':
                    this.keys['a'] = isPressed;
                    this.keys['A'] = isPressed;
                    break;
                case 'KeyS':
                    this.keys['s'] = isPressed;
                    this.keys['S'] = isPressed;
                    break;
                case 'KeyD':
                    this.keys['d'] = isPressed;
                    this.keys['D'] = isPressed;
                    break;
                case 'ArrowUp':
                case 'ArrowDown':
                case 'ArrowLeft':
                case 'ArrowRight':
                    this.keys[code] = isPressed;
                    break;
                default:
                    break;
            }
        }
    }

    getMouseButtonName(button) {
        switch (button) {
            case 0: return 'LMB';
            case 1: return 'MMB';
            case 2: return 'RMB';
            default: return `Mouse${button}`;
        }
    }

    setupListeners() {
        // Keyboard
        const handleKeyDown = (e) => {
            this._setKeyState(e, true);
            
            // Check for dash keys
            const dashKey = this.normalizeKeyName(e.key);
            if (dashKey === this.controls['dash-primary'] || dashKey === this.controls['dash-secondary']) {
                this.dashRequested = true;
                e.preventDefault();
            }
            
            // Check for shoot keys
            const shootKey = this.normalizeKeyName(e.key);
            if (shootKey === this.controls['shoot-primary'] || shootKey === this.controls['shoot-secondary']) {
                this.shootRequested = true;
                e.preventDefault();
            }
        };

        const handleKeyUp = (e) => {
            this._setKeyState(e, false);
        };

        window.addEventListener('keydown', handleKeyDown, true);
        window.addEventListener('keyup', handleKeyUp, true);

        // Mouse position
        this.canvas.addEventListener('mousemove', (e) => {
            let rect = this.canvas.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left;
            this.mouseY = e.clientY - rect.top;
        });

        // Mouse click
        this.canvas.addEventListener('mousedown', (e) => {
            const mouseButton = this.getMouseButtonName(e.button);
            
            if (mouseButton === this.controls['shoot-primary'] || mouseButton === this.controls['shoot-secondary']) {
                // Shoot action
                this.mouseDown = true;
                this.mouseJustPressed = true;
            } else if (mouseButton === this.controls['dash-primary'] || mouseButton === this.controls['dash-secondary']) {
                // Dash action
                this.dashRequested = true;
                e.preventDefault();
            }
        });

        this.canvas.addEventListener('mouseup', (e) => {
            this.mouseDown = false;
        });

        // Prevent context menu on right click
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        // Guard against shoot/move inputs getting stuck when releasing off-canvas or losing focus.
        document.addEventListener('mouseup', () => {
            this.mouseDown = false;
        });

        window.addEventListener('blur', () => {
            this.clearKeys();
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') {
                this.clearKeys();
            }
        });
        document.addEventListener('mouseleave', () => {
            this.clearKeys();
        });

        document.addEventListener('contextmenu', () => {
            this.mouseDown = false;
            this.shootRequested = false;
        }, true);
    }

    update() {
        // Reset one-frame flags
        this.mouseJustPressed = false;
    }

    consumeDash() {
        let requested = this.dashRequested;
        this.dashRequested = false;
        return requested;
    }

    peekDashRequest() {
        return this.dashRequested;
    }

    clearDashRequest() {
        this.dashRequested = false;
    }

    consumeShoot() {
        let requested = this.shootRequested;
        this.shootRequested = false;
        return requested;
    }

    isShootRequested() {
        return this.shootRequested;
    }

    peekShootRequest() {
        return this.shootRequested;
    }

    clearShootRequest() {
        this.shootRequested = false;
    }

    getMovementKeys() {
        return this.keys;
    }

    getMousePosition() {
        return { x: this.mouseX, y: this.mouseY };
    }

    isShootPressed() {
        return this.mouseDown;
    }

    isShootJustPressed() {
        return this.mouseJustPressed;
    }

    clearKeys() {
        const keyList = Object.keys(this.keys);
        for (let i = 0; i < keyList.length; i++) {
            const key = keyList[i];
            this.keys[key] = false;
        }
        this.mouseDown = false;
        this.mouseJustPressed = false;
        this.dashRequested = false;
        this.shootRequested = false;
    }
}

// Export to window
if (typeof window !== 'undefined') {
    window.InputManager = InputManager;
}
