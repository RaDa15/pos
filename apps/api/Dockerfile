FROM node:24-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.20.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/tsconfig.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/api/tsconfig.json ./apps/api/

RUN pnpm install --frozen-lockfile || pnpm install

COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

RUN pnpm --filter @pos/shared build
RUN pnpm --filter @pos/api build

FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

EXPOSE 4000

CMD ["node", "apps/api/dist/server.js"]
