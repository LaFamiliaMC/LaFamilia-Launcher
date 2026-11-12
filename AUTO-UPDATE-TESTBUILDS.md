# La Familia – automatische Updates nach jedem erfolgreichen Testbuild

Ab jetzt veröffentlicht die GitHub-Action **La Familia Windows Setup** jeden erfolgreichen Build auf `main` und jeden manuellen Testbuild als **reguläres GitHub Release (latest)**. Es ist keine weitere Freigabe, kein zusätzliches Release-Tag und kein manueller Upload erforderlich.

**Versionen:** Während des Builds wird die Paketversion automatisch nach `1.4.<GitHub-Run-Nummer>` vergeben, beispielsweise `1.4.38`. Dies geschieht ausschließlich im GitHub-Runner; `package.json` im Repository bleibt unverändert. Jeder Build hat dadurch eine neue, höhere Version. Bereits veröffentlichte Releases werden nicht überschrieben.

**Updater:** Das Setup erhält den konfigurierten GitHub-Updatefeed (`app-update.yml`). Die Action veröffentlicht exakt dazu `latest.yml`, die Windows-Setup-EXE und Blockmap als Assets. Ein installierter La-Familia-Launcher mit gültigem Updatefeed prüft beim Start auf neue Versionen, lädt sie herunter und kann sie installieren.

Der Build wird nur nach bestandenen Tests und einer erfolgreichen Erzeugung von EXE und `latest.yml` veröffentlicht. Zusätzlich bleibt das Setup im Workflow als Artifact abrufbar.

**Ziel-Repository:** Standardmäßig `LaFamiliaMC/LaFamilia-Launcher`. Falls GitHub-Variablen `LA_FAMILIA_UPDATES_OWNER` und `LA_FAMILIA_UPDATES_REPO` ein separates Update-Repository vorgeben, verwendet die Action dieses und benötigt das Secret `LA_FAMILIA_RELEASES_TOKEN`.

**Hinweis:** Diese Builds werden durch den Updatekanal tatsächlich automatisch angeboten, auch wenn wir sie noch als Testversionen betrachten. Das ist derzeit ausdrücklich gewünscht, da noch keine Spieler den Launcher verwenden. Vor einem späteren regulären Spielerbetrieb sollte die automatische Veröffentlichung erneut geprüft werden.

Das Piraten-Design und die Positionen der Bedienelemente bleiben unverändert.
