# La Familia Launcher V1.3.5 – Automatische Modpackverwaltung

## Was die Version macht

Beim Start des Launchers wird das neueste öffentliche Modpack-Release über GitHub gelesen und mit dem lokalen Spielordner verglichen. Es werden **keine Mods ohne Klick auf 'Modpack installieren / aktualisieren' heruntergeladen oder verändert**.

Quelle: https://github.com/LaFamiliaMC/LaFamilia-Modpack/releases/latest
Ziel: `%APPDATA%\.minecraft\la-familia\` mit `mods`, `resourcepacks` und `config`.

Die Modpack-Dateien müssen dem **Schema 2** des Uploader V2.4 entsprechen. Release-Assets früherer Versionen dürfen nicht gelöscht werden, falls das Manifest deren unveränderte Dateien referenziert.

## Sicherheits- und Aktualisierungsregeln

- Nur Downloads aus LaFamilia-Modpack Releases und sichere GitHub-CDN-Weiterleitungen.
- SHA-256 und Dateigröße werden für jeden Download geprüft, auch für beide ZIP-Archive.
- Alle ZIP-Dateien werden nur in ein temporäres Verzeichnis entpackt und jede einzelne Datei erneut anhand des Manifests geprüft.
- Unsichere ZIP-Pfade, doppelte Pfade und Symlinks werden verworfen.
- Auf `mods`, `resourcepacks` und `config` beschränkt; Welten, Spielerprofile und Screenshots bleiben unberührt.
- Vorhandene, nicht verwaltete Mods/Configs/Resourcepacks werden nicht überschrieben.
- Zuvor installierte Dateien werden nur ersetzt oder entfernt, wenn sie seit der letzten Installation unverändert sind.
- Für geänderte Configs erscheint eine Konfliktliste. Sie werden nicht überschrieben.
- Vor Änderungen werden Backups und ein Wiederherstellungsjournal angelegt. Bei einer Unterbrechung versucht der nächste Start den alten Zustand wiederherzustellen.
- Downloads finden erst nach Bestätigung durch den Spieler statt. Netzwerkunterbrechungen vor Installation verändern keine Spiel-Dateien.

## Testen

1. Den Windows-Workflow auf GitHub ausführen. Nur das erfolgreiche Testergebnis reicht nicht als vollständiger End-to-End-Nachweis.
2. Installer aus dem GitHub-Actions-Artifact in einer separaten Windows-Testumgebung installieren.
3. Im Launcher Mods öffnen, GitHub-Prüfung abwarten, auf **Modpack installieren / aktualisieren** klicken.
4. Den Download für 301 Mods + Resourcepacks + Configs vollständig durchlaufen lassen.
5. Danach lokalen Modordner, Configs und Resourcepacks prüfen; anschließend den Launcher erneut öffnen und den Updatevergleich kontrollieren.
6. Eine Config-Datei manuell bearbeiten und erneut aktualisieren: die eigene Änderung muss erhalten bleiben.

## Bekannte Abgrenzung

Die Modpackverwaltung lädt die Inhalte. Die eigenständige Einrichtung/Startintegration des Fabric-1.21.1-Profils im offiziellen Minecraft Launcher ist ein weiterer Schritt.
