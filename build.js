// filepath: build.js
const fs = require('fs');
const path = require('path');

const serverUrl = process.env.SERVER_URL || '';
const configPath = path.join(__dirname, 'public', 'config.js');

let configContent = fs.readFileSync(configPath, 'utf8');
configContent = configContent.replace(/\{\{SERVER_URL\}\}/g, serverUrl);
fs.writeFileSync(configPath, configContent);

console.log(`Injected SERVER_URL: ${serverUrl}`);