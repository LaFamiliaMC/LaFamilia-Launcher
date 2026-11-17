'use strict';

// Die öffentliche La-Familia-Schnittstelle ist durch Caddy per HTTPS erreichbar.
// Für den offiziellen Spielserver wird sie immer automatisch verwendet,
// auch wenn ältere Launcher-Versionen eine veraltete HTTP-Adresse gespeichert haben.
const { validateMetricsUrl } = require('./server-metrics');

const LA_FAMILIA_SERVER = '23.88.65.87:25565';
const LA_FAMILIA_METRICS = 'https://23.88.65.87/status';

function resolveMetricsUrl(serverAddress, storedUrl) {
  if (serverAddress === LA_FAMILIA_SERVER) {
    return LA_FAMILIA_METRICS;
  }

  // Bei bewusst gewählten anderen Minecraft-Servern keine La-Familia-Daten
  // als deren TPS/Laufzeit ausgeben. Nur explizite Sonderadressen behalten.
  if (typeof storedUrl !== 'string' || !storedUrl.trim()) return '';
  try {
    return validateMetricsUrl(storedUrl);
  } catch {
    return '';
  }
}

module.exports = { LA_FAMILIA_SERVER, LA_FAMILIA_METRICS, resolveMetricsUrl };
