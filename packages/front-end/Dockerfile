FROM node:fermium-bullseye
RUN apt-get update -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && npm i -g pnpm

WORKDIR /usr/src/demo
COPY package.json pnpm-lock.yaml ./
COPY packages/front-end/package.json packages/front-end/
RUN pnpm install
COPY . .

WORKDIR /usr/src/demo/packages/front-end
RUN pnpm build
RUN pnpm install --prod
CMD [ "pnpm", "start" ]
