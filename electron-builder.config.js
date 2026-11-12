'use strict';
// Ohne Release-Konfiguration entsteht ein testbarer Installer, aber KEIN Auto-Update-Feed.
// Für die produktiven Updates beide Variablen vor dem BUILD setzen.
const owner = (process.env.LA_FAMILIA_UPDATES_OWNER || '').trim();
const repo = (process.env.LA_FAMILIA_UPDATES_REPO || '').trim();
if (Boolean(owner) !== Boolean(repo)) {
  throw new Error('LA_FAMILIA_UPDATES_OWNER und LA_FAMILIA_UPDATES_REPO müssen gemeinsam gesetzt sein.');
}
const safeName = /^[A-Za-z0-9_.-]+$/;
if (owner && (!safeName.test(owner) || !safeName.test(repo))) {
  throw new Error('Ungültige GitHub Owner/Repo-Kennung für den Updatekanal.');
}
const publish = owner && repo ? [{ provider: 'github', owner, repo, releaseType: 'release' }] : null;
module.exports = {
  appId: 'de.lafamilia.minecraftlauncher',
  productName: 'La Familia Launcher',
  asar: true,
  directories: { output: 'dist', buildResources: 'build' },
  files: [
    'main.js', 'preload.js', 'renderer.js', 'updater.js', 'server-status.js', 'server-ui.js', 'server-status.css', 'config/**/*',
    'index.html', 'style.css', 'server-panel.css', 'server-panel.js', 'server-metrics.js', 'news-feed.js', 'news-ui.js', 'news-ui.css', 'modpack-core.js', 'modpack-net.js', 'modpack-zip.js', 'modpack-manager.js', 'modpack-ui.js', 'modpack-ui.css', 'minecraft-launch.js', 'fabric-auto-install.js', 'game-start.js', 'package.json', 'assets/**/*'
  ],
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'build/LaFamilia.ico',
    requestedExecutionLevel: 'asInvoker'
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'La Familia',
    uninstallDisplayName: 'La Familia Launcher',
    artifactName: 'LaFamilia-Setup-${version}.${ext}'
  },
  publish
};
