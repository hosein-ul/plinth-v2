# Runs the Plinth API, and optionally the background worker in the same process (RUN_WORKER=true). Do not run API+worker in the same process AND a separate worker: one relayer key needs one active worker per network (docs/operations.md). Runs as the unprivileged `node` user.
FROM node:24-slim
RUN npm install -g pnpm@12.8.1
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/worker ./apps/worker
COPY deployments ./deployments
RUN pnpm install --frozen-lockfile --filter @plinth/api... --filter @plinth/worker...
RUN chown -R node:node /app
USER node
ENV NODE_ENV=production
EXPOSE 10000
CMD ["pnpm", "--filter", "@plinth/api", "start"]
