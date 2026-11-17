# La Familia Server Metrics + Spielerstatistiken + Erfolge 1.2.0

Fabric **Minecraft 1.21.1**, Java 21; läuft ausschließlich auf dem Server. Spieler brauchen keine zusätzliche Clientmod.

Die bisherige Servermod **1.1.0 wird ersetzt**, nicht parallel installiert. Die bestehende TPS-/Laufzeit-Schnittstelle, privaten Tokens und Spielerstatistiken bleiben erhalten.

## Installation (Hetzner Windows)

1. In **GitHub → Actions → La Familia Fabric 1.21.1 Server Metrics** den neuesten erfolgreich abgeschlossenen Workflow auf `main` öffnen und das Artefakt `LaFamilia-ServerMetrics-Advancements-Fabric-1.21.1` herunterladen.
2. Auf dem Windows-Server bei ausgeschaltetem Minecraft **lafamilia-servermetrics-1.1.0.jar entfernen**, `lafamilia-servermetrics-1.2.0.jar` in den `mods`-Ordner kopieren. Sonst nichts am Modpack ändern. Fabric API muss vorhanden sein.
3. Minecraft-Server neu starten. Keine Änderungen an Caddy nötig: die neue Route `/player/<UUID>/advancements` passt in die vorhandene Caddy-Regel `/player/*`.
4. HTTPS-Zugriff testen: `https://23.88.65.87/status` sollte wie bisher echte TPS und Laufzeit zurückgeben.

## Spieler anmelden und Erfolge abrufen

- Spiel starten und mit dem richtigen Minecraft-Java-Profil verbinden.
- Im Minecraft-Chat **`/lfstats link`** eingeben. Der Befehl erstellt einen **einmaligen privaten 43-stelligen Token**, nicht öffentlich weitergeben.
- Im La Familia Launcher **Profil → Statistiken** aufrufen. Die URL `https://23.88.65.87/status` wird automatisch vorgeschlagen. Den Token einfügen und **Verbinden** klicken.
- Unter **Profil → Erfolge** stehen nun die *tatsächlich abgeschlossenen Minecraft-Fortschritte* inkl. Zahl und den letzten bis zu 40 Einträgen. Bei online Spielern werden die laufenden Fortschritte aus dem Minecraft-AdvancementTracker gelesen; bei offline Spielern aus `world/advancements/<UUID>.json`. Nur erreichte, im Spiel angezeigte Fortschritte zählen; Rezeptfreischaltungen werden nicht als Erfolge ausgegeben.
- Zum Entfernen des Tokens: **`/lfstats unlink`** im Spiel. Diese Aktion widerruft den Token auf dem Server.

Die API antwortet auf `GET /player/<UUID>/advancements` mit dem gleichen Bearer-Token wie `GET /player/<UUID>`. Es werden **keine** Erfolge anderer Spieler veröffentlicht. Es gibt keine öffentliche CORS-Freigabe.

## Bewusste Einschränkungen

**FTB-Piratenquests** sind noch nicht über die FTB-Quests-API angebunden. Der Launcher zeigt sie ausdrücklich als *noch nicht angebunden* an, statt erfundene Questerfolge darzustellen. Die tatsächlichen FTB-Team-/Questfortschritte benötigen anschließend eine separate FTB-Quests-Integration.

Für die Anzeige der Minecraft-Fortschritte werden derzeit keine zusätzlichen Texturen/Icons aus dem Spiel exportiert. Im Profil werden die tatsächlichen Fortschrittsnamen (falls vom Server übersetzbar) bzw. lesbare Kennungen verwendet. Die Grafiken des Launchers bleiben unverändert.

## Serverkonfiguration

`config/lafamilia-servermetrics.properties`:
```properties
bind=127.0.0.1
port=25566
stats.enabled=true
```

Vorhandene `config/lafamilia-player-links.properties` beibehalten: Die bereits verknüpften Schlüssel sind mit 1.2.0 kompatibel. Beim Upgrade werden diese Dateien **nicht gelöscht**.

HTTP-Schnittstelle ausschließlich über Caddy/TLS nach außen freigeben. Keine Portfreigabe für 25566 notwendig.

## Build

GitHub Actions baut diese Mod mit Java 21 / Gradle 8.10.2 / Fabric Loom 1.8.13 und die Windows-Setup-Releases separat. Den Build des Serveraddons vor dem Einsatz auf dem echten Server prüfen.
