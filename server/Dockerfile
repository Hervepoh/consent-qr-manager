# ─────────────────────────────────────────────
# Stage 1 : Build TypeScript → JavaScript
# ─────────────────────────────────────────────
FROM node:22-alpine AS builder
 
WORKDIR /app
 
COPY package*.json ./
 
# Installer toutes les dépendances (dev incluses pour tsc)
RUN npm ci
 
COPY . .
 
# Compiler le TypeScript
RUN npx tsc --outDir dist --skipLibCheck
 
# ─────────────────────────────────────────────
# Stage 2 : Image de production (légère)
# ─────────────────────────────────────────────
FROM node:22-alpine AS production
 
WORKDIR /app
 
# Copier uniquement les dépendances de production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
 
# Copier le JS compilé
COPY --from=builder /app/dist ./dist
 
# Utilisateur non-root pour la sécurité
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser
 
EXPOSE 3001
 
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1
 
CMD ["node", "dist/index.js"]