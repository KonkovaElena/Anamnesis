# syntax=docker/dockerfile:1

# ---- Build stage ----
FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ---- Production stage ----
FROM node:24-alpine

RUN apk add --no-cache tini \
 && addgroup -S anamnesis \
 && adduser -S anamnesis -G anamnesis

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
 && npm cache clean --force

COPY --from=build /app/dist/ ./dist/

USER anamnesis

ENV PORT=4020
EXPOSE 4020

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4020/healthz || exit 1

ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/index.js"]
