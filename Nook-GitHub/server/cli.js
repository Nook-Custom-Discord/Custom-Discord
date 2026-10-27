#!/usr/bin/env node
// Standalone-Start des Servers, z. B. auf einem VPS/Raspberry Pi:  node server/cli.js
// Umgebungsvariablen: PORT (Standard 3500), NOOK_DATA (Datenordner), NOOK_REGISTER_CODE (optionaler Code für Registrierung),
// TURN_URL / TURN_USER / TURN_PASS (optionaler TURN-Server für schwierige Netzwerke)
const path = require('path');
const { startServer } = require('./index');

const port = Number(process.env.PORT) || 3500;
const dataDir = process.env.NOOK_DATA || path.join(__dirname, '..', 'nook-data');

startServer({ port, dataDir }).catch((e) => {
  console.error('Server konnte nicht starten:', e.message);
  process.exit(1);
});
