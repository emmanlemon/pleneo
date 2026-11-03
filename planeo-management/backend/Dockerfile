FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --omit=dev --workspace backend --include-workspace-root

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /repo/backend
RUN addgroup -S app && adduser -S app -G app
COPY --from=deps /repo/node_modules /repo/node_modules
COPY backend/package.json ./
COPY backend/src ./src
USER app
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:4100/health || exit 1
CMD ["node", "src/server.js"]
