# La Familia – Ein-Klick-Spielstart V1.3.9 (Testbuild)

Beim Klick auf **Spielen** prüft unser Launcher das GitHub-Modpack und aktualisiert fehlende Mods, Resourcepacks und Configs automatisch. Die bestehende Modverwaltung sichert/prüft Dateien und kann bei Installationsfehlern zurückrollen.

Ein **transparenter Fortschrittsbalken direkt unter dem bestehenden Spielen-Button** zeigt Mod-Download, Prüfung, Fabric-Einrichtung und Profilvorbereitung – alles im selben Fenster, keine neue Oberfläche. Das Piraten-Hintergrundbild und die Positionen der Buttons bleiben unverändert.

Bei Downloadfehlern, unvollständig installierten Dateien oder Konflikten mit eigenen Mods/Configs wird der Ablauf aus Sicherheitsgründen gestoppt und auf den Mods-Bereich verwiesen. Bereits vorhandene, unveränderte Mods werden nicht erneut geladen.

Danach richtet der Launcher ausschließlich **Minecraft 1.21.1 + Fabric Loader 0.19.5** und das eigene La-Familia-Profil mit gespeicherter RAM-Einstellung ein und öffnet den offiziellen Minecraft Launcher.

**Grenze:** Microsoft-Anmeldung und der tatsächliche Spielstart erfolgen weiter im offiziellen Minecraft Launcher. Dort muss der Spieler ggf. die Installation **La Familia – Piraten Update** auswählen und anschließend **Spielen** klicken.

Der Windows-Build wird als GitHub Actions **Artifact** erstellt. Nach erfolgreichen Tests wird die Windows-EXE jetzt **automatisch als GitHub-Release-Update veröffentlicht** (Details in `AUTO-UPDATE-TESTBUILDS.md`). Die automatisierten Tests prüfen den Ablauf und Fehlerszenarien; zusätzlich ist der Test auf einem Windows-Spieler-PC erforderlich.
