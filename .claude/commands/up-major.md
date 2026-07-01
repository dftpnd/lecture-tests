---
description: Bump MAJOR of frontend + backend api, rebuild, redeploy, restart pods
allowed-tools: Bash(./scripts/deploy.sh:*)
---
Ship a major release of the app. Run the project deploy script to bump the **major**
version of the frontend and backend API together (X.y.z → X+1.0.0), rebuild their
images, import into the node's containerd, `helm upgrade` the `lt` release, and wait
for the pods to roll:

Run: `./scripts/deploy.sh frontend api --major $ARGUMENTS`

Notes:
- `worker` (GPU image) is intentionally excluded to avoid a needless whisper reload.
  To include it this once, invoke as `/up-major worker` ($ARGUMENTS is appended).
- Report the resulting versions and rollout status. The script writes the new tags
  into values.yaml but does NOT commit — do not commit unless I ask.
