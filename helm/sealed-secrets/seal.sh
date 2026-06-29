#!/usr/bin/env bash
# Encrypt secret.plain.yaml into a SealedSecret that is safe to commit.
# Requires: kubeseal + a running sealed-secrets controller in the cluster.
set -euo pipefail

cd "$(dirname "$0")"

PLAIN="secret.plain.yaml"
OUT="sealed-secret.yaml"
CONTROLLER_NS="${CONTROLLER_NS:-kube-system}"
CONTROLLER_NAME="${CONTROLLER_NAME:-sealed-secrets-controller}"

if [[ ! -f "$PLAIN" ]]; then
  echo "ERROR: $PLAIN not found. Copy secret.example.yaml -> $PLAIN and fill in real values."
  exit 1
fi

kubeseal \
  --controller-namespace "$CONTROLLER_NS" \
  --controller-name "$CONTROLLER_NAME" \
  --format yaml \
  < "$PLAIN" > "$OUT"

echo "Wrote $OUT — safe to commit."
echo "Apply with:  kubectl apply -f $OUT"
echo "Then install the chart with: --set secret.create=false"
