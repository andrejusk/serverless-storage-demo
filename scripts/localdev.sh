#!/usr/bin/env bash

# Echo script name and environment versions
me=$(basename $0)
echo -e "\n=== Running '$me'...\n"
if (($# > 0)); then
    echo -e "$@\n\n"
fi
echo "Node $(node --version)"
echo "pnpm $(pnpm --version)"

trap "exit" INT TERM ERR
trap "killall background" EXIT

# Set up environment variables
processBucket="srvls-demo-process"
uploadBucket="srvls-demo-upload"
uploadTopic="srvls-demo-upload"
ingestTopic="srvls-demo-ingest"
processTopic="srvls-demo-process"

# cd packages/ingest && \
#     OUTPUT_TOPIC=$ingestTopic \
#     OUTPUT_PREFIX="/local-ingest" \
#     OUTPUT_BUCKET=$processBucket \
#     node src/index.js &
# cd packages/ingest-pdf && \
#     OUTPUT_TOPIC=$processTopic \
#     OUTPUT_PREFIX="/local-pdf" \
#     OUTPUT_BUCKET=$processBucket \
#     node src/index.js &

cd packages/front-end && \
    OUTPUT_BUCKET=$uploadBucket \
    PROCESS_BUCKET=$processBucket \
    UPLOAD_TOPIC=$uploadTopic \
    INGEST_TOPIC=$ingestTopic \
    PROCESS_TOPIC=$processTopic \
    pnpm dev &

wait
