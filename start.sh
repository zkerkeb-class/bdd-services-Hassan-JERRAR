#!/bin/bash

set -e

echo "🚀 Démarrage du Business Microservice ZenBilling..."

# Attendre que PostgreSQL soit prêt
echo "⏳ Attente de la base de données..."
until npx prisma db push --preview-feature > /dev/null 2>&1; do
  echo "📊 Base de données non prête, attente 2 secondes..."
  sleep 2
done

echo "✅ Base de données prête!"

# Appliquer les migrations Prisma
echo "🔄 Application des migrations Prisma..."
npx prisma db push

# Générer le client Prisma (au cas où)
echo "🔧 Génération du client Prisma..."
npx prisma generate

# Optionnel: Seed de la base de données en développement
if [ "$NODE_ENV" = "development" ]; then
  echo "🌱 Seeding de la base de données (mode développement)..."
  # npx prisma db seed || echo "⚠️  Pas de script de seed configuré"
fi

echo "🎉 Business Microservice prêt à démarrer!"

# Démarrer l'application
exec node dist/app.js 