# ---- deps: install once, cached on the lockfile alone ----
FROM node:22-alpine AS deps
RUN corepack enable pnpm
WORKDIR /app
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# ---- build ----
FROM node:22-alpine AS build
RUN corepack enable pnpm
WORKDIR /app
ENV DOCKER_BUILD=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ---- run: standalone output only, no node_modules, non-root ----
FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
