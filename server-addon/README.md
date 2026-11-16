# La Familia Server Metrics + Player Stats 1.1.0 – Fabric 1.21.1

Diese Mod erweitert die bestehende Server-Metrics-Mod, **kein zweites Modpaket**. Sie läuft nur auf dem Fabric-Server mit Minecraft 1.21.1 und Java 21. **Client-Spieler benötigen keine neue Mod.**

## Installation

1. In GitHub unter **Actions → La Familia Fabric 1.21.1 Server Metrics** den neuesten erfolgreichen Build öffnen und das Artefakt **LaFamilia-ServerMetrics-PlayerStats-Fabric-1.21.1** herunterladen.
2. Die darin enthaltene **lafamilia-servermetrics-1.1.0.jar** in den `mods`-Ordner des Fabric-1.21.1-Servers legen. Alte `lafamilia-servermetrics-1.0.0.jar` zuvor entfernen, damit die Mod nicht doppelt installiert ist. Fabric API wird benötigt.
3. Server starten. Konfigurationsdatei `config/lafamilia-servermetrics.properties`:
   ```properties
   bind=127.0.0.1
   port=25566
   stats.enabled=true
   ```
   Bestehende Configs funktionieren weiterhin; **stats.enabled** ist standardmäßig `true`, sofern nicht deaktiviert.
4. `GET /status` bietet wie bisher nur TPS und Uptime, ohne Login. `GET /player/<UUID>` verlangt einen **persönlichen, vom Spieler selbst erzeugten Bearer-Schlüssel**.

## Spieler verbinden

Jeder Spieler führt im Minecraft-Chat die Befehle aus:

- `/lfstats link` – erzeugt einen neuen privaten Statistik-Schlüssel, nur für den eigenen UUID-Account. Frühere Schlüssel werden ungültig.
- `/lfstats unlink` – widerruft die Freigabe auf dem Server.

Der Spieler öffnet anschließend **La Familia Launcher → Profil → Statistiken** und trägt dort die sichere HTTPS-Statusadresse (mit `/status`) und seinen persönlichen Schlüssel ein. Die Adresse dient beiden Endpunkten `/status` und `/player/<UUID>`; kein neues Portpaar nötig. Nach dem Verbinden gibt es **Spielzeit, Mob-Kills, Spieler-Kills, Tode, abgebaute Blöcke** und – solange online – das echte Minecraft-XP-Level.

Die Mod liest Online-Daten direkt vom Minecraft-Server. Offline-Daten stammen aus der gespeicherten Vanilla-Statistikdatei unter `world/stats/<UUID>.json`. Für Spieler ohne bisherige Statistikdatei wird ein erklärender Fehler ausgegeben. Offline-XP-Level ist ohne separate NBT-Auswertung nicht verfügbar und bleibt `—`. **Platzierte Blöcke** werden nicht als vermeintliche Vanilla-Statistik erfunden, ebenso bleiben **Piratenrang, FTB-Quests und Erfolge** bis zu einer separaten Integration leer.

## Sicherheit – zwingend beachten

- Standardmäßig bindet der HTTP-Dienst nur an `127.0.0.1`. Für externe Launcher eine **TLS-gesicherte HTTPS-Reverse-Proxy-Adresse** bereitstellen. Erst dann den lokalen Dienst dort anbinden, wo ihn der Proxy erreichen kann.
- Die Anwendung akzeptiert aus Sicherheitsgründen **nur HTTPS-Adressen**; einfaches HTTP ist ausschließlich zu `localhost` / `127.0.0.1` / `::1` erlaubt. **Keinen Spieler-Schlüssel über öffentliche HTTP-Ports schicken.**
- Wer `bind=0.0.0.0` setzt, öffnet den Dienst unter Umständen öffentlich. Nur in Kombination mit restriktiver Firewall und HTTPS-Proxy benutzen.
- Die Spielerschlüssel haben 256 zufällige Bits. Auf dem Server werden **nur deren SHA-256-Hashes** in `config/lafamilia-player-links.properties` gespeichert. Im Launcher wird der individuelle Schlüssel nur lokal in der Benutzer-AppData gespeichert und nicht über die UI zurückgegeben.
- Spieler sollten ihren Schlüssel nicht in Screenshots, Chats oder Ticket-Systemen veröffentlichen. `/lfstats unlink` widerruft sofort, `/lfstats link` ersetzt.
- Der Server liefert keine IPs, andere Spielerprofile, Kontologins oder RCON-Daten; keine CORS-Freigabe.
- Für die korrekte UUID-Zuordnung muss der Fabric-Server im normalen Online-Modus oder hinter einem sicher eingerichteten Authentifizierungs-Proxy laufen. Auf einem `online-mode=false`-Server können UUIDs von den echten Mojang-UUIDs abweichen.

## Build

Das GitHub-Workflow-Artefakt wird mit **Java 21, Gradle 8.10.2 und Fabric Loom 1.8.13** gebaut. Der vorherige `/status`-Endpunkt bleibt kompatibel.

Tests im separaten Launcher-Testworkflow prüfen die UUID-Bindung, HTTPS-Sicherheit, Validierung und das Zurückhalten privater Schlüssel.
