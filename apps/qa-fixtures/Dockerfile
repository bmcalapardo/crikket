FROM oven/bun:1.3.5-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0

COPY package.json bun.lock turbo.json tsconfig.json biome.jsonc ./
COPY apps ./apps
COPY packages ./packages
COPY sdks ./sdks

RUN bun install --frozen-lockfile

EXPOSE 4100

CMD ["bun", "/app/apps/qa-fixtures/src/index.ts"]
