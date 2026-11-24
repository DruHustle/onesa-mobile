#!/usr/bin/env bash
# Build the API and private gateway from one commit, on the target Docker daemon.
set -euo pipefail

if [[ $# != 2 || ! $1 =~ ^[0-9a-f]{40}$ ]]; then
  echo "Usage: $0 <full-source-commit> <image-receipt.env>" >&2
  exit 2
fi
revision=$1
receipt=$2
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
[[ $(git -C "$root" rev-parse --verify "$revision^{commit}") == "$revision" ]]
source_url=https://github.com/DruHustle/onesa-mobile
scratch=$(mktemp -d)
receipt_tmp=$(mktemp "${receipt}.XXXXXX")
trap 'rm -rf "$scratch"; rm -f "$receipt_tmp"' EXIT

build_image() {
  local name=$1 tree=$2 dockerfile=$3 image_id actual
  git -C "$root" archive --format=tar "$tree" | docker build --pull \
    --file "$dockerfile" --iidfile "$scratch/$name" \
    --label "org.opencontainers.image.source=$source_url" \
    --label "org.opencontainers.image.revision=$revision" - >&2
  image_id=$(cat "$scratch/$name")
  [[ $image_id =~ ^sha256:[0-9a-f]{64}$ ]]
  actual=$(docker image inspect --format '{{.Id}} {{index .Config.Labels "org.opencontainers.image.source"}} {{index .Config.Labels "org.opencontainers.image.revision"}}' "$image_id")
  [[ $actual == "$image_id $source_url $revision" ]]
}

build_image api "$revision:onesa-mobile-backend" Dockerfile
build_image gateway "$revision" infra/runtime/web.Dockerfile
api_image=$(cat "$scratch/api")
gateway_image=$(cat "$scratch/gateway")
printf 'MOBILE_SOURCE_REVISION=%s\nMOBILE_API_IMAGE=%s\nMOBILE_GATEWAY_IMAGE=%s\n' \
  "$revision" "$api_image" "$gateway_image" >"$receipt_tmp"
mv -- "$receipt_tmp" "$receipt"
