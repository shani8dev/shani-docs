---
title: GPU Acceleration & HPC Containers
section: Software & Apps
updated: 2026-08-29
---

# GPU Acceleration & HPC Containers

Shanios is an immutable OS built for reproducibility. GPU drivers are pre-installed and OS-managed, while heavy user-space stacks (CUDA, ROCm, OpenMPI, NCCL) run **exclusively in containers or Apptainer images**. This keeps the host lean and makes research environments fully portable.

## 📋 Quick-Start Decision Framework

| Goal | Recommended Runtime | Why |
|---|---|---|
| **Interactive IDE / Jupyter / debugging** | **Distrobox** | Shares home dir, inherits host `/dev` nodes, no CDI config needed |
| **One-off test / benchmark / CI** | **Podman** | Rootless by default, CDI spec auto-propagates via `shani-deploy`, no persistent fs |
| **HPC cluster / SLURM / distributed** | **Apptainer** | `.sif` standard, rootless by cluster requirement, `--nv` auto-injects host driver |
| **AI inference serving (vLLM / Ollama)** | **Podman** | `--device nvidia.com/gpu=all` + `--security-opt=label=disable`; persists in `@containers` Btrfs |
| **Max compatibility (mixed CUDA/ROCm apps)** | **Distrobox** | Shares host GPU stack; use `--device=/dev/kfd --device=/dev/dri` inside for ROCm |

---

## 🟢 NVIDIA CUDA + OpenCL

### 1. Verify Host Driver

```bash
nvidia-smi
clinfo | grep -i nvidia   # Verify OpenCL platform
```

### 2. Container Toolkit and CDI Spec

`nvidia-container-toolkit` is **not pre-installed** on the base system, and the immutable root cannot accept a `pacman -S` install. For raw rootless Podman you must add it as a system-level change; the reliable, supported path — which needs **no CDI setup at all** — is to run NVIDIA work through **Distrobox**, which injects the host driver and handles CDI automatically. If your workflow requires raw Podman on NVIDIA hardware, first make the toolkit available on the host and generate the CDI spec:

```bash
# Generate the CDI specification — required for Podman (especially rootless)
sudo nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml

# Verify devices were detected
nvidia-ctk cdi list
# Expected output: nvidia.com/gpu=0, nvidia.com/gpu=all, etc.
```

The CDI spec must be regenerated after driver updates or GPU configuration changes.

### 3. Run a CUDA Container

CDI mode requires `--security-opt=label=disable` with Podman.

```bash
podman run --rm \
  --device nvidia.com/gpu=all \
  --security-opt=label=disable \
  docker.io/nvidia/cuda:12.6.0-devel-ubuntu24.04 \
  python3 -c "import torch; print(torch.cuda.is_available())"
```

### 4. Install PyTorch (CUDA 12.1)

```bash
pip install torch torchvision torchaudio \
  --index-url https://download.pytorch.org/whl/cu121
```

> 💡 **Tip:** On Shanios, `shani-deploy` updates host NVIDIA drivers and the CDI spec automatically. No image rebuild is required — the change propagates to all existing containers on next `podman restart`.

---

## 🔴 AMD ROCm + OpenCL

### 1. Verify Host Driver

```bash
clinfo | grep -i amd
```

### 2. Add User to Device Groups

```bash
sudo usermod -aG render,video $USER && newgrp render
```

### 3. Run a ROCm Container

No ROCm installation on the host is required — map devices via Podman flags.

```bash
podman run --rm \
  --device /dev/kfd \
  --device /dev/dri \
  --group-add video \
  --group-add render \
  -e HSA_OVERRIDE_GFX_VERSION=10.3.0 \
  docker.io/rocm/dev-ubuntu-22.04:latest \
  python3 -c "import torch; print(torch.cuda.is_available())"
```

> ⚠️ **GFX Version Override**: Most consumer AMD GPUs require `HSA_OVERRIDE_GFX_VERSION`. Set it based on your GPU generation:
>
> | GPU Generation | Value |
> |----------------|-------|
> | RDNA 2 (RX 6000 series) | `10.3.0` |
> | RDNA 3 (RX 7000 series) | `11.0.0` |
>
> To find your exact version: `rocminfo | grep gfx`

---

## 🔵 Intel oneAPI / SYCL

### 1. Verify Host Driver

```bash
clinfo | grep -i intel
```

### 2. Add User to Device Groups

```bash
sudo usermod -aG render,video $USER && newgrp render
```

### 3. Run a oneAPI Container

```bash
podman run --rm \
  --device /dev/dri \
  --group-add render \
  ghcr.io/intel/oneapi-basekit:latest \
  bash -c "apt-get update -q && apt-get install -y -q clinfo && clinfo"
```

---

## 📦 Distrobox: Interactive Development (Recommended)

Distrobox containers inherit host GPU drivers and `/dev` nodes automatically. This is the **recommended path** for interactive GPU development — IDEs, Jupyter notebooks, debugging, and persistent environments. Unlike raw Podman containers, Distrobox shares your home directory and does not require CDI configuration.

### NVIDIA

```bash
distrobox create --name cuda-dev \
  --image nvidia/cuda:12.3.0-devel-ubuntu22.04

distrobox enter cuda-dev

# Inside the container:
pip install torch --index-url https://download.pytorch.org/whl/cu121
```

### AMD ROCm

```bash
distrobox create --name rocm-dev \
  --image rocm/dev-ubuntu-22.04:latest \
  --additional-flags "--device=/dev/kfd --device=/dev/dri --group-add=video --group-add=render"

distrobox enter rocm-dev

# Inside the container:
pip install torch --index-url https://download.pytorch.org/whl/rocm6.0
```

### Intel oneAPI

```bash
distrobox create --name intel-dev \
  --image intel/oneapi-basekit:latest \
  --additional-flags "--device=/dev/dri --group-add=render"

distrobox enter intel-dev

# Inside the container:
clinfo | grep -i intel
```

---

## 🧬 Apptainer (HPC & Cluster Ready)

Apptainer is pre-installed on Shanios and produces `.sif` files — the standard portable image format for HPC clusters. Unlike Docker or Podman, Apptainer runs rootless by default, which is required on most clusters.

### Basic Usage

```bash
# Pull an image from Docker Hub
apptainer pull docker://nvidia/cuda:12.6.0-base-ubuntu24.04

# Build a reproducible image from a definition file
apptainer build --fakeroot research.sif research.def

# Run with GPU acceleration (host driver injected automatically)
apptainer exec --nv   research.sif nvidia-smi   # NVIDIA
apptainer exec --rocm research.sif rocm-smi     # AMD
```

### SLURM Job Submission

```bash
#!/bin/bash
#SBATCH --gres=gpu:1
#SBATCH --ntasks=8

# NVIDIA workload
apptainer exec --nv /scratch/$USER/research.sif python3 train.py

# AMD workload
apptainer exec --rocm /scratch/$USER/research.sif python3 train.py
```

---

## 🌐 OpenMPI & Distributed Workflows

### HPC Standard (Host MPI + Container)

Most clusters run `mpirun` on the host and bind-mount the MPI libraries into the container. Your container's MPI version should match the host's.

```bash
module load openmpi

mpirun -np 32 \
  apptainer exec --nv \
  --bind /usr/lib/openmpi:/usr/lib/openmpi \
  myimage.sif python3 mpi_script.py
```

### Local Multi-Node Testing (Podman Pod)

Test distributed workloads on a single workstation without installing MPI on the host.

```bash
# Create a pod with a shared network namespace
podman pod create --name mpi-cluster

# Launch worker nodes
podman run -d --pod mpi-cluster --name node1 nvidia/openmpi:4.1 sleep infinity
podman run -d --pod mpi-cluster --name node2 nvidia/openmpi:4.1 sleep infinity

# Run the distributed job
podman exec node1 mpirun --host node1,node2 -np 8 python3 /workspace/benchmark.py
```

---

## 🤖 AI Inference & Serving

| Workload | Runtime | Command |
|----------|---------|---------|
| **vLLM** | NVIDIA | `podman run -d -p 127.0.0.1:8000:8000 --device nvidia.com/gpu=all -v models:/models vllm/vllm-openai:latest --model Qwen/Qwen3-32B --tensor-parallel-size 1` |
| **LLaMA.cpp** | AMD ROCm | `podman run --rm --device /dev/kfd --device /dev/dri --group-add video,render ghcr.io/ggerganov/llama.cpp:full-rocm -m /model.gguf -ngl 80 -p "Hello"` |
| **Ollama** | NVIDIA | `podman run -d -p 127.0.0.1:11434:11434 --device nvidia.com/gpu=all -e NVIDIA_VISIBLE_DEVICES=all -v ollama:/root/.ollama ollama/ollama` |

> **Tip:** All server endpoints above bind to `127.0.0.1` by default for security. Change to `0.0.0.0` only if you need LAN access and understand the exposure.

---

## 📝 Notes

- **Persistence:** All container data persists in the `@containers` Btrfs subvolume.
- **Driver updates:** Running `shani-deploy` updates host drivers and changes propagate to containers automatically — no image rebuilds required.
- **Rootless containers:** Podman runs rootless by default on Shanios. If a container requires privileged device access (e.g., `/dev/kfd`), ensure your user is in the correct groups rather than using `--privileged`.
- **Common pitfalls:**
  - **`podman run` hangs on GPU device mount:** `nvidia-container-toolkit` is **not** pre-installed on Shanios — for raw Podman you must add it to the host first (see the Container Toolkit section above) and ensure the CDI spec exists at `/etc/cdi/nvidia.yaml`. Regenerate with `sudo nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml` if missing. If you run into the immutable-root install limit, use Distrobox, which handles CDI automatically.
  - **`torch.cuda.is_available()` returns False after driver update:** Regenerate the CDI spec (`shani-deploy` handles this) and restart the container — NVIDIA container images bind to the driver version at build time.
  - **AMD ROCm `HSA_OVERRIDE_GFX_VERSION` not set:** Always set it based on your GPU generation (see the GPU Containers table). Defaulting to `10.3.0` on RDNA 3 cards will cause runtime errors.
  - **Distrobox GPU not visible:** Distrobox shares host `/dev` nodes by default, but if using `--additional-flags`, ensure the flags include both `--device=/dev/dri` and `--device=/dev/kfd` (for ROCm) or just `--device=/dev/dri` (for CUDA).
  - **Apptainer `--nv` flag has no effect:** On Shanios, Apptainer injects the host driver automatically when running rootless. The `--nv` flag is informational only; verify with `apptainer exec myimage.nv nvidia-smi`.

---

## See Also

- [Containers](containers) — overview of all container runtimes
- [Distrobox](distrobox) — mutable dev environments with host integration
- [Linux Containers (LXC/LXD)](lxc-lxd) — system containers
- [Hardware & Graphics](../system/hardware.md) — GPU driver stack
- [AI & Machine Learning](../servers/ai-llms.md) — model serving with GPU access
