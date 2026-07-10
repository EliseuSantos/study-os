# node base: wrangler's dev server does not support running under bun —
# bun is installed only for install/build (the repo's package manager).
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl unzip ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile && bun x turbo build --filter=pwa

WORKDIR /app/apps/worker
EXPOSE 8787
ENTRYPOINT ["/app/.pve/entrypoint.sh"]
