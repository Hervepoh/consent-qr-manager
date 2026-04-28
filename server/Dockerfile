# ─────────────────────────────────────────────
# Stage 1 : Build TypeScript → JavaScript
# ─────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

# Installer toutes les dépendances (dev incluses pour tsc)
RUN npm ci

COPY . .

# Compiler avec le tsconfig.json du projet (outDir=./dist, rootDir=./src)
RUN npx tsc

# ─────────────────────────────────────────────
# Stage 2 : Image de production (légère)
# ─────────────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

# Copier uniquement les manifestes pour installer les deps de prod
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copier le JS compilé depuis le stage builder
COPY --from=builder /app/dist ./dist

# Copier les templates d'e-mail
COPY --from=builder /app/mail ./mail

# Copier la config drizzle pour les migrations en prod
COPY drizzle.config.prod.js ./

# Utilisateur non-root pour la sécurité
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1

CMD ["node", "dist/index.js"]