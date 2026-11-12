# La Familia Launcher V1.3.8 – Fabric automatisch installieren

Der **Spielen**-Button prüft, ob exakt **Minecraft 1.21.1 + Fabric Loader 0.19.5** vorhanden ist. Falls nicht, lädt er die offizielle **Fabric Installer 1.1.2 JAR** vom FabricMC-Maven-Server und prüft sie gegen die dort veröffentlichte SHA-256-Prüfsumme.

Der Launcher verwendet nach Möglichkeit die Java-Laufzeit aus der bestehenden Minecraft-Installation (alternativ JAVA_HOME/PATH). Anschließend wird die JAR mit `java -jar <Installer> client -dir <Minecraft-Ordner> -mcversion 1.21.1 -loader 0.19.5 -noprofile` ohne grafischen Installationsassistenten gestartet. Danach wird ausschließlich das La-Familia-Profil eingerichtet; andere Profile oder Loader-Versionen bleiben unangetastet.

**Voraussetzung:** Der offizielle Minecraft Launcher wurde einmal gestartet und wieder geschlossen. Zur Anmeldung und zum tatsächlichen Spielstart bleibt er erforderlich. Fehlt auch die Minecraft-Java-Laufzeit, kann der La-Familia-Launcher auffordern, Minecraft 1.21.1 einmal über den offiziellen Launcher vorzubereiten.

**Tests:** Die Node-Unit-Tests prüfen Versionsbindung, SHA-256, Cache und Java-Pfade. Ein separater GitHub-Actions-Windows-Smoke-Test installiert Fabric per JAR-CLI in einen leeren Testordner und überprüft die entstandene Versions-ID. Ein echter Windows-Spieler-PC-Test ist weiterhin notwendig.

**Veröffentlichung:** Version 1.3.8 ist ein Testbuild; kein automatisches öffentliches Release ohne Freigabe. Das vorhandene Piraten-Design bleibt unverändert.

Offizielle CLI-Dokumentation: https://wiki.fabricmc.net/install
