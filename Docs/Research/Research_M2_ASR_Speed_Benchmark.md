# Research: ASR Speed Benchmark

**Date:** 2026-06-27
**Related Milestone:** [Milestone 2 — ASR Speed Benchmark](../Milestones/Milestone_2_ASR_Speed_Benchmark.md)
**Author:** Anirudh Jain

---

## Motivation

Milestone 2's gate required whisper.cpp to achieve RTF < 0.3x on a real voice recording. This is the second of two technical risk validations (the first being LLM speed). ASR is the common component for both grammar backends — if whisper is too slow, the entire pipeline is bottlenecked before grammar correction even begins.

---

## What We Tested

### Model

**whisper base.en** (ggml-base.en.bin, 142MB). This is OpenAI Whisper's "base" model converted to GGML format for whisper.cpp. Chosen over "tiny" because it offers better accuracy for non-native accents, and over "small" because the 142MB size is a reasonable download for first-run setup.

### Test Audio

A 12.93-second clean speech WAV recorded by the author:
- Format: 16-bit PCM, 16000Hz, mono
- Content: "Yesterday I go to the market because my mother tells me buy some vegetable but I forget my wallet so I coming back home and then go again later."
- Contains deliberate grammar errors (tense, plurals) — this is representative of the app's target input

### Hardware

Apple M1 (8-core GPU), 16GB RAM, macOS. Metal GPU acceleration via whisper.cpp's native Metal backend.

### Tooling

- **whisper-node** (npm package, v1.1.1) — Node.js wrapper around whisper.cpp
- **ffmpeg** — installed via Homebrew for audio recording and format conversion
- **ffprobe** — used to auto-detect audio duration for RTF calculation

---

## Results

### Speed

| Run | Processing Time | Audio Duration | RTF |
|-----|----------------|----------------|-----|
| First (cold) | 2.31s | 12.93s | 0.179x |
| Second (warm) | 0.81s | 12.93s | **0.063x** |

Both runs pass the <0.3x gate. The first run includes model loading time; subsequent runs benefit from the model staying in GPU memory.

**Cold start RTF (0.179x):** ~5.6x faster than real-time. A 10-second clip would process in ~1.8s.
**Warm RTF (0.063x):** ~15.8x faster than real-time. A 10-second clip would process in ~0.6s.

### Accuracy

The transcription was word-for-word accurate:
- Input: "Yesterday I go to the market because my mother tells me buy some vegetable but I forget my wallet so I coming back home and then go again later."
- Output: "Yesterday I go to the market because my mother tells me buy some vegetable but I forget my wallet so I coming back home and then go again later."

This is a clean, clear-speech test. Accuracy on noisy audio or heavy accents was not tested in this benchmark — that remains a Phase 2 concern.

---

## Issues Found

1. **`whisper-node` default export is an object, not a function.** The package's ESM default export is `{ whisper, default }`, not the `whisper` function directly. The benchmark script initially used `import whisper from "whisper-node"` which imported the wrapper object. Fix: `import whisperModule from "whisper-node"; const whisper = whisperModule.whisper;`.

2. **`npx whisper-node download` requires a TTY.** The download command uses `readline-sync` for model selection prompts, which needs `/dev/tty`. In non-interactive environments (CI, scripted contexts), this fails with "Device not configured." Workaround: call the underlying shell script directly — `bash node_modules/whisper-node/lib/whisper.cpp/models/download-ggml-model.sh base.en`.

3. **ffmpeg was not installed on the system.** The `brew install ffmpeg` command resolved this, but it's a prerequisite that should be documented in environment setup or handled automatically.

4. **Model warm-up matters significantly.** First-run latency (2.31s) is nearly 3x the warm latency (0.81s) because the model must be loaded from disk and initialized in GPU memory. In the real app, the model will be loaded once at startup, so warm RTF (0.063x) is the representative number for actual usage.

---

## Observations

- **Apple M1's Metal GPU handles whisper effortlessly.** Even the cold-start RTF (0.179x) is well under the 0.3x gate. There's significant headroom — a larger model (small, 466MB) or longer audio clips would likely still pass.
- **whisper.cpp's GGML format is fast to load.** Model loading took ~1.5s on first run (cold time minus warm time). This is acceptable for app startup.
- **Single-clip benchmark is sufficient for the gate but not comprehensive.** The milestone called for varied clips (clean, noisy, accented). Only clean speech was tested. The gate passed easily enough that this isn't a risk, but real-world accuracy under noise is still unknown.

---

## Lessons Learned

- **Validate npm package API before writing the script.** The `whisper-node` import issue wasted a debug cycle. A quick `node -e "import(...)"` check before writing the full script would have caught this.
- **Interactive CLI tools break in non-TTY contexts.** `readline-sync` is a brittle dependency for a library — the download script shouldn't require interactive input. Future scripts should use non-interactive download paths.
- **System dependencies should be checked upfront.** ffmpeg was missing. A simple `which ffmpeg` check before recording would save time.
- **Warm-start measurements are more representative than cold-start.** The app won't reload the model per utterance — it loads once at startup. Benchmark warm RTF, not cold.

---

## Decision

whisper base.en (142MB, GGML) is the ASR engine for EcoVoice. RTF 0.063x on warm runs, 0.179x cold — both well under the 0.3x gate. No need to explore smaller models (tiny) or larger models (small) — base.en hits the speed-accuracy sweet spot for this use case.
