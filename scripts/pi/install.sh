#!/usr/bin/env bash
# Nook auf einem Raspberry Pi installieren (Raspberry Pi OS Lite 64-bit empfohlen).
# Wird von scripts/pi-pack.js mit den passenden Adressen befüllt und dann auf dem Pi ausgeführt:
#   curl -fsSL http://<PC>:3500/<ordner>/install.sh | bash
set -euo pipefail

SRC="__SRC__"          # Adresse, unter der das Code-Paket liegt
ORIGIN="__ORIGIN__"    # bisheriger Nook-Server (PC), von dem die Daten übernommen werden
KEY="__KEY__"          # Admin-Schlüssel des bisherigen Servers
NOOK_DIR="$HOME/nook"

say() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }

say "Nook wird installiert – das dauert ca. 5–10 Minuten"

# --- Node.js ---
NODE_OK=0
if command -v node >/dev/null 2>&1; then
  [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] && NODE_OK=1
fi
if [ "$NODE_OK" = 0 ]; then
  say "Node.js 22 wird installiert"
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl gnupg
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# --- Code ---
say "Nook-Server wird heruntergeladen"
mkdir -p "$NOOK_DIR"
cd "$NOOK_DIR"
curl -fsSL "$SRC/nook-server.tgz" | tar xz
npm install --omit=dev --no-audit --no-fund --loglevel=error
mkdir -p nook-data/uploads nook-data/ui

# --- Daten vom PC übernehmen (nur beim ersten Mal) ---
if [ ! -f nook-data/db.json ] && [ -n "$ORIGIN" ]; then
  say "Konten, Nachrichten und Dateien werden vom PC übernommen"
  curl -fsSL "$ORIGIN/api/export/$KEY/db" -o nook-data/db.json
  COUNT=0
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    curl -fsSL "$ORIGIN/uploads/$f" -o "nook-data/uploads/$f" && COUNT=$((COUNT + 1))
  done < <(curl -fsSL "$ORIGIN/api/export/$KEY/files")
  echo "   $COUNT Dateien übernommen"
fi

# --- Registrierungscode (der Server ist gleich öffentlich erreichbar) ---
if [ ! -f nook-data/register.code ]; then
  node -e "process.stdout.write(require('crypto').randomBytes(4).toString('hex'))" > nook-data/register.code
fi
REGCODE="$(cat nook-data/register.code)"

# --- Dienst, der Nook rund um die Uhr laufen lässt ---
say "Nook wird als Dauer-Dienst eingerichtet"
sudo tee /etc/systemd/system/nook.service >/dev/null <<EOF
[Unit]
Description=Nook Server
After=network-online.target
Wants=network-online.target

[Service]
User=$USER
WorkingDirectory=$NOOK_DIR
Environment=PORT=3500
Environment=NOOK_DATA=$NOOK_DIR/nook-data
Environment=NOOK_STORAGE_LIMIT_MB=8000
Environment=NOOK_MAX_UPLOAD_MB=500
Environment=NOOK_REGISTER_CODE=$REGCODE
ExecStart=$(command -v node) server/cli.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now nook

# Logs klein halten (16-GB-Karte)
sudo mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=100M\n' | sudo tee /etc/systemd/journald.conf.d/nook.conf >/dev/null
sudo systemctl restart systemd-journald

sleep 2
if curl -fsS http://localhost:3500/api/info >/dev/null; then echo "   Nook läuft ✔"; else echo "   ACHTUNG: Nook startet nicht – prüfe mit: journalctl -u nook -n 50"; fi

# --- Tailscale + öffentliche https-Adresse ---
if ! command -v tailscale >/dev/null 2>&1; then
  say "Tailscale wird installiert"
  curl -fsSL https://tailscale.com/install.sh | sh
fi
say "Tailscale-Anmeldung: Öffne den gleich angezeigten Link im Browser und melde dich mit DEINEM Tailscale-Konto an"
sudo tailscale up
say "Öffentliche https-Adresse wird eingerichtet (Tailscale Funnel)"
if ! sudo tailscale funnel --bg 3500; then
  echo "   Falls ein Link zum Aktivieren von Funnel angezeigt wurde: öffnen, bestätigen und danach ausführen:"
  echo "   sudo tailscale funnel --bg 3500"
fi
DNS="$(tailscale status --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).Self.DNSName.replace(/\.$/,""))}catch{console.log("")}})')"

say "FERTIG! 🎉"
echo
echo "   Neue Server-Adresse für alle:   https://$DNS"
echo "   Registrierungscode für Neue:    $REGCODE"
echo "   Admin-Schlüssel (nur für Updates, geheim halten):"
echo "   $(cat nook-data/admin.key)"
echo
echo "   Speicher frei: $(df -h / | awk 'NR==2{print $4}')   (Uploads sind auf 8 GB begrenzt)"
