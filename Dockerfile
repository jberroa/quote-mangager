# Multi-stage build for Vite SPA (Coolify / generic Docker).
# GEMINI_API_KEY is inlined at build time via vite.config define — pass as build-arg in Coolify.

FROM node:20-alpine AS builder
WORKDIR /app

ARG GEMINI_API_KEY
ENV GEMINI_API_KEY=$GEMINI_API_KEY

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/vite.config.ts ./vite.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

EXPOSE 3000

CMD ["npm", "start"]
