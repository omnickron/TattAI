#!/bin/sh
# Daily database dump, keeps 14 days. Cron example (on the server):
#   15 3 * * * /opt/tattai/deploy/backup.sh >> /var/log/tattai-backup.log 2>&1
set -eu
cd "$(dirname "$0")"
mkdir -p /var/backups/tattai
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U "${POSTGRES_USER:-tattai}" -Fc "${POSTGRES_DB:-tattai}" \
  > "/var/backups/tattai/tattai-$(date +%F).dump"
find /var/backups/tattai -name 'tattai-*.dump' -mtime +14 -delete
