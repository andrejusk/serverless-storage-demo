FROM node:fermium-bullseye
RUN apt-get update -y \
    && apt-get install -y clamav clamav-daemon --no-install-recommends \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && npm i -g pnpm \
    && freshclam

WORKDIR /usr/src/demo
COPY package.json pnpm-lock.yaml ./
COPY packages/ingest/package.json packages/ingest/
RUN pnpm install
# FIXME systemctl start clamav-freshclam ?
COPY . .

WORKDIR /usr/src/demo/packages/ingest
RUN pnpm install --prod
CMD [ "pnpm", "start" ]
