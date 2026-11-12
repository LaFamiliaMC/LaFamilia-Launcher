## Direktupload in dein eingerichtetes GitHub-Repository

Das Repository **LaFamiliaMC/LaFamilia-Launcher** wurde bereits in GitHub initialisiert.
Für den vollständigen Projekt-Upload unter Windows:

1. Das ZIP vollständig entpacken (nicht im ZIP doppelklicken).
2. Falls erforderlich: [Git for Windows](https://git-scm.com/downloads/win) installieren. Nur Git, kein Personal Access Token nötig.
3. `LaFamilia-GitHub-Hochladen.bat` doppelklicken. Falls eine GitHub-Anmeldung erscheint, **LaFamiliaMC** auswählen.
4. Das Skript klont nur das genannte Repository in einen temporären Ordner, fügt Quellcode, Grafiken und die GitHub-Actions-Datei hinzu, committet und pusht auf `main` – **ohne Force-Push**.
5. Bei Erfolg auf GitHub **Actions → La Familia Windows Setup** öffnen. Der Push sollte den Windows-Build auslösen. Nach dem erfolgreichen Build das Artefakt herunterladen.

Hinweis: Bei 2FA oder Git-Anmeldefehlern die Anmeldung im Browser abschließen. Das Skript speichert keine Zugangstokens und überschreibt keinen anderen GitHub-Account.

---

# La Familia Launcher V1.3.0 – Windows-Installer & Auto-Updater

**Design-Basis:** bestätigte V1.2.6 (Burg, Ritter, Goldrahmen, Menü-/Fenster-Hover). Dieses Paket verändert die Optik nicht grundlegend.

## Was ist in dieser Version enthalten?

- `build/LaFamilia.ico`: eigenes Windows-App- und Desktop-Icon.
- `electron-builder.config.js`: NSIS-Setup pro Benutzer (Installationsordner wählbar, Desktop-Verknüpfung, Startmenü, Deinstallation).
- `updater.js`: Updateprüfung beim Appstart; Downloadfortschritt und Fehlermeldungen in der bestehenden Update-Karte; installiert nach Klick auf „Update jetzt installieren“ und beim normalen Beenden, sofern ein Update bereits heruntergeladen wurde.
- `renderer.js`, `main.js`, `preload.js`: sichere Anbindung der Update-Ereignisse und einer manuellen Prüfung in den Einstellungen.
- `.github/workflows/windows-installer.yml`: Windows-Build über GitHub Actions mit Release-Veröffentlichung auf einem später konfigurierbaren GitHub-Repository.

**Noch NICHT:** Minecraft-Spielstart, Mod-Downloads, Online-Serverstatus, tatsächliche Update-Veröffentlichung. Es gibt hier noch keine fertige Windows-EXE. Die EXE wird über den Windows-Build erstellt.

## 1. Auf einem Windows-PC ausprobieren

1. Aktuelles Node.js installieren (empfohlen: LTS), ZIP in einen neuen Ordner entpacken.
2. `LaFamilia-Test-starten.bat` öffnen. Dies startet die Entwicklungsvariante ohne automatische Online-Updateprüfung.
3. Für eine **installierbare EXE** `LaFamilia-Installer-bauen.bat` starten.
4. Danach liegt `dist/LaFamilia-Setup-1.3.0.exe` vor. Installation über Doppelklick; Desktop-Verknüpfung heißt „La Familia“.
5. Ohne konfigurierten Updatekanal zeigt die installierte App **„Kein GitHub-Releasekanal konfiguriert“**. Das ist beabsichtigt und kein Fehler.

Windows kann bei ungesignierten Test-EXEs eine SmartScreen-Warnung anzeigen. Vor öffentlicher Verteilung ist eine Code-Signatur sehr empfehlenswert.

## 2. GitHub – zuerst die einfache Variante

Der **einfachste Weg** ist **ein einziges öffentliches Repository** auf deinem Launcher-GitHub-Konto:

- `LaFamiliaMC/LaFamilia-Launcher` – Quellcode + GitHub Actions + fertige Setup-Dateien unter GitHub Releases.

Das Repository muss einmal in GitHub angelegt werden. Dieses ZIP erstellt keine Repositories. Die Workflow-Datei verwendet dann automatisch den eigenen Repo-Namen und GitHubs eingebauten `GITHUB_TOKEN`; es ist **kein persönlicher Token erforderlich**.

**Alternative (privater Quellcode):** Das Quell-Repository bleibt privat; erstelle zusätzlich ein öffentliches `LaFamiliaMC/LaFamilia-Launcher-Updates`. In der Quelle unter `Settings > Secrets and variables > Actions > Variables` beide Werte konfigurieren:

- `LA_FAMILIA_UPDATES_OWNER` = `LaFamiliaMC`
- `LA_FAMILIA_UPDATES_REPO` = `LaFamilia-Launcher-Updates`

Für die Veröffentlichung ins separate Repository kommt als **Repository-Secret** `LA_FAMILIA_RELEASES_TOKEN` hinzu: ein Fine-grained PAT nur für dieses Updates-Repo mit `Contents: Read and write`. **Token niemals in Dateien, den Client oder Screenshots einbauen.**

## 3. Den Build starten

1. Das komplette Projekt einschließlich `.github/workflows/windows-installer.yml` in das Quellcode-Repository auf den Branch `main` hochladen.
2. GitHub > Actions > **La Familia Windows Setup** > `Run workflow` ausführen. Dies ist ein **Test-Build**, kein öffentliches Update.
3. Nach erfolgreichem Build: **Artifacts** > `LaFamilia-Windows-Setup-...` herunterladen und ZIP entpacken. Enthalten ist `LaFamilia-Setup-1.3.0.exe`.
4. Für eine echte Release-Version `package.json` bei jeder Veröffentlichung auf die neue Version erhöhen und anschließend z. B. den Tag **`v1.3.0`** auf den dazugehörigen Commit setzen. Ein Tag-Build lädt `LaFamilia-Setup-1.3.0.exe`, `latest.yml` und ggf. `.blockmap` in die GitHub Releases des konfigurierten (standardmäßig selben) öffentlichen Repositories hoch.
5. **`latest.yml` und Setup müssen aus demselben Build stammen.** Dateien nicht umbenennen oder manuell verschiedene Versionen mischen.

Die Auto-Update-Funktion wird **nur in einem installierten Windows-Build** mit korrekt konfiguriertem `app-update.yml` aktiviert. Bei jedem normalen Programmstart wird geprüft. Wird ein Update gefunden, lädt der Launcher es herunter. Nutzer können es sofort über den eingeblendeten Button installieren oder den Launcher regulär schließen.

## 4. Lokaler Installer mit GitHub-Updatekanal

Für lokale Builds mit echtem Auto-Update vor `LaFamilia-Installer-bauen.bat` in der gleichen **CMD-Sitzung** den Repo-Namen setzen (bei einem einzigen Repo die gleichen Werte wie das Quell-Repo):

```bat
set LA_FAMILIA_UPDATES_OWNER=LaFamiliaMC
set LA_FAMILIA_UPDATES_REPO=LaFamilia-Launcher-Updates
LaFamilia-Installer-bauen.bat
```

Das Update-Repository muss vor dem Test existieren, öffentlich sein und einen passenden veröffentlichten Release enthalten, sonst wird die Updateabfrage einen nachvollziehbaren Fehler melden. Ein Installations-Update kann erst sinnvoll zwischen **zwei tatsächlich veröffentlichten Versionen** getestet werden.

## 5. Sicherheit / Datenerhaltung

- Launcher-Updates ersetzen die installierten Electron-Anwendungsdateien, **nicht** `%APPDATA%\.minecraft\la-familia` oder Minecraft-Welten/Spielstände.
- Der RAM-Wert wird wie bisher separat unter Electron `userData` gespeichert.
- Das alte Minecraft-Profil `launcher_profiles.json` bleibt bei dieser Erweiterung unverändert.
- Vor einer öffentlichen Version bitte Installer signieren und das Release-Repository absichern; `latest.yml` enthält Prüfsummen, ist aber ohne zusätzliche Signierung nicht selbst kryptografisch authentifiziert.
- Nie einen GitHub-Zugriffstoken im Client speichern oder an Spieler verteilen.

## 6. Tests

`npm run check` – Syntaxprüfung

`npm test` – 5 Unit-Tests für deaktivierte Tests, fehlenden Feed, aktuelle Version, Update-Download und Netzwerkfehler.

### Hinweise zur Entwicklungsumgebung

Die NPM-Registry war in der Umgebung, in der dieses ZIP erstellt wurde, nicht erreichbar. Daher konnte hier kein `npm install` und kein echter Windows-Installer-Build ausgeführt werden. GitHub Actions und das Windows-Batch-Skript installieren die Pakete auf einem Windows-Rechner mit Internetzugang. Die JavaScript-Syntax und die mitgelieferten Unit-Tests wurden geprüft.
