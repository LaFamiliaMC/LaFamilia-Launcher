# La Familia Launcher 1.3.8 – Start über den offiziellen Minecraft Launcher

Der Spielen-Button kontrolliert zuerst den vollständigen Modpack-Status, prüft die installierte Fabric-Version und richtet das Spielprofil `La Familia – Piraten Update` ein.

**Wichtig:** Die offizielle Minecraft-Software übernimmt weiter die Microsoft-Anmeldung, die Lizenzprüfung und den tatsächlichen Spielstart. Der La-Familia-Launcher öffnet diese Anwendung, kann aber die Schaltfläche „Spielen“ darin nicht automatisch betätigen.

## Voraussetzung

1. Den offiziellen Minecraft Launcher einmal öffnen und wieder schließen; Java Edition muss mit dem eigenen lizenzierten Microsoft-Konto nutzbar sein.
2. Fabric Loader 0.19.5 für Minecraft 1.21.1 wird bei Bedarf durch La Familia automatisch mit dem offiziell verifizierten JAR-Installer installiert. Kein manuelles Auswählen der Version nötig.
3. Minecraft Launcher vollständig schließen, bevor „Fabric-Profil einrichten“ in La Familia gewählt wird.
4. La Familia Launcher starten, Modpack 1.0.0 prüfen und vollständig installieren.
5. „Spielen“ anklicken. Die Installation „La Familia – Piraten Update“ wird bei Bedarf erstellt/aktualisiert und als zuletzt verwendetes La-Familia-Profil markiert. Danach im offiziellen Minecraft Launcher dieses Profil wählen und dort „Spielen“ klicken. Wenn der offizielle Launcher Installationen nach „zuletzt gespielt“ sortiert, erscheint La Familia dadurch weiter oben.

Die Profileinstellung verwendet `%APPDATA%\.minecraft\la-familia` als Spielordner. Das persönliche Microsoft-Konto und andere Installationen werden nicht verändert. Vor jeder Änderung am offiziellen `launcher_profiles*.json` wird eine Backup-Datei am gleichen Ort gespeichert.

Die RAM-Einstellung wird in die JVM-Argumente dieses La-Familia-Profils geschrieben. Java 21 wird vom offiziellen Minecraft Launcher bereitgestellt.

## Tests

GitHub Actions führt `npm run check` und `npm test` aus und baut die Windows-Test-EXE. Der Installer wird nur als Actions-Artifact bereitgestellt, solange kein offizielles Release bestätigt wurde.

## Einschränkung

Bei älteren oder abweichenden Installationspfaden muss der Spieler die Minecraft-Installation oder den Profilpfad gegebenenfalls im offiziellen Launcher manuell konfigurieren. Die automatische Launcher-Erkennung muss auf Windows getestet werden.

**Auswahlgrenze:** Der offizielle Launcher bietet keinen zuverlässig unterstützten Parameter zum Erzwingen des ausgewählten Installationsprofils. La Familia ändert deshalb nicht das ausgewählte Microsoft-Konto oder die allgemeine Profil-Sortiereinstellung. Ein Klick auf „Spielen“ im offiziellen Launcher bleibt erforderlich. Der Zeitstempel des La-Familia-Profils wird höchstens alle 10 Minuten aktualisiert.
