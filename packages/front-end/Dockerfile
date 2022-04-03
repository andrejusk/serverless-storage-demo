FROM node:fermium-bullseye
RUN apt-get update -y \
    && apt-get clean \
    && rm /var/lib/apt/lists/* \
    && npm i -g pnpm
WORKDIR /usr/src/demo
COPY package.json pnpm-lock.yaml ./
COPY packages/front-end/package.json packages/front-end/
RUN pnpm install --prod
COPY . .
CMD [ "pnpm", "start" ]
