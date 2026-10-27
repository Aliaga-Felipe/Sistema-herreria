#!/usr/bin/env bash
# Respaldo de la base de datos y de las fotos subidas desde el panel.
#
# Se corre en el VPS como el usuario "atelier" (lo llama el cron todas las
# noches y también deploy.sh antes de cada actualización):
#
#   bash ~/app/scripts/vps/backup.sh
#
# Deja en ~/backups/diarios un .sql.gz de la base y un .tar.gz de
# server/uploads. Los diarios se guardan 14 días. Los domingos además se
# copia el respaldo a ~/backups/semanales, que se guardan 8 semanas.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/app}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
DIAS_DIARIOS="${DIAS_DIARIOS:-14}"
DIAS_SEMANALES="${DIAS_SEMANALES:-56}"

# DATABASE_URL se lee del .env de la app (sin cargar el resto del archivo).
DATABASE_URL="$(grep -E '^DATABASE_URL=' "$APP_DIR/.env" | tail -n 1 | cut -d= -f2- | tr -d '"'"'"'\r')"
if [ -z "$DATABASE_URL" ]; then
  echo "No se encontró DATABASE_URL en $APP_DIR/.env" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR/diarios" "$BACKUP_DIR/semanales"
chmod 700 "$BACKUP_DIR"
umask 077

fecha="$(date +%F_%H%M)"
archivo_db="$BACKUP_DIR/diarios/db-$fecha.sql.gz"
archivo_fotos="$BACKUP_DIR/diarios/uploads-$fecha.tar.gz"
trap 'rm -f "$archivo_db.tmp" "$archivo_fotos.tmp"' EXIT

pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip > "$archivo_db.tmp"
gzip -t "$archivo_db.tmp"
# Un dump vacío también es un gzip válido: confirmar que tenga contenido real.
if ! gzip -dc "$archivo_db.tmp" | head -n 5 | grep -q 'PostgreSQL database dump'; then
  echo "El respaldo de la base salió vacío. Revisar DATABASE_URL y pg_dump." >&2
  exit 1
fi
mv "$archivo_db.tmp" "$archivo_db"

tar -czf "$archivo_fotos.tmp" -C "$APP_DIR/server" uploads
gzip -t "$archivo_fotos.tmp"
mv "$archivo_fotos.tmp" "$archivo_fotos"

# Domingo: copia semanal.
if [ "$(date +%u)" = "7" ]; then
  cp "$archivo_db" "$archivo_fotos" "$BACKUP_DIR/semanales/"
fi

find "$BACKUP_DIR/diarios" -type f -mtime +"$DIAS_DIARIOS" -delete
find "$BACKUP_DIR/semanales" -type f -mtime +"$DIAS_SEMANALES" -delete

echo "Respaldo listo: $(du -h "$archivo_db" | cut -f1) de base, $(du -h "$archivo_fotos" | cut -f1) de fotos ($fecha)"
