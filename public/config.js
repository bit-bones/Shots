// Deployment config for WebSocket server
// This value is read by core/NetworkManager.js on startup.
// The build system should replace {{SERVER_URL}} with the platform value.
// If it is unreplaced, try to infer a sensible default for Render hosts,
// otherwise leave empty so the client can fall back to same-origin or query param.
(function () {
	var injected = '{{SERVER_URL}}';
	try {
		if (typeof injected === 'string' && injected.indexOf('{{') === -1 && injected.trim()) {
			window.SERVER_URL = injected.trim();
			return;
		}
	} catch (e) {
		// proceed to fallback
	}

	// If running on your Render static hostname, default to the known ws host.
	// Update these names if your Render service names change.
	try {
		var host = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname : '';
		if (host === 'shots-1.onrender.com') {
			window.SERVER_URL = 'wss://shots-4d19.onrender.com';
			return;
		}
		// For local development, assume server is on localhost:3001
		if (host === '127.0.0.1' || host === 'localhost') {
			window.SERVER_URL = 'ws://localhost:3001';
			return;
		}
	} catch (e) {}

	// Leave blank for NetworkManager to try query param, same-origin or localhost.
	window.SERVER_URL = '';
})();
