# GPU time-slicing

One physical RTX 5080 must serve two GPU consumers in this project:
the Whisper worker (~3 GB) and the vLLM/Qwen pod (~10 GB). By default k8s gives
a whole GPU to a single pod, so we enable **time-slicing** to share it.

## 1. Apply the config

```bash
kubectl apply -f time-slicing-config.yaml
```

## 2. Tell the device plugin to use it

**If you use the NVIDIA GPU Operator** (most common):

```bash
kubectl patch clusterpolicy/cluster-policy \
  -n gpu-operator --type merge \
  -p '{"spec":{"devicePlugin":{"config":{"name":"time-slicing-config","default":"any"}}}}'
```

**If you run the standalone `nvidia-device-plugin` Helm chart:**

```bash
helm upgrade -i nvdp nvdp/nvidia-device-plugin \
  -n kube-system \
  --set-file config.map.config=time-slicing-config.yaml \
  --set config.default=any
```

## 3. Verify

```bash
kubectl describe node <gpu-node> | grep nvidia.com/gpu
# Allocatable should now show 4 (replicas) instead of 1.
```

After this, both the worker (`nvidia.com/gpu: 1`) and the vLLM pod schedule on
the same card. Remember: VRAM is shared, not split — keep the resident models
within 16 GB.
