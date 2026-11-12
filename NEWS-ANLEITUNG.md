# La Familia News-Verwaltung – ohne neues Launcher-Update

Die Nachrichten erscheinen in **La Familia Launcher V1.3.4** beim Start und werden ungefähr alle zwei Minuten aktualisiert.

## Meldung hinzufügen
1. In [GitHub Actions – La Familia News verwalten](https://github.com/LaFamiliaMC/LaFamilia-Launcher/actions/workflows/manage-news.yml) gehen.
2. **Run workflow** auf `main` klicken, Aktion `hinzufuegen` auswählen.
3. Titel und Text ausfüllen, Datum optional (`JJJJ-MM-TT`), optional Bildpfad.
4. **Run workflow** starten. Nach grünem Haken News-Seite im Launcher aktualisieren oder auf die nächste Prüfung warten.

## Nachricht bearbeiten oder löschen
1. [data/news.json](https://github.com/LaFamiliaMC/LaFamilia-Launcher/blob/main/data/news.json) öffnen.
2. Die `id` des gewünschten News-Eintrags kopieren.
3. Workflow mit `bearbeiten` oder `loeschen` starten und die ID eintragen.
4. Beim Bearbeiten verändern nur ausgefüllte Felder den vorhandenen Eintrag. Um ein Bild zu entfernen, im Feld **bild** ein einzelnes `-` eingeben.

## Bild hinzufügen
1. Repository-Ordner [assets/news](https://github.com/LaFamiliaMC/LaFamilia-Launcher/tree/main/assets/news) öffnen.
2. **Add file → Upload files** auswählen und eine PNG-, JPG- oder WEBP-Datei hochladen, danach committen.
3. Im News-Workflow z. B. `assets/news/piraten-event.png` als Bildpfad eintragen.

## Hinweise
- Texte werden sicher als Text statt HTML gerendert.
- Nur Repository-Berechtigte verwalten News. Der Windows-Launcher enthält keinen GitHub-Zugriffstoken.
- Bei fehlender Verbindung zeigt der Launcher die zuletzt lokal gespeicherten News.
- Nur News-Daten und News-Bilder zu ändern löst keinen neuen Windows-Build aus.
- Eine News ist sofort nach dem GitHub-Commit öffentlich lesbar; ein EXE-Update ist nicht erforderlich.
