FROM node:fermium-bullseye
RUN apt-get update -y \
    && apt-get install -y libreoffice --no-install-recommends \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && npm i -g pnpm

WORKDIR /usr/src/demo
COPY package.json pnpm-lock.yaml ./
COPY packages/ingest-pdf/package.json packages/ingest-pdf/
RUN pnpm install --prod
COPY . .

WORKDIR /usr/src/demo/packages/ingest-pdf
RUN pnpm install --prod
CMD [ "pnpm", "start" ]
