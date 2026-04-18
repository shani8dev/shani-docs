---
title: AI & LLMs
section: Self-Hosting & Servers
updated: 2026-04-22
---

# AI & LLMs

Run large language models, vision pipelines, image generation, speech-to-text, and AI coding assistants entirely on your own hardware. No API keys. No usage limits. Nothing leaves your machine.

> **GPU note:** Shani OS pre-configures `/dev/dri` device passthrough for Podman. AMD and Intel GPUs work out of the box. NVIDIA requires the NVIDIA Container Toolkit — see [docs.shani.dev/doc/servers/ai-llms#gpu](https://docs.shani.dev/doc/servers/ai-llms#gpu).

> **RAM guidance:** A 7B model needs ~8 GB RAM/VRAM, a 13B model needs ~16 GB, a 70B model needs ~40 GB. Models run on CPU if no GPU is available — slower, but functional. Quantised (GGUF) models trade a small accuracy reduction for significantly lower memory requirements.

---

## Ollama

**Purpose:** Pull, run, and serve open-weight LLMs (Llama, Mistral, Phi, Gemma, Qwen, DeepSeek) via a simple REST API. Handles model storage, quantisation selection, and GPU offloading automatically.

```bash
podman run -d \
  --name ollama \
  -p 127.0.0.1:11434:11434 \
  -v /home/user/ollama:/root/.ollama:Z \
  --device /dev/dri \
  --restart unless-stopped \
  ollama/ollama
```

**Pull and run a model:**
```bash
# Pull a model
podman exec ollama ollama pull llama3.2

# Pull a smaller/faster model
podman exec ollama ollama pull phi4-mini

# Run interactively
podman exec -it ollama ollama run llama3.2

# List downloaded models
podman exec ollama ollama list

# Show model info and parameters
podman exec ollama ollama show llama3.2
```

**REST API example:**
```bash
curl http://localhost:11434/api/generate \
  -d '{"model":"llama3.2","prompt":"What is immutable Linux?","stream":false}'
```

**OpenAI-compatible API** (drop-in replacement for any OpenAI client):
```bash
curl http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"llama3.2","messages":[{"role":"user","content":"Hello"}]}'
```

---

## Open WebUI

**Purpose:** A polished, ChatGPT-style web interface for Ollama and any OpenAI-compatible API. Supports multiple models, conversation history, document RAG pipelines, image generation, voice input, web search, and user accounts with role-based access.

```bash
podman run -d \
  --name open-webui \
  -p 127.0.0.1:3000:8080 \
  -v /home/user/open-webui/data:/app/backend/data:Z \
  -e OLLAMA_BASE_URL=http://host.containers.internal:11434 \
  --restart unless-stopped \
  ghcr.io/open-webui/open-webui:main
```

> Use `host.containers.internal` (not `localhost`) when Open WebUI needs to reach Ollama running in another container.

> **RAG & vector search:** Open WebUI's RAG pipeline uses its built-in ChromaDB by default. For production RAG workloads, connect an external vector database — see [Qdrant and Weaviate in the Databases wiki](https://docs.shani.dev/doc/servers/databases#qdrant-vector-database).

Access at `http://localhost:3000`. Proxy through Caddy for HTTPS: `webui.home.local { tls internal; reverse_proxy localhost:3000 }`.

**Connect to external APIs** (Anthropic, OpenAI, Groq) alongside local models by adding connections under Settings → Connections. You can mix local Ollama models with cloud APIs in the same interface.

---

## LocalAI

**Purpose:** A drop-in, OpenAI-compatible REST API server that runs any GGUF, GGML, or diffusion model locally. Connect tools that expect the OpenAI API — LangChain, AutoGen, LlamaIndex, Cursor — without sending data to OpenAI.

```bash
podman run -d \
  --name localai \
  -p 127.0.0.1:8080:8080 \
  -v /home/user/localai/models:/models:Z \
  -e MODELS_PATH=/models \
  --device /dev/dri \
  --restart unless-stopped \
  localai/localai:latest
```

**Test the API:**
```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"llama3.2","messages":[{"role":"user","content":"Hello"}]}'
```

> LocalAI supports embeddings, function calling, audio transcription, and image generation — all via the standard OpenAI API surface.

---

## ComfyUI

**Purpose:** A node-based workflow editor for Stable Diffusion (SDXL, SD1.5, Flux). Build and save image generation pipelines as JSON graphs. Supports ControlNet, LoRA, inpainting, upscaling, AnimateDiff, and video generation.

```bash
podman run -d \
  --name comfyui \
  -p 127.0.0.1:8188:8188 \
  -v /home/user/comfyui/models:/root/.local/share/comfyui/models:Z \
  -v /home/user/comfyui/output:/root/.local/share/comfyui/output:Z \
  --device /dev/dri \
  --restart unless-stopped \
  ghcr.io/comfyanonymous/comfyui:latest
```

Access at `http://localhost:8188`. Place model checkpoints in `~/comfyui/models/checkpoints/`. Download models from CivitAI or Hugging Face directly into this directory.

---

## Automatic1111 (Stable Diffusion Web UI)

**Purpose:** The original and most widely used Stable Diffusion interface. Rich plugin ecosystem, img2img, inpainting, ControlNet, and an extensive settings surface. Better for users who want a traditional form-based UI rather than ComfyUI's node graph.

```bash
podman run -d \
  --name a1111 \
  -p 127.0.0.1:7860:7860 \
  -v /home/user/a1111/models:/stable-diffusion-webui/models:Z \
  -v /home/user/a1111/outputs:/stable-diffusion-webui/outputs:Z \
  --device /dev/dri \
  --restart unless-stopped \
  universalml/stable-diffusion-webui:latest
```

Access at `http://localhost:7860`. Compatible with the same checkpoint `.safetensors` files as ComfyUI — share the models directory between both.

---

## Whisper (Speech-to-Text)

**Purpose:** Local, offline speech-to-text transcription using OpenAI's Whisper model. Supports 99 languages. Runs via a REST API — useful for transcription pipelines, voice notes, subtitle generation, and voice input in Open WebUI.

```bash
podman run -d \
  --name whisper \
  -p 127.0.0.1:9000:9000 \
  -v /home/user/whisper/data:/data:Z \
  -e ASR_MODEL=base \
  --restart unless-stopped \
  onerahmet/openai-whisper-asr-webservice
```

**Transcribe a file:**
```bash
curl -F "audio_file=@recording.mp3" http://localhost:9000/asr
```

Available models: `tiny`, `base`, `small`, `medium`, `large`, `large-v3`. Larger models are more accurate but slower and require more RAM. For most use cases, `medium` balances accuracy and speed well.

---

## Kokoro TTS (Text-to-Speech)

**Purpose:** High-quality, local text-to-speech synthesis using the Kokoro model. Produces natural-sounding speech with multiple voices and accents — useful for audiobook creation, accessibility tools, and voice assistants.

```bash
podman run -d \
  --name kokoro \
  -p 127.0.0.1:8880:8880 \
  -v /home/user/kokoro/voices:/app/voices:Z \
  --restart unless-stopped \
  ghcr.io/remsky/kokoro-fastapi-cpu:latest
```

**Synthesise speech:**
```bash
curl -X POST http://localhost:8880/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"model":"kokoro","input":"Hello from your home server.","voice":"af_bella"}' \
  --output speech.mp3
```

> Kokoro exposes an OpenAI-compatible `/v1/audio/speech` endpoint — connect it to Open WebUI's TTS setting for voice responses.

---

## Tabby (AI Coding Assistant)

**Purpose:** Self-hosted AI coding assistant server. Works as a drop-in alternative to GitHub Copilot — installs as a VS Code, JetBrains, or Vim extension and completes code inline as you type, using models running entirely on your hardware.

```bash
podman run -d \
  --name tabby \
  -p 127.0.0.1:8080:8080 \
  -v /home/user/tabby/data:/data:Z \
  --device /dev/dri \
  --restart unless-stopped \
  tabbyml/tabby:latest serve \
    --model TabbyML/StarCoder-1B \
    --device metal
```

> Replace `--device metal` with `--device cuda` for NVIDIA, or omit for CPU inference. Smaller models like `TabbyML/StarCoder-1B` run well on CPU for local use.

**VS Code setup:** Install the [Tabby extension](https://marketplace.visualstudio.com/items?itemName=TabbyML.vscode-tabby), then point it at `http://tabby.home.local` in settings.

---

## SearXNG (AI Web Search Integration)

**Purpose:** Connect a local SearXNG instance to Open WebUI for grounded, real-time web search in AI chat. Queries leave your machine only to fetch results — never to a third-party AI API.

See the [Networking wiki](https://docs.shani.dev/doc/servers/networking#searxng) for the full SearXNG setup. Once running, enable it in Open WebUI: Settings → Web Search → provider: SearXNG, URL: `http://host.containers.internal:8090`.

---

## Caddy Configuration

Expose your AI tools privately over HTTPS on your tailnet:

```caddyfile
# /etc/caddy/Caddyfile

ollama.home.local    { tls internal; reverse_proxy localhost:11434 }
webui.home.local     { tls internal; reverse_proxy localhost:3000 }
comfyui.home.local   { tls internal; reverse_proxy localhost:8188 }
a1111.home.local     { tls internal; reverse_proxy localhost:7860 }
localai.home.local   { tls internal; reverse_proxy localhost:8080 }
whisper.home.local   { tls internal; reverse_proxy localhost:9000 }
kokoro.home.local    { tls internal; reverse_proxy localhost:8880 }
tabby.home.local     { tls internal; reverse_proxy localhost:8081 }
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Ollama is slow / not using GPU | Check `podman exec ollama ollama ps` — if accelerator shows `CPU`, verify `--device /dev/dri` is passed and the `renderD128` device exists |
| Open WebUI can't connect to Ollama | Use `host.containers.internal:11434` instead of `localhost` in `OLLAMA_BASE_URL` |
| Model download fails | Check disk space — models are stored in `/home/user/ollama`. Ensure the volume path has write permissions |
| ComfyUI shows no models | Verify checkpoint files are in `~/comfyui/models/checkpoints/` with `.safetensors` or `.ckpt` extension |
| Whisper transcription is inaccurate | Upgrade to a larger model by changing `ASR_MODEL=medium` or `ASR_MODEL=large` |
| Port conflict on 8080 | LocalAI and several other tools default to 8080 — change the host port to `-p 127.0.0.1:8081:8080` |
| Kokoro produces no audio | Ensure voices directory exists and contains `.pt` voice files; check container logs for model load errors |
| Tabby extension not connecting | Verify `tabby.home.local` resolves on Tailscale; check the extension's server URL setting includes the correct port |
| Open WebUI RAG not finding documents | Ensure the document was fully processed (green tick in Documents); re-upload if stuck on processing |

> 🔒 **Security tip:** Always bind AI service ports to `127.0.0.1` and proxy through Caddy. These services have no built-in authentication — do not expose them directly to the internet.
