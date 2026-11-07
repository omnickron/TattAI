#!/bin/sh
# Daily backup of the database and the customer files (reference images, content),
# keeps 14 days. Cron example (on the server):
#   15 3 * * * /opt/needl/deploy/backup.sh >> /var/log/needl-backup.log 2>&1
set -eu
cd "$(dirname "$0")"
mkdir -p /var/backups/needl
docker compose -f docker-compose.prod.yml --env-file ../.env exec -T db \
  pg_dump -U "${POSTGRES_USER:-needl}" -Fc "${POSTGRES_DB:-needl}" \
  > "/var/backups/needl/needl-$(date +%F).dump"
# Customer files live in the media volume of the app container
docker compose -f docker-compose.prod.yml --env-file ../.env exec -T app \
  tar -czf - -C /data/media . \
  > "/var/backups/needl/media-$(date +%F).tar.gz"
find /var/backups/needl \( -name 'needl-*.dump' -o -name 'media-*.tar.gz' \) -mtime +14 -delete
