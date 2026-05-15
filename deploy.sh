#!/usr/bin/env bash
# Déploiement sur VPS avec Traefik (réseau ecosystem-network).
# Usage : ./deploy.sh [--no-pull] [--logs]
#
# - Pull la branche courante depuis origin (sauf --no-pull).
# - Reconstruit l'image Docker, redémarre le conteneur.
# - Affiche le statut final, et suit les logs si --logs.

set -euo pipefail

cd "$(dirname "$0")"

PULL=1
FOLLOW_LOGS=0
for arg in "$@"; do
  case "$arg" in
    --no-pull) PULL=0 ;;
    --logs)    FOLLOW_LOGS=1 ;;
    -h|--help)
      sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "Argument inconnu : $arg" >&2; exit 2 ;;
  esac
done

if ! docker network inspect ecosystem-network >/dev/null 2>&1; then
  echo "[deploy] ⚠  Le réseau Docker 'ecosystem-network' est introuvable."
  echo "          Vérifiez que Traefik est lancé et que ce réseau existe avant de réessayer."
  exit 1
fi

if [ "$PULL" -eq 1 ] && [ -d .git ]; then
  branch="$(git rev-parse --abbrev-ref HEAD)"
  echo "[deploy] git pull origin $branch"
  git pull --ff-only origin "$branch"
fi

echo "[deploy] docker compose build"
docker compose build

echo "[deploy] docker compose down"
docker compose down

echo "[deploy] docker compose up -d"
docker compose up -d

echo
echo "[deploy] Statut :"
docker compose ps

echo
echo "[deploy] OK. Le service est exposé via Traefik sur https://${DOMAIN:-latelier.bercy.matge.com}"

if [ "$FOLLOW_LOGS" -eq 1 ]; then
  echo
  echo "[deploy] Suivi des logs (Ctrl+C pour quitter)"
  docker compose logs -f --tail=50
fi
