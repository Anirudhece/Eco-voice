# EcoVoice

A 100% private, serverless, system-wide speech-to-text writing assistant. Converts voice to text locally via Whisper, then optionally polishes grammar with either a local LLM or your own Gemini API key — all before injecting the text into any app.

**Platform:** macOS (Apple Silicon)

## Stack

- **Shell:** Electron (Node.js)
- **ASR:** whisper.cpp (whisper base.en, 142MB GGML)
- **Grammar (local):** Qwen 2.5 1.5B Instruct (Q4_K_M GGUF, 1.2GB) via node-llama-cpp
- **Grammar (cloud):** Gemini API (gemini-2.5-flash-lite) via OpenAI-compatible endpoint

## Project Status

Phase 1 — MVP benchmarks and pipeline validation.

| Milestone | Status |
|-----------|--------|
| M0 — Environment Setup | ✅ |
| M1 — LLM Speed Benchmark | ✅ (41 tok/s) |
| M2 — ASR Speed Benchmark | ✅ (RTF 0.063x) |
| M3 — Pipeline Glue | ✅ (1.72s E2E) |
| M4 — Electron Shell | ✅ |
| M5 — Audio Capture | ✅ |
| M6 — Text Injection | Pending |
| M7 — Settings + Models | Pending |
| M8 — Performance Hardening | Pending |
| M9 — Dogfooding | Pending |

## Running Benchmarks

```bash
cd scratch

# ASR speed test (requires test.wav audio file)
node benchmark_asr.js

# Grammar quality test (12-sentence benchmark + long-form dictation)
node benchmark_all.js

# Full pipeline (audio → Whisper → Qwen + Gemini)
node benchmark_pipeline.js
```

Record test audio with:
```bash
ffmpeg -f avfoundation -i ":0" -t 12 -acodec pcm_s16le -ac 1 -ar 16000 scratch/test.wav
```

Set `GEMINI_API_KEY` in `.env` to test the cloud grammar path.

## Docs

- [PRD](Docs/PRD.md) — Product requirements and architecture
- [Project Plan](Docs/EcoVoice_plan.md) — Milestones and gating decisions
- [M1 — LLM Benchmark](Docs/Milestones/Milestone_1_LLM_Speed_Benchmark.md)
- [M2 — ASR Benchmark](Docs/Milestones/Milestone_2_ASR_Speed_Benchmark.md)
- [M3 — Pipeline Glue](Docs/Milestones/Milestone_3_Pipeline_Glue.md)
- [Research: Grammar Evaluation](Docs/Research/Research_M1_Grammar_Correction_Evaluation.md)
- [Research: ASR Speed](Docs/Research/Research_M2_ASR_Speed_Benchmark.md)
- [Research: Pipeline Integration](Docs/Research/Research_M3_Pipeline_Integration.md)

## License

ISC
