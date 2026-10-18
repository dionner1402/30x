# EzAllow API — imagen mínima (F0.3)
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm --filter @ezallow/shared build \
 && pnpm --filter @ezallow/domain build \
 && pnpm --filter @ezallow/api build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate
COPY --from=build /app /app
EXPOSE 3001
CMD ["pnpm", "--filter", "@ezallow/api", "start"]
