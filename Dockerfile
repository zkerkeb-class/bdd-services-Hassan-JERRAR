# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./
COPY tsconfig.json ./

# Installer les dépendances
RUN npm ci --only=production

# Copier le code source
COPY src/ ./src/
COPY prisma/ ./prisma/

# Générer le client Prisma
RUN npx prisma generate

# Compiler TypeScript
RUN npm run build

# Stage 2: Production
FROM node:18-alpine AS production

# Installer dumb-init pour une gestion propre des signaux
RUN apk add --no-cache dumb-init

# Créer un utilisateur non-root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S businessapp -u 1001

WORKDIR /app

# Copier les dépendances depuis le stage de build
COPY --from=builder --chown=businessapp:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=businessapp:nodejs /app/dist ./dist
COPY --from=builder --chown=businessapp:nodejs /app/package*.json ./
COPY --from=builder --chown=businessapp:nodejs /app/prisma ./prisma

# Copier le script de démarrage
COPY --chown=businessapp:nodejs start.sh ./
RUN chmod +x start.sh

# Variables d'environnement par défaut
ENV NODE_ENV=production
ENV PORT=3001

# Exposer le port
EXPOSE 3001

# Changer vers l'utilisateur non-root
USER businessapp

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Utiliser dumb-init comme PID 1
ENTRYPOINT ["dumb-init", "--"]

# Commande de démarrage
CMD ["./start.sh"] 