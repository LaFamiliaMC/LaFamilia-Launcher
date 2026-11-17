# La Familia – Echte Weltkarte (Minecraft 1.21.1, Fabric, Windows Server)

Der Launcher lädt automatisch `https://23.88.65.87/map/` sobald unter der Adresse eine echte **BlueMap**-Karte erreichbar ist. Es sind keine Adressfelder für Spieler vorgesehen.

**Wichtig:** Eine echte Terrainkarte benötigt Zugriff auf die Weltdateien. Der Launcher kann die Minecraft-Welt nicht selbst rendern. Auf dem Hetzner-Windows-Server wird hierfür einmalig BlueMap installiert. Die neue Kartenansicht zeigt bis dahin korrekt `Noch keine Live-Weltkarte` statt erfundener Gelände-/Spielerdaten. Der Kartenbereich öffnet sich bei Klick auf **Weltkarte** oder den Kartenknopf rechts.

## 1. Geeignete Fabric-Version installieren

Für **Minecraft 1.21.1 / Java 21** verwende **BlueMap 5.6-fabric**:
https://modrinth.com/plugin/bluemap/version/5.6-fabric

Diese Veröffentlichung nennt Fabric und Minecraft 1.21–1.21.4 als kompatibel. **Keine neuere Fabric-Version für 1.21.6+ und keine aktuelle Java-25-Version** unbesehen auf den Fabric-1.21.1-Server setzen.

Nur die Fabric-Datei herunterladen, in den `mods`-Ordner des Minecraft-Servers kopieren, prüfen, ob Fabric API vorhanden ist, und Minecraft neu starten. Die bereits installierte `lafamilia-servermetrics-1.1.0.jar` für TPS und Spielerstatistiken **bleibt installiert**. Ein zweiter Metrics-Mod ist nicht nötig.

## 2. BlueMap konfigurieren

Die Config liegt bei Fabric unter `config/bluemap/`. BlueMap lädt Ressourcen zum Rendern; die Erlaubnis ist vom Serverbetreiber bewusst zu bestätigen.

In `config/bluemap/core.conf` nach Lesen der Datei:
```hocon
accept-download: true
```

In `config/bluemap/webserver.conf` die bestehenden Werte für HTTP-Server aktivieren/anpassen:
```hocon
enabled: true
ip: "127.0.0.1"
port: 8100
```

Je nach BlueMap-Version kann die Syntax für einzelne Felder leicht abweichen; vorhandene Kommentare und restliche Einstellungen erhalten. Nach Speichern Server neu starten. BlueMap startet den Render der gespeicherten Weltbereiche; große modifizierte Welten benötigen Zeit und CPU/RAM. **Nicht** absichtlich für diesen Schritt unerkundete Chunks generieren. Im Minecraft-Serverlog auf BlueMap-Render- bzw. Webserver-Fehler achten.

Auf dem Hetzner-Server per PowerShell:
```powershell
Invoke-WebRequest http://127.0.0.1:8100/ -UseBasicParsing
```

## 3. Caddy (HTTPS) erweitern

Dein bereits laufender Caddy-Dienst bedient `https://23.88.65.87/status` und `/player/*`. Diese Konfiguration **erhalten**.

Im bestehenden Block `23.88.65.87 { ... }` vor dem abschließenden Fallback-404-Handler ergänzen:

```caddyfile
handle_path /map/* {
    reverse_proxy 127.0.0.1:8100
}
```

Beispiel für die Reihenfolge im bestehenden Site-Block, ohne die TLS-Einstellungen zu ersetzen:

```caddyfile
23.88.65.87 {
    tls {
        issuer acme {
            profile shortlived
        }
    }

    @stats path /status /player/*
    handle @stats {
        reverse_proxy 127.0.0.1:25566
    }

    handle_path /map/* {
        reverse_proxy 127.0.0.1:8100
    }

    handle {
        respond "Not Found" 404
    }
}
```

Die vorhandene globale `default_sni 23.88.65.87`-Konfiguration beibehalten, falls für dein IP-Zertifikat benötigt.

Caddy prüfen/neu laden (PowerShell als Administrator):
```powershell
& 'C:\Caddy\caddy.exe' validate --config 'C:\Caddy\Caddyfile'
& 'C:\Caddy\caddy.exe' reload --config 'C:\Caddy\Caddyfile'
```

**Keine zusätzlichen öffentlichen Ports öffnen.** Für Spieler reicht der bestehende HTTPS-Port 443. BlueMap bleibt ausschließlich auf `127.0.0.1:8100` erreichbar. Der bereits eingerichtete Port 25566 bleibt ebenfalls intern.

## 4. Externe Verfügbarkeit prüfen

Von deinem PC:
```powershell
Invoke-WebRequest https://23.88.65.87/map/ -UseBasicParsing
```

Die Antwort muss HTTP 200 mit BlueMap-HTML sein. Danach La Familia Launcher → **Weltkarte** öffnen und **Aktualisieren** klicken. Ist der Render der Welt noch nicht fertig, kann BlueMap trotzdem bereits öffnen und leere Gebiete zeigen. Karten (Welt, Nether, End, zusätzliche Welten) werden nur angezeigt, wenn BlueMap die jeweiligen Dimensionen entdeckt und für sie eine Karte konfiguriert und gerendert hat.

Im Kartenfenster kannst du die 3D/2D-Ansichten und Dimensionen über BlueMap steuern. Falls die Einbettung im Launcher durch Sicherheits-Header blockiert wird, kannst du **Im Browser öffnen** verwenden.

## Hinweise

- `/status` (TPS/Laufzeit) und `/player/<UUID>` (geschützte Statistiken) bleiben unverändert.
- Das Rendern von Modblöcken kann eigene Ressourcenpakete/Modelle benötigen, um exakt wie im Spiel auszusehen.
- Eine öffentliche BlueMap kann erkundete Geländeformen und eventuell Spielerpositionen verraten. Konfiguriere BlueMap-Player-Marker/Privacy nach den Regeln deines Servers, bevor du die Karte öffentlich zugänglich machst.
- BlueMap und seine Welt-Dateien können viel Festplattenspeicher benötigen. Vor der Erstinstallation ein Welt-Backup erstellen.

Quellen:
- https://modrinth.com/plugin/bluemap/version/5.6-fabric
- https://bluemap.bluecolored.de/wiki/getting-started/Installation.html
- https://bluemap.bluecolored.de/wiki/webserver/ReverseProxy.html
