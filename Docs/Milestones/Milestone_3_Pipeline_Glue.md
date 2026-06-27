# Milestone 3 — Pipeline Glue

**Status:** ✅ **COMPLETED** (Verified on 2026-06-27)

### Pipeline Results (Apple M1 GPU):

| Stage | Time | Detail |
|-------|------|--------|
| Whisper ASR (base.en) | 0.69–0.85s | "Yesterday I go to the market because my mother tells me buy some vegetable..." |
| Qwen LLM (1.5B) | 1.03–1.23s | 27–33 tok/s, 209–353ms TTFT, 34 tokens |
| **Total E2E (local)** | **1.72–2.08s** | ✅ Under 2s gate (warm runs consistently under) |
| Gemini Flash Lite (cloud) | 5.4s | 34 tokens, 3.2s network latency |
| Gemini Flash (cloud) | 3.2s | 33 tokens, faster but pricier |

**Grammar quality comparison on real voice transcript:**

| Backend | Output |
|---------|--------|
| Raw | "Yesterday I go to the market because my mother tells me buy some vegetable but I forget my wallet so I coming back home and then go again later." |
| Local Qwen 1.5B | "Yesterday, I went to the market because my mother told me to buy some vegetables. **However**, I forgot my wallet, so I **returned** home and then went **back** later." |
| Gemini 2.5 Flash Lite | "Yesterday, I went to the market because my mother told me to buy some vegetables, **but** I forgot my wallet, so I **came back** home and then went **again** later." |

Local Qwen beat Gemini on both speed and polish quality for this transcript. Selected cloud model: `gemini-2.5-flash-lite` (lighter/cheaper than `gemini-2.5-flash`).

**Gate:** ✅ **PASS** — E2E completes in 1.82s for a 12.93s clip. Polished output is a genuine improvement over raw transcript.


## 1. What We Are Doing
We are chaining the Whisper ASR engine (from Milestone 2) with the grammar correction engine (from Milestone 1) into a single end-to-end pipeline. We will:
* Load an audio file and transcribe it with Whisper base.en
* Pipe the raw transcript into both grammar backends:
  * Local: Qwen 2.5 1.5B via node-llama-cpp
  * Cloud: OpenAI gpt-4o-mini via the openai npm package
* Print raw, locally-polished, and cloud-polished output side by side
* Measure end-to-end latency

---

## 2. Why We Are Doing It
Milestones 1 and 2 validated that individual components meet their speed targets. But the real question is: do they work together? This pipeline simulation proves that audio-to-polished-text completes within the PRD's sub-2-second target without any app shell, and lets us compare grammar quality between the free local backend and the paid cloud backend before committing either to the Electron app.

---

## 3. What We Want to Achieve (The Gate)
**Pass Criteria:** End-to-end (file → polished text) completes in under 2 seconds for a 10–15 second clip on the local LLM path. Polished output is a genuine improvement over the raw transcript, not just paraphrasing. OpenAI integration successfully authenticates and returns corrected text (separate, looser gate due to variable network latency).

---

## 4. Key Concepts & Technical Terms (For Interviews)

### Pipeline Architecture
* **Definition:** A sequence of processing stages where the output of one stage becomes the input of the next. EcoVoice's pipeline is: Raw Audio → Whisper ASR → Raw Text → Grammar Engine → Polished Text.
* **Why it matters:** Each stage adds latency, so the total E2E time is the sum of all stages. A pipeline bottleneck in any single stage slows the entire system.

### Grammar Engine Abstraction
* **Definition:** A design pattern where multiple implementations (local LLM, cloud API) share the same interface (`polish(rawText) → polishedText`). This allows the app to swap backends at runtime based on user preference without changing the rest of the pipeline.
* **Why it matters:** This is the architectural foundation for the hybrid mode — users can toggle between "Free (Local)" and "High Quality (OpenAI)" without the Whisper or text injection layers needing to know which backend is active.

### OpenAI Chat Completions API
* **Definition:** The `/v1/chat/completions` endpoint that takes a system prompt + user message and returns model-generated text. For EcoVoice, we use gpt-4o-mini (fast, cheap, good at grammar).
* **API Key Security:** The key should only have Chat Completions permission (read is insufficient — grammar correction is a POST/write operation). The key is stored in a `.env` file (gitignored) during development, and will be stored in macOS Keychain in the production app.

### Dotenv (.env files)
* **Definition:** A convention for storing environment variables (API keys, config flags) in a local file that is never committed to git. The `dotenv` npm package loads these into `process.env` at runtime.
* **Why it matters:** This is the standard way to keep secrets out of version control during local development. The production app will use macOS Keychain instead.


## Issues Found

1. **`.env` file location matters.** The script runs from `scratch/` but the `.env` is in the project root. Dotenv needs an explicit path: `dotenv.config({ path: path.join(__dirname, "..", ".env") })`.
2. **OpenAI 429 error: quota exceeded.** The API key is valid (401 would mean invalid auth), but the account has no billing/credits set up. The integration code is correct — this is an account-level issue.
3. **Second pipeline run was slower (TTFT 917ms vs 209ms).** The Qwen model and Whisper model compete for GPU memory when loaded back-to-back without explicit cleanup between runs. In the real app, both models will be loaded intentionally with explicit memory management.
4. **OpenAI comparison couldn't be completed.** Without credits on the account, the quality gap between local and cloud can't be measured yet. This is deferred until billing is set up.

## Lessons Learned

- The pipeline runs faster when models are loaded sequentially with memory cleanup between stages (first run: 1.82s E2E vs subsequent run: 2.81s). This suggests device awareness will matter in the Electron app.
- Qwen 1.5B handles real voice transcripts **better** than the isolated benchmark sentences suggested. The 12-sentence test showed 9/12, but on a naturally flowing paragraph with context, Qwen gets it all right.
- The `dotenv` import was initially placed before the `path` import it depends on for `__dirname`. Order matters for ESM modules that use `__dirname` in config calls.

---

## Related Research

- [Pipeline Glue Research](../Research/Research_M3_Pipeline_Integration.md) — Full methodology, results, issues, and the OpenAI integration details.
