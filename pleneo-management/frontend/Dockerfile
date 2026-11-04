FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
RUN npm ci --workspace frontend --include-workspace-root

FROM node:22-alpine AS build
WORKDIR /repo
ARG NEXT_PUBLIC_BFF_URL=http://localhost:4100
ENV NEXT_PUBLIC_BFF_URL=$NEXT_PUBLIC_BFF_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /repo/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY frontend ./frontend
COPY --from=deps /repo/frontend/node_modules ./frontend/node_modules
RUN npm run build --workspace frontend

FROM node:22-alpine
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /repo/frontend/.next/standalone ./
COPY --from=build /repo/frontend/.next/static ./frontend/.next/static
COPY --from=build /repo/frontend/public ./frontend/public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3000/login || exit 1
CMD ["node", "frontend/server.js"]
