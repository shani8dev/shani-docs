---
title: Apptainer (HPC Containers)
section: Software & Apps
updated: 2026-05-07
---

# Apptainer (HPC Containers)

Apptainer (formerly Singularity) is the container runtime built for HPC. It packages your entire software environment into a single `.sif` (Singularity Image Format) file that runs identically on your Shanios workstation and on any SLURM/PBS/LSF cluster that has Apptainer installed. No root daemon required — it runs as an unprivileged user out of the box.

Apptainer is pre-installed on Shanios. No configuration required.

## Apptainer vs Podman vs Distrobox

| | Apptainer | Podman | Distrobox |
|---|---|---|---|
| Primary use case | HPC / cluster portability | Services, dev containers | Mutable dev environments |
| Image format | SIF (single file) | OCI layers | OCI layers |
| Root required | No | No | No |
| Home dir shared | Yes (by default) | No | Yes (by default) |
| GPU passthrough | `--nv` / `--rocm` flags | Manual device flags | Manual device flags |
| Cluster-compatible | Yes | No | No |
| Mutable at runtime | No (read-only) | Yes | Yes |

**Use Apptainer when** you need to run the same environment on your workstation and a SLURM/PBS cluster, need long-term reproducibility, or want a single portable file archived alongside data and code.

## Basic Usage

```bash
# Pull an image from Docker Hub (converted to SIF automatically)
apptainer pull docker://ubuntu:22.04
apptainer pull docker://python:3.11-slim

# Run the default runscript
apptainer run ubuntu_22.04.sif

# Execute a specific command
apptainer exec ubuntu_22.04.sif python3 --version

# Open an interactive shell
apptainer shell ubuntu_22.04.sif

# Run with NVIDIA GPU support (host driver injected automatically)
apptainer exec --nv pytorch_latest.sif python3 -c "import torch; print(torch.cuda.is_available())"

# Run with AMD ROCm GPU support
apptainer exec --rocm rocm_pytorch.sif python3 -c "import torch; print(torch.cuda.is_available())"

# Bind mount a host directory
apptainer exec --bind /home/$USER/data:/data myimage.sif python3 /data/analysis.py
```

By default, Apptainer binds your home directory into the container — your files are available at the same paths inside and outside.

## Pulling Images

```bash
# From Docker Hub
apptainer pull docker://ubuntu:22.04
apptainer pull docker://nvidia/cuda:12.3.0-devel-ubuntu22.04
apptainer pull docker://rocm/dev-ubuntu-22.04:latest

# From GitHub Container Registry
apptainer pull docker://ghcr.io/some-org/some-image:latest

# From Sylabs Cloud Library (native HPC image registry)
apptainer pull library://lolcow

# Save with a specific name
apptainer pull --name my-pytorch.sif docker://pytorch/pytorch:2.2.0-cuda12.1-cudnn8-runtime

# Inspect before running
apptainer inspect ubuntu_22.04.sif
apptainer inspect --runscript ubuntu_22.04.sif
apptainer inspect --labels ubuntu_22.04.sif
```

## Building Reproducible Images

The `.def` definition file is a text-based, version-controllable description of your environment. Anyone with Apptainer can build the identical image from the same `.def`.

### Basic Python Research Environment

```
# python-research.def
Bootstrap: docker
From: ubuntu:22.04

%post
    apt-get update -y && apt-get install -y \
        python3 python3-pip python3-dev \
        git wget curl build-essential

    pip3 install --no-cache-dir \
        numpy==1.26.4 scipy==1.12.0 pandas==2.2.1 \
        matplotlib==3.8.3 scikit-learn==1.4.1 jupyter==1.0.0

%environment
    export PATH=/usr/local/bin:$PATH

%runscript
    exec python3 "$@"

%labels
    Author your.name@institution.edu
    Version 1.0
```

```bash
# Build (--fakeroot avoids needing real root)
apptainer build --fakeroot python-research.sif python-research.def

# Test
apptainer exec python-research.sif python3 -c "import numpy; print(numpy.__version__)"
```

### PyTorch + CUDA Environment

```
# pytorch-cuda.def
Bootstrap: docker
From: nvidia/cuda:12.3.0-devel-ubuntu22.04

%post
    apt-get update -y && apt-get install -y python3 python3-pip

    pip3 install --no-cache-dir \
        torch==2.2.0+cu121 torchvision torchaudio \
        --index-url https://download.pytorch.org/whl/cu121

    pip3 install --no-cache-dir transformers datasets accelerate wandb

%environment
    export PATH=/usr/local/bin:$PATH

%runscript
    exec python3 "$@"
```

```bash
apptainer build --fakeroot pytorch-cuda.sif pytorch-cuda.def
apptainer exec --nv pytorch-cuda.sif python3 train.py
```

### Bioinformatics Environment

```
# bioinformatics.def
Bootstrap: docker
From: ubuntu:22.04

%post
    apt-get update -y && apt-get install -y \
        python3 python3-pip \
        samtools bwa bowtie2 bedtools fastqc trimmomatic \
        r-base r-cran-ggplot2 r-cran-dplyr

    pip3 install --no-cache-dir biopython snakemake pysam

%environment
    export PATH=/usr/local/bin:$PATH
```

## Submitting to HPC Clusters

The `.sif` file you build and test locally is exactly what you submit to the cluster.

### SLURM

```bash
#!/bin/bash
#SBATCH --job-name=my_analysis
#SBATCH --nodes=1
#SBATCH --ntasks=8
#SBATCH --mem=32G
#SBATCH --gres=gpu:1
#SBATCH --time=04:00:00
#SBATCH --output=job_%j.log

# module load apptainer   # uncomment if cluster uses modules

apptainer exec --nv \
  --bind /scratch/$USER/data:/data \
  /scratch/$USER/pytorch-cuda.sif \
  python3 /home/$USER/analysis/train.py --config config.yaml

# For AMD GPU clusters:
# apptainer exec --rocm /scratch/$USER/rocm.sif python3 train.py
```

### PBS/Torque

```bash
#!/bin/bash
#PBS -N my_analysis
#PBS -l nodes=1:ppn=8:gpus=1
#PBS -l mem=32gb
#PBS -l walltime=04:00:00

cd $PBS_O_WORKDIR

apptainer exec --nv \
  --bind /scratch/$USER/data:/data \
  /scratch/$USER/pytorch-cuda.sif \
  python3 analysis/train.py
```

### MPI (Multi-Node)

Host MPI version must match the MPI version inside the container:

```bash
mpirun -np 32 apptainer exec --nv \
  /scratch/$USER/mpi-app.sif \
  /app/my_mpi_program
```

## GPU Support

`--nv` and `--rocm` inject the host GPU runtime into the container at runtime. No driver bundling is needed in the SIF image — the same image works across cluster generations as long as CUDA/ROCm ABI compatibility is maintained.

```bash
# NVIDIA
apptainer exec --nv myimage.sif nvidia-smi
apptainer exec --nv myimage.sif python3 -c "import torch; print(torch.cuda.device_count())"

# AMD ROCm
apptainer exec --rocm myimage.sif rocm-smi
apptainer exec --rocm myimage.sif python3 -c "import torch; print(torch.cuda.is_available())"

# Debug: see what GPU libraries are injected
apptainer exec --nv --debug myimage.sif true 2>&1 | grep -i nvidia
```

## Persistent Overlays

SIF images are read-only. To add packages without rebuilding:

```bash
# Create a writable overlay file
apptainer overlay create --size 512 my-overlay.img

# Use it — changes inside persist in the overlay file
apptainer exec --overlay my-overlay.img myimage.sif bash

# For image development: writable sandbox
apptainer build --sandbox my-sandbox/ docker://ubuntu:22.04
apptainer shell --writable my-sandbox/
# Install packages, test your .def, then convert back
apptainer build final.sif my-sandbox/
```

## Caching and Storage

```bash
# Cache location (persists in @home subvolume — survives OS updates)
du -sh ~/.apptainer/cache

# Clear cache
apptainer cache clean

# Override cache location (e.g. to a scratch disk)
export APPTAINER_CACHEDIR=/scratch/$USER/apptainer-cache
```

## Practical Tips

- **Pin base image versions.** Use `From: ubuntu:22.04` not `From: ubuntu:latest`.
- **Pin package versions.** Use `pip install package==X.Y.Z`, not `pip install package`.
- **Keep the `.def` in version control.** The `.sif` is a build artefact; the `.def` is the source.
- **Test locally before submitting to cluster.** Run on a small dataset locally first.
- **Use `--bind` explicitly for data directories.** Don't rely on automatic home binding for large datasets.
