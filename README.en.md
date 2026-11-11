# local-ai

Shared local AI model engine for [kozhevnikovai](https://github.com/kozhevnikovai) products ([Protokolist](https://github.com/kozhevnikovai/protokolist), [Tender Assistant](https://github.com/kozhevnikovai/tender-pomoshnik) and more). Everything runs on the user's computer; the only network step is a one-time model download.

[Русский](README.md)

## Features

- **Two model tiers** — "light" for regular PCs and laptops, "strong" for PCs with 16 GB RAM or a GPU.
- **Hardware-based choice** — checks RAM and GPU, recommends a model and explains why; the user can override.
- **Reliable download** — resume after interruption, free-space check, SHA-256, fallback mirror.
- **JSON-schema answers** — llama.cpp on CPU or GPU (CUDA, Vulkan, Metal), thinking disabled, loop protection.
- **Windows paths** — if the user name is non-Latin, models go to `C:\ProgramData\<App>`.

## Models

| Tier | Model | Size | Requires | License |
|---|---|---|---|---|
| Light | Qwen3 4B Instruct (default) | 2.5 GB | 8 GB RAM | Apache-2.0 |
| Light | Gemma 4 E4B | 5.0 GB | 8 GB RAM | Apache-2.0 |
| Strong | GigaChat 3.1 Lightning (default) | 6.5 GB | 16 GB RAM or 8 GB GPU | MIT |
| Strong | Gemma 4 12B | 7.1 GB | 16 GB RAM or 10 GB GPU | Apache-2.0 |

Defaults are chosen by product evals. Every catalog model is smoke-tested in CI.

## Install

```bash
npm install github:kozhevnikovai/local-ai node-llama-cpp
```

See the Russian README for a usage example. License: MIT; model weights follow their vendors' licenses.
