# La Familia Launcher V1.3.8 – Fester Fabric Loader

Dieses Testupdate verwendet ausschließlich:

- Minecraft Java Edition **1.21.1**
- Fabric Loader **0.19.5** (Versions-ID `fabric-loader-0.19.5-1.21.1`)

Beim Klick auf **Spiel starten** prüft der Launcher diese exakte Kombination. Ist sie noch nicht vorhanden, lädt er den offiziellen Fabric Installer 1.1.2 nach einer SHA-256-Prüfung und führt ihn ohne GUI mit `client -dir <Minecraft-Ordner> -mcversion 1.21.1 -loader 0.19.5 -noprofile` aus. Anschließend kontrolliert der Launcher, ob tatsächlich die gewünschte Version installiert wurde.

Das bestehende La-Familia-Profil erhält genau die Zielversions-ID. Andere Minecraft-/Fabric-Versionen und Profile werden nicht gelöscht, geändert oder auf eine beliebige aktuelle Loader-Version umgestellt. Das Original-Minecraft-Profil wird weiterhin vor Änderungen gesichert.

**Für Spieler:** Keine manuelle Fabric-Versionsauswahl. Der offizielle Minecraft Launcher bleibt für den Microsoft-/Minecraft-Login und den eigentlichen Spielstart zuständig. Wenn er noch nie eingerichtet wurde oder noch geöffnet ist, ist ggf. ein einmaliges Schließen/Anmelden erforderlich.

**Veröffentlichung:** Version 1.3.8 zuerst als privaten Windows-Test-Build prüfen; V1.3.7 bleibt bis zur ausdrücklichen Freigabe das offizielle öffentliche Release.
