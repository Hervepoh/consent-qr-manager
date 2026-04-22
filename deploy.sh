#!/bin/bash
set -e

# ═══════════════════════════════════════════════════
#  deploy.sh — Déploiement complet (frontend + server + mysql)
#  Usage: ./deploy.sh [tag]
# ═══════════════════════════════════════════════════

TAG="${1:-latest}"

echo ""
echo "🚀  Déploiement complet — tag: $TAG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Vérifier que .env existe
if [ ! -f ".env" ]; then
  echo "❌  Fichier .env introuvable !"
  echo "   → Copiez .env.example en .env et remplissez les valeurs :"
  echo "   cp .env.example .env"
  exit 1
fi

# 1. Build des images
echo ""
echo "📦  [1/4] Build des images Docker..."
docker compose build --parallel

# 2. Arrêter les containers existants
echo ""
echo "⏹   [2/4] Arrêt des containers existants..."
docker compose down --remove-orphans 2>/dev/null || true

# 3. Démarrer tous les services
echo ""
echo "▶️   [3/4] Démarrage de tous les services..."
docker compose up -d

# 4. Vérification des healthchecks
echo ""
echo "🏥  [4/4] Vérification des healthchecks..."

check_health() {
  local service=$1
  local max=20
  local i=0
  echo -n "   $service "
  until [ "$(docker inspect --format='{{.State.Health.Status}}' "consent-$service" 2>/dev/null)" = "healthy" ]; do
    i=$((i + 1))
    if [ $i -ge $max ]; then
      echo " ❌"
      echo ""
      echo "Logs de $service :"
      docker compose logs --tail=30 "$service"
      exit 1
    fi
    echo -n "."
    sleep 3
  done
  echo " ✅"
}

check_health "mysql"
check_health "server"
check_health "frontend"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅  Déploiement réussi !"
echo ""
echo "   🌐  Frontend  → http://localhost"
echo "   🔌  API       → http://localhost:3000"
echo "   🗄️   MySQL     → localhost:3306"
echo ""
