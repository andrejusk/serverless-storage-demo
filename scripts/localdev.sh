#!/usr/bin/env bash

# Echo script name and environment versions
me=$(basename $0)
echo -e  "\n=== Running '$me'...\n"
if (($# > 0)); then
    echo -e "$@\n\n"
fi
echo "Node $(node --version)"
echo "pnpm $(pnpm --version)"

exit 1

trap "exit" INT TERM ERR
trap "killall background" EXIT

# TODO subscribe ingest topic, set test bucket env path
node packages/ingest-pdf/src/index.js

node packages/ingest/src/index.js

# TODO watch remix build, run express server
node packages/front-end/src/index.js
