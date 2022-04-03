FROM node:fermium-bullseye
RUN apt-get update -y \
    # TODO clamav?
    # && apt-get install -y libreoffice \
    && apt-get clean \
    && rm /var/lib/apt/lists/* \
    && npm i -g pnpm
WORKDIR /usr/src/demo
COPY package.json pnpm-lock.yaml ./
COPY packages/ingest/package.json packages/ingest/
RUN pnpm install --prod
COPY . .
CMD [ "pnpm", "start" ]
