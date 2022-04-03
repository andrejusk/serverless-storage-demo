FROM node:fermium-bullseye
RUN apt-get update -y \
    && apt-get install -y libreoffice=1:7.3.2~rc2-1 --no-install-recommends \
    && apt-get clean \
    && rm /var/lib/apt/lists/* \
    && npm i -g pnpm
WORKDIR /usr/src/demo
COPY package.json pnpm-lock.yaml ./
COPY packages/ingest-pdf/package.json packages/ingest-pdf/
RUN pnpm install --prod
COPY . .
CMD [ "pnpm", "start" ]
