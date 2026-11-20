# Nook auf Android

Die App wird auf GitHub gebaut und als `.apk` direkt aufs Handy installiert – kein Play Store, kein Konto nötig,
kein Ablaufdatum wie beim iPhone.

## 1. App bauen lassen (einmal pro neuer Version)
1. Auf GitHub ins Repo → **Actions** → links **„Android-App bauen"** → **Run workflow**.
2. Nach ca. 5–10 Minuten den fertigen Lauf öffnen und unten bei **Artifacts** **„Nook-Android"** herunterladen.
3. Die ZIP entpacken – darin liegt `Nook-Android-<version>.apk`.

Kleinere Änderungen an der Oberfläche brauchen keine neue App: Die App holt sich die Oberfläche
wie am PC live vom Nook-Server.

## 2. Aufs Handy spielen
1. Die `.apk` aufs Handy bringen (z. B. per Google Drive, Mail an dich selbst oder USB-Kabel).
2. Am Handy antippen. Beim ersten Mal fragt Android, ob die App (Dateien/Chrome/Drive) **unbekannte Apps
   installieren** darf → erlauben → **Installieren**.
3. Google Play Protect warnt evtl. vor einer „unbekannten App" → **Trotzdem installieren**.

Update: neue `.apk` genauso installieren – Nachrichten und Anmeldung bleiben erhalten.
Heißt die Datei `…-test.apk`, ist kein fester Signier-Schlüssel hinterlegt (siehe unten); dann muss die alte App
vor dem Update deinstalliert werden.

## 3. Nook einrichten
- Läuft der Server über Tailscale: die App **Tailscale** (Play Store) installieren und mit dem gleichen Konto anmelden.
- Nook öffnen, als Server-Adresse die Adresse des Servers eintragen (z. B. `desktop-68n5rad.tail57f6c1.ts.net`)
  und anmelden. Mikrofon und Kamera fragt Android beim ersten Anruf ab.

## Anrufe bei gesperrtem Bildschirm
Während eines Anrufs zeigt Nook eine Benachrichtigung „Nook – Anruf läuft". Solange sie da ist, laufen Mikro und Ton
weiter, auch wenn der Bildschirm aus ist oder du in eine andere App wechselst. Erlaube dafür beim ersten Anruf die
Benachrichtigungen. Manche Hersteller (Samsung, Xiaomi, Huawei) beenden Apps trotzdem – dann in den
Akku-Einstellungen für Nook **„Nicht eingeschränkt"** wählen.

Damit die Android-Hinweise in der Oberfläche erscheinen, muss auf dem Server-PC dieselbe Nook-Version laufen
(die App lädt ihre Oberfläche vom Server).

## Fester Signier-Schlüssel (einmalig, für einfache Updates)
Android installiert ein Update nur, wenn es mit demselben Schlüssel unterschrieben ist. Dafür einmalig einen
Schlüssel erzeugen und als GitHub-Secrets hinterlegen (Repo → Settings → Secrets and variables → Actions):

| Secret | Inhalt |
| --- | --- |
| `NOOK_KEYSTORE_B64` | die Schlüsseldatei als Base64 |
| `NOOK_KEYSTORE_PASSWORD` | Passwort der Schlüsseldatei |
| `NOOK_KEY_ALIAS` | Name des Schlüssels (z. B. `nook`) |
| `NOOK_KEY_PASSWORD` | Passwort des Schlüssels |

Schlüssel erzeugen (Java muss installiert sein):

```
keytool -genkeypair -v -keystore nook-release.jks -alias nook -keyalg RSA -keysize 2048 -validity 10000
```

Die Datei `nook-release.jks` gut aufheben und **nie ins Repo** legen – ohne sie lassen sich keine Updates mehr
drüberinstallieren.

Falls das Bauen auf GitHub fehlschlägt: beim Lauf unten **„Build-Protokoll"** herunterladen und weiterschicken.

## Was (noch) nicht geht
- Benachrichtigungen über neue Nachrichten, wenn Nook komplett geschlossen ist.
- Bildschirm teilen vom Handy aus. Streams **ansehen** geht.
