# Shots

## Deploy to Render

### Frontend (Static Site or Web Service)
- Create a Render Static Site (recommended) or simple Web Service from this repo's frontend build output.
- The live URL will follow `https://<your-frontend>.onrender.com`.
- To point the game at a dedicated relay, either include the commented meta tag in `index.html` and set `<meta name="ws-relay" content="wss://<your-relay>.onrender.com">`, or pass a query override like `?ws=wss://<your-relay>.onrender.com`.
- When the relay is deployed at the same origin as the frontend, no override is needed; HTTPS pages will automatically connect to `wss://<frontend-host>.onrender.com` with no explicit port.

### WebSocket Relay (Node Service)
- Create a Render Web Service using this repo (or a copy) with the root directory at the project root.
- Set the start command to `node server.js`; leave the build command empty or use `npm ci` if you need dependencies installed.
- Environment should use a Node runtime. The server listens on `process.env.PORT` automatically, which Render assigns.
- Visiting `https://<your-relay>.onrender.com` should return "Shots multiplayer relay running".

### Example URLs
- Production play: `https://<your-frontend>.onrender.com/?ws=wss://<your-relay>.onrender.com`
- Local development: `http://localhost:8080/?ws=ws://localhost:3001`

## Validation Checklist
- Opening the relay root URL in a browser shows "Shots multiplayer relay running".
- In the frontend console, running `new WebSocket('wss://<your-relay>.onrender.com')` succeeds.
- Production HTTPS without `?ws=` connects to `wss://<frontend-host>.onrender.com` unless a meta tag override is present.
- Local HTTP development without specifying a port defaults to `ws://localhost:3001`.
- Multiplayer host/join flows send and receive relay messages correctly in both local and production environments.