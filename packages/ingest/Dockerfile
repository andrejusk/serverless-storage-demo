FROM node:fermium-bullseye
# RUN apt-get update -y \
#     && apt-get install -y \
#         clamav-daemon \
#         clamav-freshclam \
#         clamdscan \
#         supervisor \
#         --no-install-recommends \
#     && apt-get clean \
#     && rm -rf /var/lib/apt/lists/* \
#     && mkdir /var/run/clamav \
#     && chown clamav:clamav /var/run/clamav \
#     && chmod 750 /var/run/clamav \
#     && sed -i 's/^Foreground .*$/Foreground true/g' /etc/clamav/clamd.conf  \
#     && echo "TCPSocket 3310" >> /etc/clamav/clamd.conf  \
#     && sed -i 's/^Foreground .*$/Foreground true/g' /etc/clamav/freshclam.conf \
#     && freshclam
# VOLUME ["/var/lib/clamav"]
RUN npm i -g pnpm

WORKDIR /usr/src/demo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ingest/package.json packages/ingest/
RUN pnpm install
COPY . .

WORKDIR /usr/src/demo/packages/ingest
RUN pnpm install --prod

# COPY packages/ingest/supervisord.conf /etc/supervisor/conf.d/supervisord-nodejs.conf
# CMD ["/usr/bin/supervisord", "-n"]
CMD ["pnpm", "start"]
