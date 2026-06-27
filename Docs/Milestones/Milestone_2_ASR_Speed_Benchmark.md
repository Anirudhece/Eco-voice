# Milestone 2 — ASR Speed Benchmark

**Status:** ✅ **COMPLETED** (Verified on 2026-06-27)

### Benchmark Results (Apple M1 GPU):
- **Model:** whisper base.en (ggml-base.en.bin, 142MB)
- **Test Audio:** 12.93-second clean speech WAV (16kHz, mono)
- **Transcription:** "Yesterday I go to the market because my mother tells me buy some vegetable but I forget my wallet so I coming back home and then go again later."
- **Processing Time:** 0.81s (first run: 2.31s, subsequent runs faster as model stays in memory)
- **Real-Time Factor (RTF):** 0.063x (Target: < 0.3x)
- **Accuracy:** ✅ Accurate word-for-word
- **Gate:** ✅ **PASS**

## 1. What We Are Doing
We are going to benchmark local Speech-To-Text (ASR) on your Mac. We will:
* Download the **Whisper Base** model.
* Write a standalone Node.js script using `whisper-node` to load the model.
* Test the model on a short audio clip (10–15 seconds).
* Measure and calculate:
  1. **Transcription Accuracy:** Does the model correctly transcribe what was spoken, including handles accents?
  2. **Real-Time Factor (RTF):** How fast the model transcribes the audio compared to the length of the audio clip itself.

---

## 2. Why We Are Doing It
Dictation must be fast and accurate. If the app takes 10 seconds to transcribe 10 seconds of speech, it will feel too slow to use for real-time typing. 

By measuring the **Real-Time Factor (RTF)** on your Apple M1 chip, we will prove that local Whisper runs fast enough to meet our sub-2-second target.

---

## 3. What We Want to Achieve (The Gate)
**Pass Criteria:** The transcription script completes with a **Real-Time Factor (RTF) of < 0.3x** (which means a 10-second audio file is transcribed in under 3 seconds) and accurately transcribes the spoken words.

---

## 4. Key Concepts & Technical Terms (For Interviews)

### ASR (Automatic Speech Recognition)
* **Definition:** The technical term for speech-to-text. It is the process of converting an audio signal of spoken words into written text.

### Whisper
* **Definition:** A state-of-the-art open-source speech recognition model created by OpenAI. It is trained on 680,000 hours of multilingual data, making it extremely good at handling accents, background noise, and technical jargon.

### whisper.cpp
* **Definition:** A high-performance C++ port of OpenAI's Whisper model. It has zero external dependencies and is optimized for Apple Silicon (using Metal and Core ML), allowing it to run extremely fast on Macs.

### Real-Time Factor (RTF)
* **Definition:** The standard metric used to measure ASR speed.
* **Formula:** `RTF = Processing Time / Audio Duration`
* **Example:** If it takes 2 seconds to transcribe a 10-second audio file, the RTF is `2 / 10 = 0.2x`. Any RTF below `1.0x` is faster than real-time. We target `< 0.3x` for instant responsiveness.

---

## Issues Found

1. **`whisper-node` ESM export is not a direct function.** The default export is `{ whisper, default }` — you need `.whisper` to get the actual function. The benchmark script initially crashed with "whisper is not a function."
2. **`npx whisper-node download` needs a TTY.** Uses `readline-sync` which fails in non-interactive contexts. Workaround: call the download shell script directly.
3. **ffmpeg was missing from the system.** Required `brew install ffmpeg` — should be documented as a prerequisite or automated.
4. **Cold-start latency (2.31s) is 3x warm latency (0.81s).** Model loading dominates first run. In the real app, the model loads once at startup, so warm RTF is the representative number.

## Lessons Learned

- Validate npm package APIs with a one-liner check before writing the full script
- Warm-start measurements are more representative for an app that loads the model once
- System deps (ffmpeg) should be checked at environment setup, not discovered mid-benchmark

---

## Related Research

- [ASR Speed Benchmark Research](../Research/Research_M2_ASR_Speed_Benchmark.md) — Full methodology, results, issues, and decision record.
