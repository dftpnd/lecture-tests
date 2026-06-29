# Sealed secrets

Keeps DB/MinIO credentials out of `values.yaml` and out of plain git. The
[sealed-secrets](https://github.com/bitnami-labs/sealed-secrets) controller
decrypts a committed `SealedSecret` into the real `lecture-tests-secret` in-cluster.

## One-time: install the controller

```bash
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets
helm install sealed-secrets sealed-secrets/sealed-secrets -n kube-system
# kubeseal CLI:
#   https://github.com/bitnami-labs/sealed-secrets/releases
```

## Create / rotate the secret

```bash
cp secret.example.yaml secret.plain.yaml   # gitignored
# edit secret.plain.yaml with real values
./seal.sh                                  # -> sealed-secret.yaml (safe to commit)
kubectl apply -f sealed-secret.yaml
```

## Install the chart using it

```bash
helm install lt ../lecture-tests --set secret.create=false
```

With `secret.create=false` the chart does NOT render its own Secret — it expects
`lecture-tests-secret` to already exist (created by the controller from the
SealedSecret). The plaintext `secret.plain.yaml` must never be committed; only
`sealed-secret.yaml` is safe.
