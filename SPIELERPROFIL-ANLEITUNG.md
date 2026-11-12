# La Familia – echtes Minecraft-Spielerprofil

Im bestehenden Piraten-Launcher wird mit einem Klick auf **Profil** die bereits vorhandene mittlere Inhaltsfläche benutzt. Hintergrund, Seitenleisten und Navigationsbuttons sind unverändert.

## Bereits enthalten
- Automatische Erkennung des **aktiven Minecraft-Java-Profils** aus den lokalen Daten des offiziellen Minecraft Launchers.
- Auslesen von Name und UUID, ohne Zugriffstokens an die Oberfläche zu geben oder diese zu verändern.
- Öffentlicher Skinabruf direkt von Mojangs Sessionserver, mit Prüfung, dass die Skin-UUID zum aktiven Spieler gehört.
- Lokaler 3D-Skinviewer `skinview3d` für einen drehbaren Minecraft-Charakter (Maus oder automatische langsame Rotation). Der Charakter steht optisch auf einem Sockel im vorhandenen Profilbereich.
- Unterstützung für klassische und schmale Arme; zusätzliche Skin-Layer werden vom Viewer berücksichtigt.
- Ein originales Minecraft-Cape wird ausschließlich geladen, wenn Mojangs Profil ein `CAPE` ausweist. Ohne echtes Cape wird keines eingeblendet.
- Klickbare Reiter **Übersicht**, **Statistiken** und **Erfolge**. Statistiken und Erfolge zeigen ausdrücklich den fehlenden Serveranschluss an; es werden **keine erfundenen Zahlen** angezeigt.
- Rechtes Profilwidget erhält den echten Spielernamen; Rang, Level, XP und Statistik bleiben bis zur Serveranbindung unbekannt.
- Aktualisieren-Button für Konto-/Skinwechsel; Hautbilder werden im Hauptprozess geprüft und dem Renderer als sichere PNG-Daten übergeben. Kein Browserzugriff auf Microsoft-Tokens.
- In-Memory-Cache (15 Minuten); bei kurzem Mojang-Ausfall wird, falls vorhanden, nur der Skin **derselben Spieler-UUID** verwendet.

## Voraussetzungen
1. Den offiziellen Minecraft Launcher auf Windows starten und mit dem eigenen Microsoft-/Minecraft-Java-Account anmelden.
2. Den La-Familia-Launcher starten und links auf **Profil** klicken.
3. Bei geändertem Skin oder anderem Konto **Profil aktualisieren** wählen.

Fehlt das Konto, wird eine Meldung angezeigt. Ohne Mojang-Skin gibt es bewusst keinen erfundenen Skin und keine generischen Deko-Capes.

## Technische Hinweise
Die öffentliche Minecraft-Skin-Abfrage erfolgt nur über `sessionserver.mojang.com` und `textures.minecraft.net` (HTTPS). Der Renderer lädt keine externen Skripte: Der MIT-lizenzierte 3D-Skinviewer liegt lokal im Installationspaket (`skinview3d@3.4.2`). Die vorhandene Electron-Content-Security-Policy bleibt aktiv.

Für echte Serverwerte benötigen wir später eine passende Minecraft-Server-Anbindung. Die Profil-Reiter sind dafür vorbereitet.

Die GitHub-Actions-Testworkflow auf dem Entwicklungszweig prüft Syntax, Testfälle, und Windows-Verpackung. Nach Freigabe in `main` wird über den bereits eingerichteten Auto-Update-Workflow ein neuer Windows-Launcher gebaut.
