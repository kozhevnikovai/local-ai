# local-ai

Shared local AI model engine for [kozhevnikovai](https://github.com/kozhevnikovai) products ([Protokolist](https://github.com/kozhevnikovai/protokolist), [Tender Assistant](https://github.com/kozhevnikovai/tender-pomoshnik) and more). Everything runs on the user's computer; the only network step is a one-time model download.

[Русский](README.md)

## Features

- **Two model tiers** — "light" for regular PCs and laptops, "strong" for PCs with 16 GB RAM or a GPU.
- **Hardware-based choice** — checks RAM and GPU, recommends a model and explains why; the user can override.
- **Reliable download** — resume after interruption, free-space check, SHA-256, fallback mirror.
- **JSON-schema answers** — llama.cpp on CPU or GPU (CUDA, Vulkan, Metal), thinking disabled, loop protection.
- **Long texts** — `chunkText` splits a multi-hour transcript or a large document by paragraphs and sentences (with overlap), `mapReduce` processes parts in turn and merges the result.
- **Streaming and Stop** — `onText` delivers text as it is generated, `signal` cancels the answer; concurrent calls are queued.
- **Model removal** — `removeModel` frees disk space, including a partial download.
- **Windows paths** — if the user name is non-Latin, models go to `C:\ProgramData\<App>`.

## Models

| Tier | Model | Size | Requires | License |
|---|---|---|---|---|
| Light | Qwen3 4B Instruct (default) | 2.5 GB | 8 GB RAM | Apache-2.0 |
| Strong | Qwen3 14B (default) | 9.0 GB | 16 GB RAM or 11 GB GPU | Apache-2.0 |

Chosen by meeting-protocol evals; Gemma 4 E4B/12B, GigaChat 3.1 Lightning, T-lite-it 2.1, YandexGPT 5 Lite 8B and Qwen3 8B were tested and fell below the threshold. Every catalog model is smoke-tested in CI.

## Install

```bash
npm install github:kozhevnikovai/local-ai node-llama-cpp
```

See the Russian README for a usage example. License: MIT; model weights follow their vendors' licenses.
