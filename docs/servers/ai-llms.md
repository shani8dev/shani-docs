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

---

## Job-Ready Concepts

#### Transformer architecture and why it matters for inference
Large language models are transformer networks. The key operational facts: inference is memory-bandwidth-bound, not compute-bound — the GPU spends most of its time moving weights from VRAM to compute units. This is why quantisation (reducing weight precision from float16 to int4) gives a 4× memory reduction with minimal quality loss. VRAM capacity determines the maximum model size; VRAM bandwidth determines tokens-per-second. A 7B model at float16 needs ~14 GB VRAM; at Q4_K_M quantisation, ~4 GB. Knowing this lets you choose the right model-hardware combination and explain why a 3090 (24 GB) outperforms a 4090 (24 GB) for inference at saturated VRAM.

#### Context window, tokens, and why they matter
A context window is the maximum number of tokens (roughly ¾ of a word each) a model can process in one request — both the input prompt and the output combined. Llama 3.2's context is 128k tokens (~96k words). A longer context costs quadratically more memory (KV cache grows with sequence length). For RAG, the context window determines how many retrieved document chunks fit alongside the query. For coding assistants, it determines how much of the codebase can be in-context at once. Context exhaustion is the most common failure mode in production LLM applications.

#### RAG (Retrieval-Augmented Generation) architecture
RAG solves the "my LLM doesn't know my data" problem without fine-tuning. The pipeline: (1) embed each document chunk using an embedding model (Ollama's `nomic-embed-text`) into a vector; (2) store vectors in a vector database (Qdrant, ChromaDB, pgvector); (3) at query time, embed the user's question and find the N most similar document vectors; (4) inject those chunks into the LLM's context alongside the question. The LLM answers from the retrieved context, not from its training data. Key metrics: chunk size (too small = no context; too large = noise), top-K (how many chunks), and embedding model quality. RAG is the dominant pattern for enterprise AI applications.

#### Inference serving and batching
A production LLM server (Ollama, vLLM, llama.cpp server) manages concurrent requests differently from a web server. Continuous batching: instead of processing one request at a time, the server processes tokens from multiple in-flight requests simultaneously, filling gaps in GPU utilisation. PagedAttention (used in vLLM) manages KV cache as virtual memory pages, allowing more concurrent requests on the same VRAM. For interviews at AI-forward companies: understand that throughput (tokens/second total) and latency (time-to-first-token) are the two key metrics, and they trade off against each other.

#### Embeddings and semantic search
An embedding model converts text into a fixed-length float vector where semantically similar texts produce nearby vectors (measured by cosine similarity or dot product). Unlike keyword search (which fails on synonyms and paraphrases), semantic search finds conceptually related content. The embedding dimension (e.g. 768, 1536) determines precision — higher dimensions capture more nuance but require more storage and VRAM. HNSW (Hierarchical Navigable Small World) graphs are the standard ANN index structure used by Qdrant, Weaviate, and pgvector — they trade a small recall loss for orders-of-magnitude faster query time versus exact search.

#### Fine-tuning vs. prompting vs. RAG — when to use each
Three ways to specialise an LLM: (1) Prompting — add instructions and examples in the system prompt. Zero cost, instant. Works for tone, format, and simple tasks. Fails when the model lacks domain knowledge. (2) RAG — retrieve relevant context at runtime. Works for factual knowledge that changes. Requires a vector database and retrieval pipeline. (3) Fine-tuning — train the model on domain-specific examples using LoRA/QLoRA. Works for style, structure, and tasks requiring deep domain knowledge baked in. High cost, requires labelled data, risk of catastrophic forgetting. For 90% of enterprise applications, RAG is the answer. Fine-tuning is justified when you need consistent output format across thousands of calls.

#### LLM safety and output reliability patterns
LLMs are probabilistic — they can hallucinate, produce inconsistent JSON, and fail silently. Production patterns: (1) Structured output — instruct the model to respond in JSON and validate with Pydantic/Zod; use grammar-constrained decoding (llama.cpp supports this) to enforce schemas at the token level. (2) Retry with reflection — if the model's output fails validation, feed the error back as a correction prompt. (3) Guardrails — validate inputs for prompt injection (user tries to override system instructions) and outputs for PII or policy violations (Langfuse can hook into this pipeline). (4) Temperature — set to 0 for deterministic tasks (classification, extraction), higher for creative generation.


## Ollama

**Purpose:** Pull, run, and serve open-weight LLMs (Llama, Mistral, Phi, Gemma, Qwen, DeepSeek) via a simple REST API. Handles model storage, quantisation selection, and GPU offloading automatically.

```yaml
# ~/ollama/compose.yaml
services:
  ollama:
    image: ollama/ollama          # AMD GPU: use ollama/ollama:rocm
    ports:
      - 127.0.0.1:11434:11434
    volumes:
      - /home/user/ollama:/root/.ollama:Z
    devices:
      - /dev/dri
      # AMD GPU: also add /dev/kfd (required for ROCm)
      # - /dev/kfd
    restart: unless-stopped
```

```bash
cd ~/ollama && podman-compose up -d
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

#### Common operations
```bash
# Pull a model
podman exec ollama ollama pull llama3.2

# Pull a smaller/faster model
podman exec ollama ollama pull phi4-mini

# Pull a specific quantisation
podman exec ollama ollama pull llama3.2:3b-instruct-q4_K_M

# Run a model interactively in the terminal
podman exec -it ollama ollama run llama3.2

# Run a one-shot prompt
podman exec ollama ollama run llama3.2 "Summarise the theory of relativity in 2 sentences"

# List downloaded models
podman exec ollama ollama list

# Show model info, parameters and template
podman exec ollama ollama show llama3.2

# Show currently loaded models and their VRAM usage
podman exec ollama ollama ps

# Remove a model
podman exec ollama ollama rm llama3.2:latest

# Copy a model (create an alias)
podman exec ollama ollama cp llama3.2 my-custom-model

# Check Ollama version
podman exec ollama ollama version

# List models via API
curl http://localhost:11434/api/tags
```

---

## Open WebUI

**Purpose:** A polished, ChatGPT-style web interface for Ollama and any OpenAI-compatible API. Supports multiple models, conversation history, document RAG pipelines, image generation, voice input, web search, and user accounts with role-based access.

```yaml
# ~/open-webui/compose.yaml
services:
  open-webui:
    image: ghcr.io/open-webui/open-webui:main
    ports:
      - 127.0.0.1:3000:8080
    volumes:
      - /home/user/open-webui/data:/app/backend/data:Z
    environment:
      OLLAMA_BASE_URL: http://host.containers.internal:11434
    restart: unless-stopped
```

```bash
cd ~/open-webui && podman-compose up -d
```

> Use `host.containers.internal` (not `localhost`) when Open WebUI needs to reach Ollama running in another container.

> **RAG & vector search:** Open WebUI's RAG pipeline uses its built-in ChromaDB by default. For production RAG workloads, connect an external vector database — see [Qdrant and Weaviate in the Databases wiki](https://docs.shani.dev/doc/servers/databases#qdrant-vector-database).

Access at `http://localhost:3000`. Proxy through Caddy for HTTPS: `webui.home.local { tls internal; reverse_proxy localhost:3000 }`.

**Connect to external APIs** (Anthropic, OpenAI, Groq) alongside local models by adding connections under Settings → Connections. You can mix local Ollama models with cloud APIs in the same interface.

---

## LocalAI

**Purpose:** A drop-in, OpenAI-compatible REST API server that runs any GGUF, GGML, or diffusion model locally. Connect tools that expect the OpenAI API — LangChain, AutoGen, LlamaIndex, Cursor — without sending data to OpenAI.

```yaml
# ~/localai/compose.yaml
services:
  localai:
    image: localai/localai:latest
    ports:
      - 127.0.0.1:8080:8080
    volumes:
      - /home/user/localai/models:/models:Z
    devices:
      - /dev/dri
    environment:
      MODELS_PATH: /models
    restart: unless-stopped
```

```bash
cd ~/localai && podman-compose up -d
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

```yaml
# ~/comfyui/compose.yaml
services:
  comfyui:
    image: ghcr.io/comfyanonymous/comfyui:latest
    ports:
      - 127.0.0.1:8188:8188
    volumes:
      - /home/user/comfyui/models:/root/.local/share/comfyui/models:Z
      - /home/user/comfyui/output:/root/.local/share/comfyui/output:Z
    devices:
      - /dev/dri
    restart: unless-stopped
```

```bash
cd ~/comfyui && podman-compose up -d
```

Access at `http://localhost:8188`. Place model checkpoints in `~/comfyui/models/checkpoints/`. Download models from CivitAI or Hugging Face directly into this directory.

---

## Automatic1111 (Stable Diffusion Web UI)

**Purpose:** The original and most widely used Stable Diffusion interface. Rich plugin ecosystem, img2img, inpainting, ControlNet, and an extensive settings surface. Better for users who want a traditional form-based UI rather than ComfyUI's node graph.

```yaml
# ~/a1111/compose.yaml
services:
  a1111:
    image: universalml/stable-diffusion-webui:latest
    ports:
      - 127.0.0.1:7860:7860
    volumes:
      - /home/user/a1111/models:/stable-diffusion-webui/models:Z
      - /home/user/a1111/outputs:/stable-diffusion-webui/outputs:Z
    devices:
      - /dev/dri
    restart: unless-stopped
```

```bash
cd ~/a1111 && podman-compose up -d
```

Access at `http://localhost:7860`. Compatible with the same checkpoint `.safetensors` files as ComfyUI — share the models directory between both.

---

## Whisper (Speech-to-Text)

**Purpose:** Local, offline speech-to-text transcription using OpenAI's Whisper model. Supports 99 languages. Runs via a REST API — useful for transcription pipelines, voice notes, subtitle generation, and voice input in Open WebUI.

```yaml
# ~/whisper/compose.yaml
services:
  whisper:
    image: onerahmet/openai-whisper-asr-webservice
    ports:
      - 127.0.0.1:9000:9000
    volumes:
      - /home/user/whisper/data:/data:Z
    environment:
      ASR_MODEL: base
    restart: unless-stopped
```

```bash
cd ~/whisper && podman-compose up -d
```

**Transcribe a file:**
```bash
curl -F "audio_file=@recording.mp3" http://localhost:9000/asr
```

Available models: `tiny`, `base`, `small`, `medium`, `large`, `large-v3`. Larger models are more accurate but slower and require more RAM. For most use cases, `medium` balances accuracy and speed well.

---

## Kokoro TTS (Text-to-Speech)

**Purpose:** High-quality, local text-to-speech synthesis using the Kokoro model. Produces natural-sounding speech with multiple voices and accents — useful for audiobook creation, accessibility tools, and voice assistants.

```yaml
# ~/kokoro/compose.yaml
services:
  kokoro:
    image: ghcr.io/remsky/kokoro-fastapi-cpu:latest
    ports:
      - 127.0.0.1:8880:8880
    volumes:
      - /home/user/kokoro/voices:/app/voices:Z
    restart: unless-stopped
```

```bash
cd ~/kokoro && podman-compose up -d
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

```yaml
# ~/tabby/compose.yaml
services:
  tabby:
    image: tabbyml/tabby:latest
    ports:
      - 127.0.0.1:8081:8080
    volumes:
      - /home/user/tabby/data:/data:Z
    devices:
      - /dev/dri
    command: serve --model TabbyML/StarCoder-1B --device cpu
    restart: unless-stopped
```

```bash
cd ~/tabby && podman-compose up -d
```

> Replace `--device cpu` with `--device cuda` for NVIDIA, `--device rocm` for AMD, or keep `--device cpu` for CPU inference. (`--device metal` is macOS-only and not applicable here.) Smaller models like `TabbyML/StarCoder-1B` run well on CPU for local use.

**VS Code setup:** Install the [Tabby extension](https://marketplace.visualstudio.com/items?itemName=TabbyML.vscode-tabby), then point it at `http://tabby.home.local` in settings.

---

## AnythingLLM (Team RAG + Multi-Model Workspace)

**Purpose:** A full-stack RAG and AI workspace designed for teams. Upload documents (PDFs, Word, text, URLs), create workspaces, and chat against them with any LLM — Ollama, OpenAI, Anthropic, or any OpenAI-compatible endpoint. Supports agents, web scraping, multi-user accounts with role-based access, API keys, and an embeddable chat widget. More feature-complete than Open WebUI's RAG pipeline for document-heavy use cases.

```yaml
# ~/anythingllm/compose.yaml
services:
  anythingllm:
    image: mintplexlabs/anythingllm:latest
    ports:
      - 127.0.0.1:3001:3001
    volumes:
      - /home/user/anythingllm/storage:/app/server/storage:Z
    environment:
      STORAGE_DIR: /app/server/storage
      LLM_PROVIDER: ollama
      OLLAMA_BASE_PATH: http://host.containers.internal:11434
      OLLAMA_MODEL_PREF: llama3.2
      EMBEDDING_ENGINE: ollama
      OLLAMA_EMBEDDING_MODEL_PREF: nomic-embed-text
      VECTOR_DB: lancedb
      JWT_SECRET: changeme-run-openssl-rand-hex-32
    restart: unless-stopped
```

```bash
cd ~/anythingllm && podman-compose up -d
```

Access at `http://localhost:3001`. Create workspaces, upload documents, and start querying. Connect to any LLM provider in Settings → LLM Preference.

> **vs Open WebUI:** Use AnythingLLM when your primary use case is document Q&A across teams. Use Open WebUI when you want a chat-first interface with light RAG and broader model management.

---

## LiteLLM (Multi-Provider LLM Proxy)

**Purpose:** A unified OpenAI-compatible proxy that sits in front of 100+ LLM providers — Ollama, Anthropic, OpenAI, Groq, Mistral, Bedrock, Azure, and more. Route requests to different models based on model name, load-balance across providers, set per-key spend limits, and get unified logging and cost tracking. Any tool that speaks the OpenAI API (Open WebUI, AnythingLLM, Cursor, Continue.dev) can use LiteLLM as a single endpoint.

```yaml
# ~/litellm/compose.yml
services:
  litellm:
    image: ghcr.io/berriai/litellm:main-latest
    ports: ["127.0.0.1:4000:4000"]
    volumes:
      - /home/user/litellm/config.yaml:/app/config.yaml:ro,Z
    command: --config /app/config.yaml --port 4000 --num_workers 8
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: litellm
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: litellm
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/litellm && podman-compose up -d
```

**First run — apply database migrations:**
```bash
podman exec litellm-litellm-1 litellm --database_url "postgresql://litellm:changeme@db:5432/litellm" migrate
```

**Example `config.yaml`:**
```yaml
model_list:
  - model_name: llama3.2
    litellm_params:
      model: ollama/llama3.2
      api_base: http://host.containers.internal:11434

  - model_name: phi4-mini
    litellm_params:
      model: ollama/phi4-mini
      api_base: http://host.containers.internal:11434

  - model_name: claude-sonnet
    litellm_params:
      model: anthropic/claude-sonnet-4-5-20250929
      api_key: os.environ/ANTHROPIC_API_KEY

  - model_name: gpt-4o
    litellm_params:
      model: openai/gpt-4o
      api_key: os.environ/OPENAI_API_KEY

litellm_settings:
  drop_params: true
  success_callback: ["langfuse"]

general_settings:
  master_key: sk-changeme
  database_url: postgresql://litellm:changeme@db:5432/litellm
```

**Use LiteLLM from any OpenAI client:**
```bash
curl http://localhost:4000/v1/chat/completions \
  -H "Authorization: Bearer sk-changeme" \
  -H "Content-Type: application/json" \
  -d '{"model": "llama3.2", "messages": [{"role": "user", "content": "Hello"}]}'
```

---

## Vane (AI Search Engine)

**Purpose:** Open-source AI-powered search engine — a self-hosted Perplexity.ai alternative (formerly known as Perplexica, rebranded to Vane). Bundles SearXNG internally, retrieves live results, and uses a local LLM (via Ollama) to synthesise a cited, conversational answer. No query data sent to any third party.

```yaml
# ~/vane/compose.yml
services:
  vane:
    image: itzcrazykns1337/vane:latest   # includes bundled SearXNG
    ports: ["127.0.0.1:3009:3000"]
    volumes:
      - /home/user/vane/data:/home/vane/data:Z
    restart: unless-stopped
```

```bash
cd ~/vane && podman-compose up -d
```

Access at `http://localhost:3009`. On first load, configure your AI provider (Ollama URL: `http://host.containers.internal:11434`, model: `llama3.2`) through the setup screen.

> If you already run a separate SearXNG instance, use the slim image instead: `itzcrazykns1337/vane:slim-latest` and set `SEARXNG_API_URL: http://host.containers.internal:8090`.

> Vane needs at least a 7B model for coherent answers. `llama3.2` or `mistral` work well. Pull the model first with `podman exec ollama ollama pull llama3.2`.

---

## InvokeAI (Professional Stable Diffusion UI)

**Purpose:** Professional-grade Stable Diffusion interface with a node-based canvas, a polished linear workflow UI, ControlNet, IP-Adapter, regional prompting, and model management. A strong alternative to ComfyUI when you want more polish, and to A1111 when you need more power. Excellent for photographers and digital artists who want a native-feeling app experience.

```yaml
# ~/invokeai/compose.yaml
services:
  invokeai:
    image: ghcr.io/invoke-ai/invokeai:latest
    ports:
      - 127.0.0.1:9090:9090
    volumes:
      - /home/user/invokeai/models:/invokeai/models:Z
      - /home/user/invokeai/outputs:/invokeai/outputs:Z
      - /home/user/invokeai/configs:/invokeai/configs:Z
    devices:
      - /dev/dri
    restart: unless-stopped
```

```bash
cd ~/invokeai && podman-compose up -d
```

Access at `http://localhost:9090`. On first run, download models from the Model Manager — it supports HuggingFace Hub, CivitAI, and direct URLs. Compatible checkpoint files are shared with ComfyUI and A1111.

---

## Piper TTS (Lightweight Text-to-Speech)

**Purpose:** Fast, local neural text-to-speech synthesis. Piper is significantly lighter than Kokoro — a single voice model is 50–200 MB and runs in real time on CPU. Ideal for notifications, accessibility features, and voice synthesis when you don't need the premium audio quality of Kokoro.

```yaml
# ~/piper-tts/compose.yaml
services:
  piper-tts:
    image: rhasspy/wyoming-piper
    ports:
      - 127.0.0.1:5000:5000
    volumes:
      - /home/user/piper/voices:/app/voices:Z
    command: --piper /usr/local/bin/piper --data-dir /app/voices --download-dir /app/voices --voice en_US-lessac-medium
    restart: unless-stopped
  piper-rest:
    image: ghcr.io/mush42/piper-rest-api:latest
    ports:
      - 127.0.0.1:5001:5000
    volumes:
      - /home/user/piper/voices:/voices:Z
    command: --models-dir /voices
    restart: unless-stopped
```

```bash
cd ~/piper-tts && podman-compose up -d
```

**Synthesise speech:**
```bash
echo "Hello from Piper" | \
  curl -X POST http://localhost:5001/api/tts \
  -H "Content-Type: text/plain" \
  --data-binary @- \
  --output speech.wav
```

> Piper uses the Wyoming protocol — it integrates directly with Home Assistant's Assist voice pipeline for 100% local voice commands without cloud STT/TTS.

---

## Flowise (Visual LLM Pipeline Builder)

**Purpose:** Drag-and-drop UI for building LangChain and LlamaIndex pipelines — chatbots, RAG workflows, agents, and API endpoints — without writing code. Connect Ollama models, vector databases, document loaders, and output parsers visually, then expose them as REST endpoints or embed them as chat widgets.

```yaml
# ~/flowise/compose.yaml
services:
  flowise:
    image: flowiseai/flowise
    ports:
      - 127.0.0.1:3003:3000
    volumes:
      - /home/user/flowise/data:/root/.flowise:Z
    environment:
      FLOWISE_USERNAME: admin
      FLOWISE_PASSWORD: changeme
      FLOWISE_SECRETKEY_OVERWRITE: changeme-run-openssl-rand-hex-32
    restart: unless-stopped
```

```bash
cd ~/flowise && podman-compose up -d
```

Access at `http://localhost:3003`. Build chains by dragging components onto the canvas — connect an Ollama LLM node, a Qdrant vector store, a PDF loader, and a conversational memory node to create a document Q&A chatbot in minutes.

> **vs AnythingLLM:** Flowise gives you full control over the pipeline architecture via the visual editor. AnythingLLM is better when you just want to upload documents and chat.

---

## Langfuse (LLM Observability & Tracing)

**Purpose:** Open-source observability platform for LLM applications. Traces every prompt, completion, token count, latency, and cost across your entire AI stack — Ollama, LiteLLM, OpenAI, Flowise, and AnythingLLM all support Langfuse callbacks. Essential for debugging RAG pipelines and monitoring production AI workloads.

```yaml
# ~/langfuse/compose.yml
services:
  langfuse:
    image: langfuse/langfuse:latest
    ports: ["127.0.0.1:3004:3000"]
    environment:
      DATABASE_URL: postgresql://langfuse:changeme@db:5432/langfuse
      NEXTAUTH_URL: https://langfuse.home.local
      NEXTAUTH_SECRET: changeme-run-openssl-rand-base64-32
      SALT: changeme-run-openssl-rand-base64-16
    depends_on: [db]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: langfuse
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: langfuse
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/langfuse && podman-compose up -d
```

Access at `http://localhost:3004`. Create a project, copy the public/secret key pair, and add them to LiteLLM's `config.yaml` (`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`) to start seeing traces immediately.

---

## Open WebUI Pipelines (Tool Use & Custom Functions)

**Purpose:** Open WebUI Pipelines is a plugin server that extends Open WebUI with custom Python functions — rate limiting, content filtering, model routing, tool use (web search, calculators, code execution), and integration with external APIs. Pipelines run server-side as a sidecar to Open WebUI.

```yaml
# ~/pipelines/compose.yaml
services:
  pipelines:
    image: ghcr.io/open-webui/pipelines:main
    ports:
      - 127.0.0.1:9099:9099
    volumes:
      - /home/user/pipelines:/app/pipelines:Z
    restart: unless-stopped
```

```bash
cd ~/pipelines && podman-compose up -d
```

In Open WebUI: Settings → Connections → add OpenAI-compatible endpoint `http://host.containers.internal:9099` with API key `0p3n-w3bu!`. Installed pipelines appear as selectable models in the chat interface.

---

## Dify (LLM Application Platform)

**Purpose:** Full-stack LLM application development platform — build chatbots, agents, RAG pipelines, and AI workflows with a visual editor, then deploy them as API endpoints or embeddable widgets. Dify combines what Flowise and AnythingLLM do separately: a powerful workflow canvas *and* a complete RAG document pipeline *and* a deployment platform, all in one. Supports Ollama, OpenAI, Anthropic, Azure, Groq, and 30+ other providers.

```yaml
# ~/dify/compose.yml
services:
  api:
    image: langgenius/dify-api:latest
    environment:
      DB_USERNAME: postgres
      DB_PASSWORD: changeme
      DB_HOST: db
      DB_PORT: 5432
      DB_DATABASE: dify
      REDIS_HOST: redis
      CELERY_BROKER_URL: redis://redis:6379/1
      SECRET_KEY: changeme-run-openssl-rand-base64-42
      STORAGE_TYPE: local
      STORAGE_LOCAL_PATH: /app/api/storage
      SANDBOX_HOST: sandbox
    volumes:
      - /home/user/dify/storage:/app/api/storage:Z
    depends_on: [db, redis]
    restart: unless-stopped

  worker:
    image: langgenius/dify-api:latest
    command: celery -A app.celery worker -P gevent -c 1 --loglevel INFO
    environment:
      DB_USERNAME: postgres
      DB_PASSWORD: changeme
      DB_HOST: db
      DB_DATABASE: dify
      REDIS_HOST: redis
      CELERY_BROKER_URL: redis://redis:6379/1
      SECRET_KEY: changeme-run-openssl-rand-base64-42
      STORAGE_TYPE: local
      STORAGE_LOCAL_PATH: /app/api/storage
    volumes:
      - /home/user/dify/storage:/app/api/storage:Z
    depends_on: [db, redis]
    restart: unless-stopped

  web:
    image: langgenius/dify-web:latest
    ports: ["127.0.0.1:3005:3000"]
    environment:
      CONSOLE_API_URL: http://host.containers.internal:5002
      APP_API_URL: http://host.containers.internal:5002
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports: ["127.0.0.1:5002:80"]
    volumes:
      - /home/user/dify/nginx/nginx.conf:/etc/nginx/nginx.conf:ro,Z
    depends_on: [api, web]
    restart: unless-stopped

  sandbox:
    image: langgenius/dify-sandbox:latest
    environment:
      API_KEY: changeme-sandbox-key
      GIN_MODE: release
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: dify
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

  qdrant:
    image: qdrant/qdrant:latest
    volumes: [qdrant_data:/qdrant/storage]
    restart: unless-stopped

volumes: {pg_data: {}, qdrant_data: {}}
```

```bash
cd ~/dify && podman-compose up -d
```

**First run — initialise the database:**
```bash
podman-compose run --rm api flask db upgrade
podman-compose run --rm api flask db-commands migrate
```

Access at `http://localhost:5002`. On first visit, set up an admin account, then connect your LLM providers under Settings → Model Providers.

#### Key Dify features
- **Chatbot** — deploy a custom-knowledge chatbot from uploaded documents in minutes
- **Workflow** — visual node editor for multi-step agent pipelines (fetch URL → summarise → send notification)
- **Agent** — connect tools (web search, code execution, API calls) to an LLM for autonomous task completion
- **API** — every app generates a REST API endpoint; use it from any external system

> **vs Flowise:** Dify includes a full RAG knowledge base system, user management, and app publishing workflow that Flowise lacks. Use Flowise for pure LangChain pipeline prototyping; use Dify when you want to deploy production AI applications.

---

## Open Interpreter (Local Code Execution Agent)

**Purpose:** An open-source implementation of OpenAI's Code Interpreter — a local agent that writes and executes Python, JavaScript, Shell, and other code to accomplish tasks. Point it at Ollama and it runs entirely offline. Ask it to "analyse this CSV and plot the top 10 by revenue" and it writes the code, runs it, and returns the result.

```yaml
# ~/open-interpreter/compose.yaml
services:
  open-interpreter:
    image: openinterpreter/open-interpreter:latest
    ports:
      - 127.0.0.1:8265:8265
    volumes:
      - /home/user/open-interpreter/files:/files:Z
    environment:
      OLLAMA_HOST: http://host.containers.internal:11434
      DEFAULT_MODEL: ollama/llama3.2
    command: server
    restart: unless-stopped
```

```bash
cd ~/open-interpreter && podman-compose up -d
```

#### Or run interactively
```bash
podman run -it --rm \
  -v /home/user/open-interpreter/files:/files:Z \
  -e OLLAMA_HOST=http://host.containers.internal:11434 \
  openinterpreter/open-interpreter:latest \
  --model ollama/llama3.2 \
  --local
```

> For best results with code execution tasks, use a larger model — `llama3.1:70b` or `qwen2.5-coder:32b` produce significantly better code than 7B models.

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
anything.home.local  { tls internal; reverse_proxy localhost:3001 }
litellm.home.local   { tls internal; reverse_proxy localhost:4000 }
vane.home.local      { tls internal; reverse_proxy localhost:3009 }
invokeai.home.local  { tls internal; reverse_proxy localhost:9090 }
flowise.home.local   { tls internal; reverse_proxy localhost:3003 }
langfuse.home.local  { tls internal; reverse_proxy localhost:3004 }
dify.home.local      { tls internal; reverse_proxy localhost:5002 }
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
| AnythingLLM workspace shows no responses | Verify `OLLAMA_BASE_PATH` uses `host.containers.internal`; ensure the chosen model is pulled in Ollama |
| LiteLLM returns 400 for Ollama models | Ensure the model name in `config.yaml` matches exactly what `ollama list` shows; use `ollama/` prefix in litellm_params |
| Vane shows blank results | Check container logs with `podman logs vane-vane-1`; verify Ollama URL is set correctly in the web UI settings |
| InvokeAI model import fails | Ensure the models volume has write permissions; check that VRAM/RAM is sufficient for the selected model size |
| Piper TTS no audio output | Verify the voice model `.onnx` file was downloaded into the voices directory; check `podman logs piper-tts` |
| Flowise chains return empty responses | Verify Ollama URL uses `host.containers.internal`; check that the selected model is pulled; inspect the debug output in the Flowise canvas |
| Langfuse shows no traces | Ensure `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are set in LiteLLM or the calling app; check `podman logs langfuse` for DB connection errors |
| Dify worker not processing documents | Ensure Celery worker container is running; check Redis connectivity; view worker logs with `podman logs dify-worker-1` |
| Dify Qdrant connection error | The Qdrant service must be running before the API starts; check `QDRANT_HOST` env var points to the correct container name |
| Open Interpreter refuses to execute code | By default the agent confirms before running code — pass `--auto_run` to skip confirmation; ensure the files volume has write permissions |

> 🔒 **Security tip:** Always bind AI service ports to `127.0.0.1` and proxy through Caddy. These services have no built-in authentication — do not expose them directly to the internet.
