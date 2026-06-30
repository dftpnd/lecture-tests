#!/usr/bin/env bash
# Build (and import/push) the project images, each with its own semver tag.
#
# Images are versioned INDEPENDENTLY — bump only what changed:
#   api       backend Dockerfile          (FastAPI)
#   worker    backend Dockerfile.worker   (CUDA + faster-whisper)
#   frontend  frontend Dockerfile         (React/nginx)
#
# Usage:
#   ./scripts/build.sh api=1.1.0                   # build+import just api 1.1.0
#   ./scripts/build.sh api=1.1.0 frontend=1.0.0    # several at once
#   IMPORT= ./scripts/build.sh api=1.1.0           # build only, skip import
#   REGISTRY=ghcr.io/mgu ./scripts/build.sh api=1.1.0   # also push
#
# IMPORT (how to load into the cluster's container runtime):
#   containerd  (default)  sudo ctr -n k8s.io images import   # kubeadm/k3s node here
#   k3s | microk8s         their respective import commands
#   ""                     don't import (e.g. when REGISTRY pushes instead)
set -euo pipefail

cd "$(dirname "$0")/.."

REGISTRY="${REGISTRY:-}"
IMPORT="${IMPORT-containerd}"   # note: ${VAR-default} so `IMPORT=` means empty
PREFIX=""
[[ -n "$REGISTRY" ]] && PREFIX="${REGISTRY%/}/"

[[ $# -gt 0 ]] || { echo "usage: $0 <component>=<version> [...]  (component: api|worker|frontend)" >&2; exit 1; }

build_one() {
  local name="$1" ver="$2" img
  img="${PREFIX}lecture-tests-${name}:${ver}"
  case "$name" in
    api)      echo ">> building $img"; docker build -t "$img" ./backend ;;
    worker)   echo ">> building $img"; docker build -f backend/Dockerfile.worker -t "$img" ./backend ;;
    frontend) echo ">> building $img"; docker build -t "$img" ./frontend ;;
    *) echo "unknown component '$name' (api|worker|frontend)" >&2; exit 1 ;;
  esac

  if [[ -n "$REGISTRY" ]]; then
    echo ">> pushing $img"; docker push "$img"
  fi

  case "$IMPORT" in
    containerd) docker save "$img" | sudo ctr -n k8s.io images import - ;;
    k3s)        docker save "$img" | sudo k3s ctr images import - ;;
    microk8s)   docker save "$img" | microk8s ctr image import - ;;
    "")         ;;
    *) echo "unknown IMPORT='$IMPORT' (containerd|k3s|microk8s|'')" >&2; exit 1 ;;
  esac
  echo "  done: $img"
}

declare -a SETS=()
for arg in "$@"; do
  [[ "$arg" == *=* ]] || { echo "bad arg '$arg' (expected name=version)" >&2; exit 1; }
  name="${arg%%=*}"; ver="${arg#*=}"
  build_one "$name" "$ver"
  SETS+=("--set images.${name}.tag=${ver}")
done

echo
echo "Deploy:"
echo "  helm upgrade lt helm/lecture-tests -n lectures --reuse-values \\"
echo "    ${SETS[*]} --wait"
