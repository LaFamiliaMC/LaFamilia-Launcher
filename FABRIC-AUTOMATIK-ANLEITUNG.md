# La Familia Launcher V1.3.7 – Fabric automatisch installieren

Der Spielen-Button prüft, ob der offizielle Fabric Loader für Minecraft 1.21.1 vorhanden ist. Falls nicht, lädt er den offiziellen FabricMC Windows Installer 1.1.2 von https://maven.fabricmc.net/net/fabricmc/fabric-installer/1.1.2/ und überprüft ihn gegen die dort veröffentlichte SHA-256-Prüfsumme.

Danach wird der Installer ohne grafischen Assistenten mit `client -dir <Minecraft-Verzeichnis> -mcversion 1.21.1 -noprofile` gestartet. Das eigene La-Familia-Profil erstellt der Launcher anschließend selbst. Vor Installation muss der offizielle Minecraft Launcher geschlossen sein. Die Microsoft-Anmeldung und den eigentlichen Spielstart übernimmt weiterhin der offizielle Launcher.

Der Installer wird nur nach Klick auf **Spielen** oder **Fabric 1.21.1 automatisch installieren** ausgeführt, sofern Fabric fehlt. Ein bereits vorhandener Fabric Loader bleibt unangetastet. Das bestehende Piraten-Design bleibt unverändert.

**Tests:** GitHub Actions prüft die Modul-Unit-Tests und den Windows-Installer. Ein zusätzlicher Windows-Smoke-Test lädt die offizielle EXE, verifiziert sie und führt den Fabric-CLI-Befehl `help` aus. Ein kompletter Minecraft-Spielstart muss anschließend auf einem Spieler-PC getestet werden.

Offizielle Dokumentation: https://wiki.fabricmc.net/install
