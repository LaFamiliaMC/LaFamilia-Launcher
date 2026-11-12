# La Familia Server Metrics – Fabric 1.21.1

Serverseitige Fabric-Mod, die **TPS und Serverlaufzeit** als JSON für den Launcher bereitstellt. Keine Client-Mod nötig.

1. Unter **Actions → La Familia Fabric 1.21.1 Server Metrics** den Build starten.
2. Die JAR aus dem erfolgreichen GitHub-Artifact in den Fabric-Serverordner \`mods/\` legen. Fabric API ist erforderlich.
3. Server starten. Es wird \`config/lafamilia-servermetrics.properties\` angelegt.
4. Standard ist \`bind=127.0.0.1\` (nur lokal). Um den Launcher von anderen PCs zu bedienen, ausdrücklich \`bind=0.0.0.0\` einstellen, Server neu starten und **TCP-Port 25566** beim Hoster freigeben. Für öffentliche Server ist ein HTTPS-Reverse-Proxy die bessere Lösung.
5. Im Launcher unter Serverstatus den Metrik-Endpunkt \`http://23.88.65.87:25566/status\` eintragen, falls abweichend.

Die Schnittstelle ist **nur lesbar**. Sie veröffentlicht **keine Spielernamen, UUIDs, Chatdaten, IPs oder RCON-Credentials**. Sie bietet keine Authentifizierung; Freigabe bewusst entscheiden. Wenn der Port gesperrt bleibt, zeigt der Launcher für TPS/Laufzeit \`—\` an, während Spielerzahl, Minecraft-Version und Ping weiter funktionieren.

Die TPS wird aus den Server-Tick-Abständen über ein 5-Sekunden-Fenster geschätzt. Laufzeit zählt ab Start des Minecraft-Servers, nicht des Windows-Computers.
