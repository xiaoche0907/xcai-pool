# Build web assets
FROM node:24-bookworm-slim AS web
WORKDIR /repo
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm config set store-dir /pnpm-store && pnpm fetch
COPY apps apps
COPY packages packages
COPY tools tools
RUN pnpm install --frozen-lockfile --offline && \
    node_modules/.bin/vite build --config apps/admin-web/vite.config.ts

# Runtime
FROM node:24-bookworm-slim
WORKDIR /repo
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm config set store-dir /pnpm-store && pnpm fetch
COPY apps apps
COPY packages packages
COPY tools tools
COPY drizzle.config.ts ./
RUN pnpm install --frozen-lockfile --offline --ignore-scripts
COPY --from=web /repo/dist dist

EXPOSE 4310
CMD ["node_modules/.bin/tsx", "apps/api-server/src/main.ts"]
