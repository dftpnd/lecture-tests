#!/usr/bin/env bash
# Build (and optionally push/import) the api and frontend images.
#
#   TAG        image tag                          (default: latest)
#   REGISTRY   registry prefix, e.g. ghcr.io/me   (default: empty = local only)
#   IMPORT     k3s | microk8s | ""                import into a single-node cluster
#
# Examples:
#   ./scripts/build.sh                              # build local images
#   REGISTRY=ghcr.io/mgu TAG=v1 ./scripts/build.sh  # build + push
#   IMPORT=k3s ./scripts/build.sh                   # build + import into k3s containerd
set -euo pipefail

cd "$(dirname "$0")/.."

TAG="${TAG:-latest}"
REGISTRY="${REGISTRY:-}"
IMPORT="${IMPORT:-}"

PREFIX=""
[[ -n "$REGISTRY" ]] && PREFIX="${REGISTRY%/}/"

API_IMG="${PREFIX}lecture-tests-api:${TAG}"
FE_IMG="${PREFIX}lecture-tests-frontend:${TAG}"

echo ">> building $API_IMG"
docker build -t "$API_IMG" ./backend

echo ">> building $FE_IMG"
docker build -t "$FE_IMG" ./frontend

if [[ -n "$REGISTRY" ]]; then
  echo ">> pushing to $REGISTRY"
  docker push "$API_IMG"
  docker push "$FE_IMG"
fi

case "$IMPORT" in
  k3s)
    echo ">> importing into k3s containerd"
    for img in "$API_IMG" "$FE_IMG"; do
      docker save "$img" | sudo k3s ctr images import -
    done
    ;;
  microk8s)
    echo ">> importing into microk8s"
    for img in "$API_IMG" "$FE_IMG"; do
      docker save "$img" | microk8s ctr image import -
    done
    ;;
  "")
    ;;
  *)
    echo "unknown IMPORT='$IMPORT' (use k3s|microk8s)" >&2
    exit 1
    ;;
esac

echo
echo "Done. Images:"
echo "  $API_IMG"
echo "  $FE_IMG"
echo
echo "Install/upgrade:"
echo "  helm upgrade -i lt helm/lecture-tests \\"
[[ -n "$REGISTRY" ]] && echo "    --set images.api.repository=${PREFIX}lecture-tests-api --set images.frontend.repository=${PREFIX}lecture-tests-frontend \\"
echo "    --set images.api.tag=${TAG} --set images.frontend.tag=${TAG}"
