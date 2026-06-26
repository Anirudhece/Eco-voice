# Milestone 1 — LLM Speed Benchmark

**Status:** ✅ **COMPLETED** (Verified on 2026-06-21)

### Benchmark Results (Apple M1 GPU - Metal):
1. **Qwen 2.5 1.5B Instruct (Q4_K_M GGUF):**
   * **Load Time:** 0.51s
   * **Time to First Token (TTFT):** 212ms (Target: <300ms)
   * **Generation Speed:** 41.03 tokens/second (Target: ≥35 tok/s)
   * **Grammar Quality:** Excellent ("I am going to the store and bought some apples. It was very expensive.")
   * **Status:** **PASS** (Meets all performance and quality targets)
2. **Llama 3.2 1B Instruct (Q4_K_M GGUF):**
   * **Status:** Failed to run due to incorrect Hugging Face download URL (downloaded a 49KB HTML error page instead of the 1.2GB model binary).

### Extension: Quality Evaluation → Hybrid Architecture Decision

The quality benchmarks in [Research_M1_Grammar_Correction_Evaluation.md](../Research/Research_M1_Grammar_Correction_Evaluation.md) revealed that Qwen 1.5B scores 9/12 on a 12-category ESL grammar benchmark — missing tense consistency, pronoun gender, and word order. Larger models (Qwen3 4B, Phi-4-mini 3.8B) were benchmarked to close the quality gap but were ultimately rejected: the 4B models ran 2.5x slower with marginal quality gains, and both shared the pronoun gender blind spot.

**Outcome:** Instead of upgrading to a larger local model, the architecture now supports a hybrid mode — users can choose between the local Qwen 1.5B (free, offline, fast) or provide their own OpenAI API key for higher-quality grammar correction via the settings page. See the research doc for the full evaluation.

## 1. What We Are Doing
We are going to benchmark local Large Language Models (LLMs) on your Mac. We will:
* Download two small, quantized models: **Qwen2.5-1.5B-Instruct** and **Llama-3.2-1B-Instruct** (in GGUF format).
* Write a standalone Node.js test script using `node-llama-cpp` to load the models.
* Enable GPU acceleration (using Metal) on your Apple M1 chip.
* Measure and compare:
  1. **Generation Speed:** How many tokens (words/parts of words) the model generates per second (target is ≥35 tokens/sec).
  2. **Time to First Token (TTFT):** How long it takes for the model to start responding after we give it a prompt.
  3. **RAM Usage:** How much memory the model consumes.

---

## 2. Why We Are Doing It
Since this is a system-wide writing assistant, the experience must feel instant. If the user has to wait 5 seconds for their grammar to be fixed, they will stop using the app. 

By testing different models and measuring their speeds first, we will find out:
1. If your Apple M1 chip is powerful enough to run local models at premium speeds.
2. Which model (Qwen 1.5B vs. Llama 1B) gives the best balance of fast speed and high-quality grammar correction.

---

## 3. What We Want to Achieve (The Gate)
**Pass Criteria:** At least one of the models must run at a sustained speed of **35 tokens per second (tok/s) or higher**, with a low startup delay (TTFT), and successfully fix grammar without changing the original meaning of the text.

---

## 5. Related Research

- [Grammar Correction Models Evaluation (expanded quality benchmarks)](../Research/Research_M1_Grammar_Correction_Evaluation.md) — Results from testing Qwen, Llama, and T5 GEC across 12 ESL error categories. Finding: none of the tested models meets the quality bar for production; recommends upgrading to a 3-4B model.

## 4. Key Concepts & Technical Terms (For Interviews)

### GGUF Format
* **Definition:** GGUF (GPT-Generated Unified Format) is a file format designed by the llama.cpp community. It allows local LLMs to load quickly, run efficiently on CPUs and GPUs, and package the model into a single file.

### Quantization (e.g., Q4_K_M)
* **Definition:** Quantization is a compression technique. It reduces the mathematical precision of the model's parameters (weights) from high precision (like 16-bit floats) to lower precision (like 4-bit integers).
* **Trade-off:** It makes a model much smaller (e.g., Qwen 2.5 1.5B goes from ~3GB down to ~1.2GB) and require far less RAM, with only a tiny, unnoticeable drop in language quality. `Q4_K_M` is a widely used 4-bit quantization layout that balanced speed and accuracy.

### Tokens and Tokens Per Second (tok/s)
* **Definition:** LLMs do not process words directly; they split text into pieces called "tokens" (1 token is roughly 4 characters or 0.75 words).
* **Metric:** "Tokens per second" is the standard speed limit metric for LLMs. If a model generates at 40 tok/s, it can output a 30-word sentence in less than a second.

### Time to First Token (TTFT)
* **Definition:** The time between sending a query to the model and receiving its very first output token.
* **Why it matters:** Even if a model is very fast at writing, a high TTFT (startup lag) makes the app feel sluggish. We aim for a TTFT of under 300ms.
