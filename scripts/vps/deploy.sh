#!/usr/bin/env bash
# Actualiza la app en el VPS con lo último de la rama main.
#
# Se corre como el usuario "atelier":
#
#   bash ~/app/scripts/vps/deploy.sh
#
# Pasos: respaldo, git pull, npm ci, build, schema y reinicio en PM2. Después
# verifica que la app responda; si no responde, vuelve a la versión anterior
# del código (la base no se toca: schema.sql sólo agrega, y queda el respaldo
# recién hecho por si hiciera falta).
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/app}"
RAMA="${RAMA:-main}"
PM2_NOMBRE="${PM2_NOMBRE:-atelier}"
URL_SALUD="${URL_SALUD:-http://localhost:3001/api/publico/productos}"

cd "$APP_DIR"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Hay cambios sin guardar en $APP_DIR (git status). No se actualiza." >&2
  exit 1
fi

git fetch origin "$RAMA"
anterior="$(git rev-parse HEAD)"
nueva="$(git rev-parse "origin/$RAMA")"

if [ "$anterior" = "$nueva" ]; then
  echo "Ya está en la última versión ($(git log -1 --format='%h %s'))."
  exit 0
fi

echo "== Cambios a desplegar =="
git log --oneline "$anterior..$nueva"

echo "== Respaldo previo =="
bash "$APP_DIR/scripts/vps/backup.sh"

instalar() {
  npm ci
  npm run build
}

responde() {
  for _ in $(seq 1 15); do
    if curl -fsS -o /dev/null "$URL_SALUD"; then return 0; fi
    sleep 2
  done
  return 1
}

echo "== Actualizando a $(git log -1 --format='%h %s' "$nueva") =="
git merge --ff-only "origin/$RAMA"
instalar
node server/scripts/aplicar-schema.js
pm2 reload "$PM2_NOMBRE" --update-env

if responde; then
  pm2 save >/dev/null
  echo "== Listo: la app responde con la versión $(git rev-parse --short HEAD) =="
  exit 0
fi

echo "== La app no responde. Volviendo a la versión $(git rev-parse --short "$anterior") ==" >&2
pm2 logs "$PM2_NOMBRE" --lines 40 --nostream >&2 || true
git reset --hard "$anterior"
instalar
pm2 reload "$PM2_NOMBRE" --update-env
if responde; then
  echo "Se volvió a la versión anterior y la app responde. Revisar el error de arriba." >&2
else
  echo "La versión anterior tampoco responde. Revisar con: pm2 logs $PM2_NOMBRE" >&2
fi
exit 1
