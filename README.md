# ⚔ La Familia Minecraft Launcher

Windows-Launcher (Electron / HTML / CSS / JavaScript) für das La-Familia-Minecraft-Projekt.

**Status:** Repository angelegt. Der vollständige Launcher-Quellcode und die Bilddateien aus V1.3.0 werden im nächsten Upload eingespielt. Dies ist noch kein veröffentlichter Installer.

## Geplante Funktionen
- Mittelalter-Fantasy-Launcheroberfläche mit Desktop-Icon
- NSIS-Windows-Installer per `electron-builder`
- Updateprüfung über `electron-updater` beim Programmstart
- Separater Fabric-1.21.1-Modmanager, Minecraft-Profil und Serverstatus in folgenden Schritten

## Projekt hochladen
Nutze das **LaFamilia-GitHub-Upload**-Hilfsskript aus dem vollständigen V1.3.0-Projektpaket, das in ChatGPT bereitgestellt wird. Das Skript kopiert Quellcode, Grafiken, Workflows und Installer-Konfiguration hierher und erstellt einen Commit auf `main`. Es überschreibt keine Git-Historie und führt keinen Force-Push aus.

## Build (nach vollständigem Upload)
**Actions → La Familia Windows Setup → Run workflow** baut unter Windows den Setup-Installer. Ein erfolgreicher Test-Build erscheint als herunterladbares Artifact. Öffentliche Release-Updates erfordern später einen passenden Versionstag und Release-Dateien.

_Quellcode-Repository ist öffentlich; keine persönlichen Tokens oder Zugangsdaten hochladen._
