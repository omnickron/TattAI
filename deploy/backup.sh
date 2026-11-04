#!/bin/sh
# Daily database dump, keeps 14 days. Cron example (on the server):
#   15 3 * * * /opt/needl/deploy/backup.sh >> /var/log/needl-backup.log 2>&1
set -eu
cd "$(dirname "$0")"
mkdir -p /var/backups/needl
docker compose -f docker-compose.prod.yml --env-file ../.env exec -T db \
  pg_dump -U "${POSTGRES_USER:-needl}" -Fc "${POSTGRES_DB:-needl}" \
  > "/var/backups/needl/needl-$(date +%F).dump"
find /var/backups/needl -name 'needl-*.dump' -mtime +14 -delete
