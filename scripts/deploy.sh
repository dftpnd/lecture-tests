#!/usr/bin/env bash
# One command to ship a change: bump semver -> build -> import into containerd ->
# helm upgrade -> wait for the rollout. The image tag in values.yaml is the source
# of truth; this bumps it (patch by default) and rolls it into the `lt` release.
#
# Building/importing is delegated to build.sh (same tags, same containerd import).
# The helm step uses --reuse-values + --set images.<c>.tag=... so ONLY the image
# changes — no risk of disturbing minio/vllm/secret overrides in the live release.
#
# Usage:
#   ./scripts/deploy.sh frontend                 # bump frontend patch, build + deploy
#   ./scripts/deploy.sh api worker               # several at once (each patch-bumped)
#   ./scripts/deploy.sh frontend --minor         # bump minor (x.Y.0) instead of patch
#   ./scripts/deploy.sh frontend --major         # bump major (X.0.0)
#   ./scripts/deploy.sh frontend=1.13.0          # explicit version, no auto-bump
#   DRY_RUN=1 ./scripts/deploy.sh frontend       # print the plan, change nothing
#
# The bumped tag is written back into values.yaml — commit it so git history keeps
# matching the deployed version (as the "bump frontend X.Y.Z" commits already do).
set -euo pipefail
cd "$(dirname "$0")/.."

RELEASE=lt
NAMESPACE=lectures
CHART=helm/lecture-tests
VALUES="$CHART/values.yaml"
DRY_RUN="${DRY_RUN:-}"

say()  { printf '\033[1;36m>> %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m!! %s\033[0m\n' "$*" >&2; exit 1; }

# Read images.<comp>.tag from values.yaml (2-space component, 4-space keys).
current_tag() {
  awk -v comp="$1" '
    /^images:/            { inimg=1; next }
    inimg && /^[^ ]/      { inimg=0 }
    inimg && $0 ~ "^  " comp ":" { incomp=1; next }
    inimg && /^  [a-zA-Z]/ { incomp=0 }
    incomp && $1=="tag:"  { print $2; exit }
  ' "$VALUES"
}

# Write images.<comp>.tag = <ver> in place (first tag: within the component block).
set_tag() {
  local comp="$1" ver="$2" tmp; tmp="$(mktemp)"
  awk -v comp="$comp" -v ver="$ver" '
    /^images:/            { inimg=1 }
    inimg && /^[^ ]/ && !/^images:/ { inimg=0 }
    inimg && $0 ~ "^  " comp ":" { incomp=1 }
    inimg && /^  [a-zA-Z]/ && $0 !~ "^  " comp ":" { incomp=0 }
    incomp && !done && /^    tag:/ { sub(/tag:.*/, "tag: " ver); done=1 }
    { print }
  ' "$VALUES" > "$tmp" && mv "$tmp" "$VALUES"
}

bump() {  # $1=x.y.z  $2=patch|minor|major
  local x y z; IFS=. read -r x y z <<<"$1"
  [[ "$x" =~ ^[0-9]+$ && "$y" =~ ^[0-9]+$ && "$z" =~ ^[0-9]+$ ]] || die "bad semver '$1'"
  case "$2" in
    patch) z=$((z+1)) ;;
    minor) y=$((y+1)); z=0 ;;
    major) x=$((x+1)); y=0; z=0 ;;
  esac
  echo "$x.$y.$z"
}

# --- parse args: components (optionally name=ver) + one bump level -------------
LEVEL=patch
declare -a COMPS=()
for arg in "$@"; do
  case "$arg" in
    --patch|--minor|--major) LEVEL="${arg#--}" ;;
    api|worker|frontend)     COMPS+=("$arg") ;;
    api=*|worker=*|frontend=*) COMPS+=("$arg") ;;
    *) die "unknown arg '$arg' (components: api|worker|frontend; levels: --patch|--minor|--major; or name=version)" ;;
  esac
done
[[ ${#COMPS[@]} -gt 0 ]] || die "usage: $0 <component> [<component>...] [--minor|--major]"

# --- resolve target versions --------------------------------------------------
declare -a BUILD_ARGS=() SET_ARGS=() PLAN=()
for c in "${COMPS[@]}"; do
  if [[ "$c" == *=* ]]; then
    name="${c%%=*}"; ver="${c#*=}"
  else
    name="$c"; cur="$(current_tag "$name")"; [[ -n "$cur" ]] || die "no tag for '$name' in $VALUES"
    ver="$(bump "$cur" "$LEVEL")"
  fi
  BUILD_ARGS+=("$name=$ver")
  SET_ARGS+=(--set "images.${name}.tag=${ver}")
  PLAN+=("$name -> $ver")
done

say "Plan (${LEVEL}): ${PLAN[*]}"
if [[ -n "$DRY_RUN" ]]; then say "DRY_RUN set — stopping before build/deploy."; exit 0; fi

# --- 1. write tags into values.yaml (git source of truth) ---------------------
for c in "${COMPS[@]}"; do
  [[ "$c" == *=* ]] && { name="${c%%=*}"; ver="${c#*=}"; } || {
    name="$c"; ver="$(bump "$(current_tag "$name")" "$LEVEL")"; }
  set_tag "$name" "$ver"
done
say "values.yaml updated — remember to commit it."

# --- 2. build + import into the node's containerd (delegated to build.sh) ------
say "Building: ${BUILD_ARGS[*]}"
./scripts/build.sh "${BUILD_ARGS[@]}"

# --- 3. roll it into the live release (only image tags change) -----------------
say "helm upgrade $RELEASE ($NAMESPACE)"
helm upgrade "$RELEASE" "$CHART" -n "$NAMESPACE" --reuse-values "${SET_ARGS[@]}" --wait

# --- 4. wait for each rollout -------------------------------------------------
for c in "${COMPS[@]}"; do
  name="${c%%=*}"
  say "rollout: lecture-tests-$name"
  kubectl -n "$NAMESPACE" rollout status "deploy/lecture-tests-$name" --timeout=180s
done
say "Deployed: ${PLAN[*]}"
