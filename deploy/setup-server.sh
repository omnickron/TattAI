#!/usr/bin/env bash
# One-time setup of a fresh Hetzner Cloud server (Ubuntu 24.04), run as root:
#   curl -fsSL https://raw.githubusercontent.com/... | bash   (or copy this file over)
# Installs Docker, firewall, swap and automatic security updates, then clones the app.
set -euo pipefail

REPO="${REPO:-git@github.com:omnickron/TattAI.git}"
BRANCH="${BRANCH:-claude/new-session-ti5a92}"
DIR="${DIR:-/opt/needl}"

echo "==> System aktualisieren"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get -y -q upgrade
apt-get install -y -q ca-certificates curl git ufw unattended-upgrades openssl
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> Docker installieren"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

echo "==> Firewall: nur SSH, HTTP und HTTPS"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> Auslagerungsspeicher (2 GB, für den Build)"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Zugang zum GitHub-Repository (Deploy-Key, nur lesen)"
mkdir -p /root/.ssh && chmod 700 /root/.ssh
if [ ! -f /root/.ssh/needl_deploy ]; then
  ssh-keygen -q -t ed25519 -N "" -f /root/.ssh/needl_deploy -C "needl-server"
fi
if ! grep -q needl_deploy /root/.ssh/config 2>/dev/null; then
  printf 'Host github.com\n  IdentityFile /root/.ssh/needl_deploy\n  IdentitiesOnly yes\n' >> /root/.ssh/config
fi
ssh-keyscan -t ed25519 github.com >> /root/.ssh/known_hosts 2>/dev/null

if [ ! -d "$DIR/.git" ]; then
  echo
  echo "Diesen Schlüssel bei GitHub eintragen:"
  echo "  Repository → Settings → Deploy keys → Add deploy key (Titel: needl-server, NICHT 'Allow write access')"
  echo
  cat /root/.ssh/needl_deploy.pub
  echo
  read -rp "Enter drücken, sobald der Schlüssel eingetragen ist … " _ < /dev/tty
  git clone --branch "$BRANCH" "$REPO" "$DIR"
fi

echo "==> Tägliches Datenbank-Backup (03:15 Uhr, 14 Tage)"
chmod +x "$DIR/deploy/"*.sh
echo "15 3 * * * root $DIR/deploy/backup.sh >> /var/log/needl-backup.log 2>&1" > /etc/cron.d/needl-backup

echo
echo "Fertig. Weiter mit:"
echo "  cd $DIR && bash deploy/make-env.sh"
