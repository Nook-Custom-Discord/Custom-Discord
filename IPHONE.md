# Nook auf dem iPhone (kostenlos, ohne Mac)

Die App wird auf GitHub gebaut und mit **Sideloadly** über einen Windows-PC aufs iPhone gespielt.
Mit einer kostenlosen Apple-ID läuft sie jeweils **7 Tage**, danach muss sie erneuert werden
(Sideloadly kann das automatisch). Maximal 3 solcher Apps pro Apple-ID.

## 1. App bauen lassen (einmal pro neuer Version)
1. Auf GitHub ins Repo → **Actions** → links **„iPhone-App bauen"** → **Run workflow**.
2. Nach ca. 10–15 Minuten den fertigen Lauf öffnen und unten bei **Artifacts** **„Nook-iPhone"** herunterladen.
3. Die ZIP entpacken – darin liegt `Nook-iPhone-<version>.ipa`.

Kleinere Änderungen an der Oberfläche brauchen keine neue App: Die App holt sich die Oberfläche
wie am PC live vom Nook-Server.

## 2. Einmalig am Windows-PC einrichten
1. **iTunes** und **iCloud** von apple.com installieren – **nicht** die Versionen aus dem Microsoft Store.
2. **Sideloadly** von sideloadly.io herunterladen und installieren.

## 3. App aufs iPhone spielen
1. iPhone per USB-Kabel anschließen, entsperren und **„Diesem Computer vertrauen"** tippen.
2. Sideloadly öffnen, die `.ipa`-Datei ins Fenster ziehen.
3. Bei **Apple ID** deine Apple-ID eintragen → **Start** → Passwort und den Bestätigungscode eingeben.
   Tipp: Viele nehmen dafür eine zweite, extra angelegte Apple-ID.
4. Am iPhone: **Einstellungen → Allgemein → VPN & Geräteverwaltung** → deine Apple-ID antippen → **Vertrauen**.
5. Ab iOS 16: **Einstellungen → Datenschutz & Sicherheit → Entwicklermodus** einschalten, iPhone neu starten, bestätigen.

## 4. Nook einrichten
- Die App **Tailscale** (App Store) installieren und mit dem gleichen Konto anmelden, mit dem der Nook-Server geteilt ist.
- Nook öffnen, als Server-Adresse die **https-Adresse** des Servers eintragen
  (z. B. `desktop-68n5rad.tail57f6c1.ts.net` – das `https://` ergänzt die App selbst) und anmelden.

## 5. Alle 7 Tage erneuern
- **Automatisch:** In Sideloadly vor dem Start bei **Advanced options** „Automatic refresh" aktivieren und in iTunes
  beim iPhone „Mit diesem iPhone über WLAN synchronisieren" einschalten. Dann erneuert Sideloadly die App,
  sobald PC und iPhone im selben WLAN sind.
- **Per Hand:** einfach Schritt 3 wiederholen. Deine Nachrichten und Einstellungen bleiben erhalten.

## Anrufe bei gesperrtem Bildschirm
Ab Version 1.4.3 laufen Mikro und Ton in der iPhone-App über eine eigene native Erweiterung (`native/nook-call`)
und gehen weiter, wenn der Bildschirm gesperrt ist oder du in eine andere App wechselst. Die Kamera pausiert dabei
(das erlaubt iOS keiner App) und startet nach dem Entsperren von selbst wieder.
Dafür muss auf dem PC, der den Nook-Server betreibt, ebenfalls mindestens Version 1.4.3 laufen.

Falls das Bauen auf GitHub fehlschlägt: beim Lauf unten **„Build-Protokoll“** herunterladen und weiterschicken.

## Was (noch) nicht geht
- Benachrichtigungen, wenn Nook komplett geschlossen ist (dafür bräuchte es ein bezahltes Apple-Konto).
- Bildschirm teilen vom iPhone aus. Streams **ansehen** geht.
