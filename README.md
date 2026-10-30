# Nook 🏡

Eure private Chat-, Sprach- und Stream-App – für Windows und macOS, komplett gratis, auf eurem eigenen Server. Eigenes Design, alle „Premium"-Funktionen sind einfach an.

---

## So funktioniert's (kurz)

Nook besteht aus **einer App** für alle. Einer aus eurer Gruppe (der **Host**) startet in der App zusätzlich den **Server**. Alle anderen tragen beim Login die **Adresse des Hosts** ein. Danach könnt ihr euch per Benutzernamen als Freunde adden, Server erstellen, schreiben, reden und streamen.

```
   Freund A ─┐
   Freund B ─┼──►  Nook-Server (beim Host)  ◄── Chat, Freunde, Dateien
   Freund C ─┘
        ▲  ▲
        └──┴── Sprache, Video & Streams gehen direkt zwischen euch (Peer-to-Peer)
```

---

## 1. App herunterladen

Die neueste Version gibt es unter **[Releases](https://github.com/Nook-Custom-Discord/Custom-Discord/releases/latest)**.

| System  | Datei | Hinweis |
|---------|-------|---------|
| Windows | `Nook-Setup-1.4.2.exe` | Beim ersten Start meckert evtl. der SmartScreen („Unbekannter Herausgeber") → **Weitere Informationen → Trotzdem ausführen**. |
| macOS   | `Nook-1.4.2-mac.dmg` | Da die App nicht bei Apple registriert ist: Nook in „Programme" ziehen, dann **Rechtsklick → Öffnen → Öffnen**. Falls „beschädigt" angezeigt wird, im Terminal einmal `xattr -cr /Applications/Nook.app` ausführen. |

### Wie bekommen meine Freunde die App?

**Variante A – GitHub (empfohlen, baut automatisch auch die Mac-Version):**
1. Kostenloses Konto auf github.com anlegen, neues Repository erstellen (z. B. `nook`), diesen Ordner hochladen.
2. Einen Versions-Tag pushen:
   ```bash
   git tag v1.0.0
   git push --tags
   ```
3. Unter **Actions** läuft jetzt „Build & Release". Nach ca. 10 Minuten liegen unter **Releases** die `.exe` (Windows) und `.dmg` (Mac).
4. Den Release-Link an deine Freunde schicken – fertig.

**Variante B – direkt verschicken:** Die fertige `Nook-Setup-<Version>.exe` liegt im Ordner `dist/`. Die kannst du einfach per Google Drive, OneDrive, WeTransfer o. ä. teilen. (Die Mac-Version kann nur auf einem Mac oder per Variante A gebaut werden.)

---

## 2. Server starten (nur der Host)

### Option 1: Direkt in der App (am einfachsten)
1. Nook öffnen → auf dem Login-Bildschirm **„Server auf diesem PC starten"** klicken.
   (Oder später: Einstellungen → **Server hosten**.)
2. Konto erstellen. Dein Server läuft jetzt, solange Nook offen ist (auch minimiert im Tray).
3. Unter **Einstellungen → Server hosten** siehst du die Adressen, die du deinen Freunden schickst.

Damit Freunde **über das Internet** reinkommen, brauchst du eine der folgenden Möglichkeiten:

- **Portweiterleitung im Router** (kostenlos, dauerhaft):
  1. Router-Oberfläche öffnen (meist `http://192.168.178.1` bei der FritzBox oder `http://192.168.0.1`).
  2. Portfreigabe / Portweiterleitung → **TCP-Port 3500** an die lokale IP deines PCs (steht in Nook unter „Server hosten").
  3. Deine Freunde verbinden sich mit `http://DEINE-ÖFFENTLICHE-IP:3500` (steht ebenfalls dort).
  4. Windows fragt beim ersten Start evtl. nach der Firewall → **Zulassen** (privat + öffentlich).
  Tipp: Wenn sich deine öffentliche IP öfter ändert, hol dir eine kostenlose DynDNS-Adresse (z. B. bei duckdns.org oder MyFRITZ!).
- **Tailscale** (kostenlos, ohne Router-Einstellungen): Alle installieren Tailscale und treten deinem Netzwerk bei. Dann verbinden sich alle mit `http://TAILSCALE-IP-DES-HOSTS:3500`.

### Option 2: Eigener kleiner Server, der 24/7 läuft
Wenn Nook auch laufen soll, wenn dein PC aus ist – z. B. auf einem Raspberry Pi, einem alten Laptop oder einem kostenlosen Cloud-Server (Oracle Cloud „Always Free"):

```bash
# Node.js 20+ installieren, dann im Nook-Ordner:
npm install --omit=dev
PORT=3500 node server/cli.js
```

Optionale Einstellungen (Umgebungsvariablen):

| Variable | Bedeutung |
|---|---|
| `PORT` | Port (Standard 3500) |
| `NOOK_DATA` | Ordner für Datenbank & Uploads (Standard `./nook-data`) |
| `NOOK_REGISTER_CODE` | Wenn gesetzt, braucht man diesen Code zum Registrieren – so kommen nur deine Freunde rein |
| `TURN_URL`, `TURN_USER`, `TURN_PASS` | Optionaler TURN-Server, falls Sprachchat bei jemandem wegen strenger Firewall nicht verbindet |

**Backup:** Alles liegt im Datenordner (`db.json` + `uploads/`). In der App-Variante: `%APPDATA%\Nook\server-data` (Windows) bzw. `~/Library/Application Support/Nook/server-data` (Mac).

---

### Option 3: Raspberry Pi (24/7, empfohlen)
1. Mit dem **Raspberry Pi Imager** „Raspberry Pi OS Lite (64-bit)" auf die SD-Karte schreiben. In den Einstellungen des Imagers: Hostname (z. B. `nook`), Benutzer + Passwort, WLAN und **SSH aktivieren**.
2. Pi starten, am PC ein Terminal öffnen: `ssh BENUTZER@nook.local`
3. Auf dem PC (wo Nook gerade hostet) `node scripts/pi-pack.js` ausführen – es gibt **einen Befehl** aus. Den auf dem Pi einfügen.
4. Das Skript installiert alles, **übernimmt alle Konten/Nachrichten/Dateien vom PC**, richtet Nook als Dauer-Dienst ein (Uploads max. 8 GB, Logs max. 100 MB) und erstellt mit Tailscale Funnel eine öffentliche **https-Adresse**.
5. Danach auf dem PC unter Einstellungen → Server hosten → **Stoppen**. Alle melden sich ab und mit der neuen https-Adresse wieder an.

Updates an den Pi verteilen: `NOOK_DEPLOY_URL=https://… NOOK_DEPLOY_KEY=<admin.key> npm run deploy`

## Handy (iPhone & Android)
Nook läuft als installierbare Web-App. Voraussetzung ist eine **https**-Adresse (z. B. vom Raspberry Pi mit Tailscale Funnel), sonst darf der Browser das Mikrofon nicht benutzen.
- **iPhone:** Adresse in **Safari** öffnen → Teilen-Symbol → **„Zum Home-Bildschirm"**.
- **Android:** Adresse in **Chrome** öffnen → ⋮ → **„App installieren"**.

## 3. Loslegen

1. Jeder registriert sich mit der Server-Adresse des Hosts.
2. **Freunde adden:** Links „Freunde" → „Freund hinzufügen" → Benutzername eintippen.
3. **Server erstellen:** Das **+** oben neben den Server-Tabs → Erstellen. Freunde einladen über Rechtsklick auf den Server → „Leute einladen".
4. **Reden & streamen:** Auf einen Sprachkanal klicken → beitreten. Bildschirm-Button → Fenster/Spiel wählen → Qualität bis **4K / 120 FPS** → „Live gehen".

---

## Was Nook kann

**Chat**
- Server mit Text-, Sprach-, Ankündigungs-, Forum- und Bühnen-Kanälen, Kategorien, private Kanäle
- Direktnachrichten & Gruppenchats (bis 25 Personen) mit Gruppenbild-Collage, Beschreibung & Gruppenfarbe, Anrufe & Videoanrufe mit Klingeln
- Markdown (fett, kursiv, unterstrichen, durchgestrichen, Überschriften, Listen, Zitate, Code-Blöcke mit Highlighting, Spoiler `||so||`), Zeitstempel `<t:…>`
- Antworten, Bearbeiten, Löschen, Anheften, Weiterleiten, Als ungelesen markieren
- Reaktionen (inkl. Mega-Reaktionen mit Shift+Klick), Threads, Umfragen, Sprachnachrichten
- Erwähnungen (@Person, @Rolle, @everyone, @here, #Kanal), Tipp-Anzeige, Ungelesen-Markierungen & Badges
- Dateien bis **2 GB**, Bilder/Videos/Audio direkt im Chat, Link-Vorschauen, YouTube-Player
- Suche (mit `from:name`, `has:image|file|link`), Slash-Befehle (`/shrug`, `/poll`, `/nick`, `/spoiler`, `/me`, `/silent` …), Emoji-Autovervollständigung mit `:name:`
- Eigene Server-Emojis (auch animiert) – **überall** nutzbar

**Sprache, Video & Streaming**
- Sprachkanäle, Mute/Taub, Sprechanzeige, Lautstärke pro Person (bis 200 %), lokal stummschalten
- Sprachaktivierung mit Empfindlichkeit oder Push-to-Talk, Rauschunterdrückung, Echounterdrückung
- Studio-Sprachqualität (Opus 128 kbit/s)
- Kamera bis 1080p60, Bildschirm/Fenster teilen bis **4K 120 FPS** mit Systemton, Fokus- & Vollbildansicht
- Live-Anzeige der empfangenen Stream-Qualität (Auflösung, FPS, Datenrate), Bitrate wird automatisch auf mehrere Zuschauer verteilt, Codec passend zum Inhalt (H264 für Spiele, VP9 für Text)
- Klangbox mit eigenen Sounds, Text-Chat im Sprachkanal, Bühnen-Kanäle mit „Sprechen anfragen"
- Moderation: Server-Mute/-Taub, Verschieben, Trennen

**Spiele & Clips** (Desktop-App, Einstellungen → Spiele & Clips)
- **Spiel-Erkennung:** Nook erkennt, was du spielst – bekannte Spiele (Fortnite, VALORANT, LoL, CS2, Minecraft, Roblox, GTA, Apex, Rocket League …) und alles aus Steam, Epic, Xbox, GOG, Ubisoft und EA. Freunde sehen „Spielt Fortnite“ und **wie lange schon** – in der Freundesliste, der Mitgliederliste, im Profil (mit laufender Uhr) und unter „Was gerade läuft“. Abschaltbar; nicht erkannte Spiele fügst du aus der Liste der offenen Programme hinzu, Fehlalarme blendest du mit „Ist kein Spiel“ aus. Eine selbst gesetzte Aktivität hat immer Vorrang.
- **Clips:** Während eines Spiels (oder auf Wunsch immer) puffert Nook die letzten 15 s bis 2 Min. deines Bildschirms mit Spielton, Freunden im Anruf und auf Wunsch deiner eigenen Stimme – nur im Arbeitsspeicher. Gespeichert wird erst, wenn du clippst: per **Alt+F10** (änderbar, funktioniert mitten im Spiel), mit dem Clip-Knopf oben rechts oder per **Sprachbefehl „Clip das“** / „Nook, clip“ (Windows, offline über die Windows-Spracherkennung, einschaltbar). Die Clips landen als .webm in „Videos/Nook Clips“ (Ordner änderbar). In den Einstellungen kannst du sie abspielen, im Ordner zeigen, direkt an Freunde schicken oder löschen. Qualität von 720p30 bis 1440p60. Auf dem Mac ohne Systemton.

**Profil & Anpassung (alles gratis)**
- Animierte Avatare & Banner (GIF), **Video-Profilbilder** (MP4/WebM bis 15 s – laufen im Profil, in Listen beim Drüberfahren), Profil-Farbthemen, über 60 Auren um den Avatar (davon 17 mehrschichtig animiert wie Portal, Schwarzes Loch, Engelsflügel, Cyber-HUD), animierte Profilrahmen, Profil-Szenen, Namensbänder, Namens-Stile mit Schrift & Farbverlauf
- **Live-Animationen** (flüssig auf Canvas, mit Leuchten, Schwerkraft und Tiefe): 14 Profil-Szenen – Feuerwerk, Nordlicht, Galaxienwirbel, Sternschnuppen, Glühwürmchen-Schwarm, Blitzsturm, Schneegestöber, Sakura-Wind, Matrix-Code, Schillernde Blasen, Liebesfunken, Feuersturm, Konfetti-Kanone, Unterwasser – und 6 Auren: Flammenkranz, Lichtorbit, Plasmaring, Sternenwirbel, Blütenwirbel, Eiskristallkranz. Dazu 6 Live-Sets (Inferno, Feuerwerk, Gewitter, Kosmos, Hanami, Polarnacht). Sie laufen nur, solange sie zu sehen sind
- 17 Sets mit Aura, Profil-Szene, Namensband und Rahmen – alles auf einen Klick ausrüstbar, komplett generiert (keine Bilddateien):
  - Geflechte (Karmesin, Frost, Gift, Schatten, Gold): glänzende organische Geflechte, Tropfen laufen herab
  - Dornen (Rosendornen, Dornröschen, Schattendornen): Ranken wachsen herein, Rosen erblühen, Blütenblätter fallen
  - Kristalle (Amethyst, Eiskristall, Rubin): facettierte Splitter, die aufblitzen und funkeln
  - Anime (Sakura-Sturm, Fuchsfeuer, Shinobi, Magical Girl, Manga-Action, Katana): kreisende Kirschblüten, flackerndes Fuchsfeuer mit Fuchsohren, wirbelnde Shuriken, Schleife mit funkelnden Sternen, Manga-Speedlines mit „!!"-Blase, gekreuzte Katanas mit Klingenglanz – eigene Motive, keine Serienfiguren
- Pro-Server-Profil (Nickname, Avatar, Banner, Bio), Pronomen, Bio mit Markdown
- Status (Online/Abwesend/Bitte nicht stören/Unsichtbar), eigener Status mit Emoji & Ablaufzeit, Aktivität („Spielt …“, auch automatisch erkannt)
- App-Themes (Tinte, Mitternacht, Dämmerung, Wald, Papier) mit kreisförmigem Überblenden, freie Akzentfarbe, Bubble- oder Kompakt-Layout, Schriftgröße
- 8 Sound-Pakete (Nook, Kristall, Blubber, Retro, Lo-Fi, Sci-Fi, Marimba, Dezent), eigene Sound-Dateien pro Ereignis (auch als Klingelton), jedes Ereignis einzeln an/aus

**Design & Liquid Glass**
- Komplett neu gebaute Oberfläche: schwebende Glas-Kapseln oben (Logo, Server-Tabs, Suche mit Strg+K, Profil), Kanal-Symbole als leuchtende Chips, Verlaufs-Blasen für eigene Nachrichten, gleitende Auswahl-Markierungen in allen Tab-Leisten, Einstellungen mit Symbolen, schwebende Steuerleiste im Call, Sprachkacheln mit Schallwellen
- **Liquid Glass** (Darstellung → Liquid Glass, Status-Menü oder **Strg+Umschalt+G**): Leisten, Panels, Menüs und Dialoge werden zu durchsichtigem Glas, dein Hintergrund schimmert durch. In der App, in Chrome und Edge bricht das Glas das Licht an den Kanten wie eine echte Linse; dazu wandert ein Lichtreflex unter dem Mauszeiger mit. Nachrichten laufen unter der Kopfzeile und dem Eingabefeld durch. Zwei Varianten: **Getönt** und **Klar**. Unter **„Glas anpassen“** stellst du alles selbst ein: Durchsichtigkeit, Unschärfe (bis gestochen scharf durchsehen), Stärke der Lichtbrechung, Glanz und Glasfarbe (automatisch, weiß, schwarz, Akzent oder eigene Farbe). Dazu fertige Stile: Standard, Durchsicht, Kristall (komplett durchsichtig) und Milchglas. Funktioniert mit allen Themes, auch mit dem hellen.
- **Hinter dem Fenster** (nur Desktop-App, Darstellung → Liquid Glass → Glas anpassen): **Normal**, **Desktop verschwommen** (Glas vom System, Windows 11 und macOS) oder **Glas über deinen Apps** (Windows 10/11): Nook liegt wie Apple-Glas über den Apps dahinter – sie scheinen verschwommen durch und werden an den Kanten gebrochen, die Stärke stellst du mit den Reglern ein. Mit „In Bildschirmübertragungen sichtbar“ (Standard) bleibt Nook in Übertragungen und Screenshots zu sehen; hinter dem Glas liegt dann ein Standbild deiner Apps, das sich erneuert, sobald du zu Nook zurückkommst. Ohne diese Option bewegen sich die Apps live mit, Nook ist dafür in Aufnahmen ausgeblendet. Braucht die neue App-Version (einmal neu installieren).
- 9 Hintergründe (Aurora in deiner Akzentfarbe, Sonnenuntergang, Ozean, Nebel mit Sternen, Bonbon, Wald, Lava, Prisma, Bokeh) oder ein eigenes Bild. Sie treiben langsam und pausieren automatisch, wenn Nook nicht im Fokus ist (z. B. beim Zocken).
- Animierte Oberfläche: Klick-Wellen, Licht-Effekt auf Karten, gestaffelt einblendende Listen, weiche Kanal- und Seitenwechsel (abschaltbar über „Animationen reduzieren")

**Verwaltung**
- Rollen mit Farben, 22 Berechtigungen, Hoisting, Reihenfolge; Kick, Bann (mit Grund & Nachrichten löschen)
- Einladungen mit Ablaufzeit & Nutzungslimit, Server übertragen/löschen, Slowmode, NSFW-Kanäle, Nutzerlimit
- Freunde, Anfragen, Blockieren, private Notizen zu Personen
- Benachrichtigungen pro Server/Kanal, Desktop-Benachrichtigungen, Tray, Autostart, Badge-Zähler
- Schnellwechsler (Strg+K) und viele Tastenkürzel

**Was (noch) fehlt:** Sticker, ein eingebauter GIF-Sucher (GIF-Links & -Uploads funktionieren aber), Bots/Webhooks, Audit-Log, AutoMod, geplante Events, Activities (Spiele im Sprachkanal), Handy-App, globales Push-to-Talk wenn das Fenster nicht aktiv ist.

---

## Veröffentlichen

Nook ist eine eigenständige App mit eigenem Namen, Logo und eigener Oberfläche – kein Klon und kein offizielles Produkt eines anderen Anbieters. Bevor ihr Nook öffentlich anbietet:

- **Repository umbenennen:** Name und Organisation des GitHub-Repos (`Nook-Custom-Discord/Custom-Discord`) enthalten eine fremde Marke. Benennt sie um (z. B. `nook-app/nook`) – GitHub leitet alte Links automatisch weiter. Danach in dieser README die Links anpassen.
- **Keine fremden Marken** in Texten, Screenshots, Store-Beschreibungen oder Werbung verwenden (z. B. „besser als …“).
- Für rechtliche Fragen (Impressum, Datenschutz, Marken) im Zweifel eine Fachperson fragen.

---

## Für Entwickler

```bash
npm install
npm start            # App im Entwicklungsmodus starten
npm run server       # nur den Server starten
npm run dist:win     # Windows-Installer bauen (dist/)
npm run dist:mac     # macOS-DMG bauen (nur auf einem Mac)
npm run deploy       # Oberfläche LIVE an alle verteilen (ohne Neuinstallation)
```

**Live-Updates:** Die App lädt ihre Oberfläche beim Start vom Nook-Server. `npm run deploy` legt die neue Version in den `ui`-Ordner des Servers (`%APPDATA%\Nook\server-data\ui`), der Server merkt das und alle verbundenen Apps laden sich automatisch neu (wer gerade im Call ist, bekommt einen Hinweis und das Update nach dem Auflegen). Nur Änderungen an `main.js`, `preload.js` oder dem Server selbst brauchen eine Neuinstallation.

Aufbau: `main.js` (Electron-Hauptprozess), `server/` (Express + Socket.IO + JSON-Datenbank), `renderer/src/` (Oberfläche mit Preact, gebündelt mit esbuild; `glass.js` erzeugt die Lichtbrechung für Liquid Glass als SVG-Filter), `shared/perms.js` (Berechtigungen).

> Hinweis für Windows: Liegt der Projektordner sehr tief (Pfad > 200 Zeichen), scheitert der Installer-Build an einem NSIS-Pfadlimit. Dann den Ordner z. B. nach `C:\nook` kopieren und dort bauen.
