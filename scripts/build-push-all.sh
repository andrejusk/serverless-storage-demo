#!/usr/bin/env bash
set -o pipefail

# List of packages that should be built as Docker images
# and pushed to Google Container Registry (GCR)
declare -a pkgs=("ingest" "ingest-pdf" "front-end")

# Echo script name and environment versions
me=$(basename $0)
echo -e  "\n=== Running '$me'...\n"
if (($# > 0)); then
    echo -e "$@\n\n"
fi
docker --version

# Attempt to sign in
gcloud auth configure-docker --quiet

# Define image variables
PREFIX=${PREFIX:-"srvls-demo"}
GCR_REGION=${GCR_REGION:-"eu.gcr.io"}
GCP_PROJECT=${GCP_PROJECT:-"andrejus-web"}

# Build and push all packages using above variables
for pkg in "${pkgs[@]}"
do
    echo "Building '${pkg}'..."
    docker buildx build . \
        --file packages/${pkg}/Dockerfile \
        --tag ${GCR_REGION}/${GCP_PROJECT}/${PREFIX}-${pkg}:latest \
        --push
done

# Apply latest images to Cloud Run services
for pkg in "${pkgs[@]}"
do
    echo "Deploying '${pkg}'..."
    gcloud run services update ${PREFIX}-${pkg} \
        --region=europe-west2 \
        --image=${GCR_REGION}/${GCP_PROJECT}/${PREFIX}-${pkg}:latest
done
