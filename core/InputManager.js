/**
 * InputManager - Handles keyboard and mouse input
 */
class InputManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.keys = {};
        this.mouseX = 0;
        this.mouseY = 0;
        this.mouseDown = false;
        this.mouseJustPressed = false;
        this.dashRequested = false;
        this.shootRequested = false;
        
        this.setupListeners();
    }

    setupListeners() {
        // Keyboard
        document.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
            
            // Dash on Shift
            if (e.key === 'Shift') {
                this.dashRequested = true;
                e.preventDefault();
            }
            
            // Shoot on Space
            if (e.key === ' ') {
                this.shootRequested = true;
                e.preventDefault();
            }
        });

        document.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
        });

        // Mouse position
        this.canvas.addEventListener('mousemove', (e) => {
            let rect = this.canvas.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left;
            this.mouseY = e.clientY - rect.top;
        });

        // Mouse click
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                // Left click: shoot
                this.mouseDown = true;
                this.mouseJustPressed = true;
            } else if (e.button === 2) {
                // Right click: dash
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
        this.keys = {};
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
