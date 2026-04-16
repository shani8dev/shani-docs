---
title: AI & LLMs
section: Self-Hosting & Servers
updated: 2026-04-16
---

# AI & LLMs

Local large language models, vision pipelines, and speech-to-text services.

## Ollama
**Purpose**: Simplified LLM runner. Pulls, runs, and serves open-weight models (Llama, Mistral, Phi) via REST API.
```bash
podman run -d \
  --name ollama \
  -p 127.0.0.1:11434:11434 \
  -v /home/user/ollama:/root/.ollama \
  --device /dev/dri \
  --restart unless-stopped \
  ollama/ollama
```

## Open WebUI
**Purpose**: Beautiful, ChatGPT-style web interface for Ollama, OpenAI-compatible APIs, and local RAG pipelines.
```bash
podman run -d \
  --name open-webui \
  -p 127.0.0.1:3000:8080 \
  -v /home/user/open-webui/data:/app/backend/data:Z \
  -e OLLAMA_BASE_URL=http://ollama:11434 \
  --restart unless-stopped \
  ghcr.io/open-webui/open-webui:main
```

## LocalAI / ComfyUI / Whisper
**Purpose**: Drop-in OpenAI-compatible API server (LocalAI). ComfyUI provides a node-based workflow editor for SDXL/SD1.5. Whisper handles local speech-to-text.
```bash
podman run -d \
  --name localai \
  -p 127.0.0.1:8080:8080 \
  -v /home/user/localai/models:/models:Z \
  -e MODELS_PATH=/models \
  --restart unless-stopped \
  localai/localai:latest

podman run -d \
  --name comfyui \
  -p 127.0.0.1:8188:8188 \
  -v /home/user/comfyui/models:/root/.local/share/comfyui/models:Z \
  -v /home/user/comfyui/output:/root/.local/share/comfyui/output:Z \
  --device /dev/dri \
  --restart unless-stopped \
  ghcr.io/comfyanonymous/comfyui:latest

podman run -d \
  --name whisper \
  -p 127.0.0.1:9000:9000 \
  -v /home/user/whisper/data:/data:Z \
  --restart unless-stopped \
  onerahmet/openai-whisper-asr-webservice
```
