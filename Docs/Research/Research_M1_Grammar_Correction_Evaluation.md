# Research: Grammar Correction Models Evaluation

**Date:** 2026-06-21
**Related Milestone:** [Milestone 1 — LLM Speed Benchmark](../Milestones/Milestone_1_LLM_Speed_Benchmark.md)
**Author:** Anirudh Jain

---

## Motivation

Milestone 1's gate required ≥35 tok/s generation speed, which Qwen 2.5 1.5B passed (41.03 tok/s). But the milestone only tested speed — it didn't deeply evaluate **correction quality**. Before committing Qwen as the app's grammar engine, we needed to know: *can a 1.5B parameter model actually fix grammar reliably?*

Initial testing showed both Qwen and Llama 1B had quality gaps. We expanded the evaluation to 12 error categories and progressively tested larger models to find one that meets the quality bar while staying fast enough for real-time use.

---

## What We Tested

### Models

| Model | Size | Runtime | Type |
|-------|------|---------|------|
| Qwen 2.5 1.5B Instruct (Q4_K_M GGUF) | 1.5B params | node-llama-cpp | General LLM (decoder-only) |
| Llama 3.2 1B Instruct (Q4_K_M GGUF) | 1B params | node-llama-cpp | General LLM (decoder-only) |
| Phi-4-mini 3.8B Instruct (Q4_K_M GGUF) | 3.8B params | node-llama-cpp | General LLM (decoder-only) |
| Gemma 3 4B Instruct (Q4_K_M GGUF) | 4B params | node-llama-cpp | General LLM (decoder-only) — **crashed** |
| **Qwen3 4B Instruct (Q4_K_M GGUF)** | **4B params** | **node-llama-cpp** | **General LLM (decoder-only, think/non-think)** |
| Xenova/t5-base-grammar-correction | ~220M params | @huggingface/transformers | Specialized GEC (encoder-decoder T5) |

### Prompt Variants Tested (Qwen & Llama only)

| Variant | Prompt Text | Effect |
|---------|-------------|--------|
| Original | `Fix grammar, spelling, and punctuation. Output professional English. Do NOT include explanations, greetings, or notes. Output only the corrected text.` | Baseline — 3/4 correct on Qwen, tense clash on #1 |
| Few-shot | Added 3 Input:/Output: examples | Made things worse: TTFT +80%, Llama hallucinated |
| Refined (final) | `Rewrite the user's input with correct grammar, spelling, and punctuation. Determine the intended tense from context and keep it consistent. Output only the corrected text.` | Best of the three — used in final benchmark |

### Test Dataset (12 error categories)

| # | Category | Input Sentence |
|---|----------|---------------|
| 1 | Tense consistency | i am go to store and buyed some apple but it was very expensiv |
| 2 | Subject-verb agreement | she do not likes coding but she need to did it for class |
| 3 | Past progressive | yesterday we was walking in park and it starts raining sudden so we got wet |
| 4 | Double negatives | i don't have nothing to do this weekend so i'm just staying home |
| 5 | Missing articles | i need to buy new phone because old one is broken |
| 6 | Prepositions | i am waiting you since morning where are you |
| 7 | Uncountable nouns | can you give me some informations about the course |
| 8 | Double comparative | this book is more better than that one i read last week |
| 9 | Mixed conditional | if i would be rich i will travel all around world |
| 10 | Gerund vs infinitive | i enjoy to play football but i avoid to run |
| 11 | Word order (adverb placement) | always i eat breakfast before go to work |
| 12 | Pronoun gender | my brother she is doctor and her work is very hard |

### Hardware

Apple M1 (8-core GPU), 16GB RAM, macOS. Metal GPU acceleration enabled for LLMs. ONNX runtime (CPU) for T5.

---

## Results

### Quality: Sentence-by-Sentence

| # | Category | Qwen 2.5 1.5B | Llama 3.2 1B | Phi-4-mini 3.8B | Qwen3 4B | T5 GEC |
|---|----------|---------------|--------------|-------------------|-----------|--------|
| 1 | Tense | ❌ "am going...bought" (clash) | ❌ same clash + quotes | ✅ "going...to buy" (rephrased) | ✅ "going...bought...were expensive" | ✅ "went...bought" |
| 2 | Subj-verb agree | ✅ Perfect | ✅ Perfect | ⚠️ + "(Past Tense)" annotation | ✅ Perfect | ✅ Perfect |
| 3 | Past progressive | ✅ Perfect | ✅ Perfect (no comma) | ✅ Perfect | ⚠️ no commas | ⚠️ Missing "the" |
| 4 | Double negatives | ✅ "anything" | ❌ hallucinated reply | ✅ "anything" | ✅ Perfect | ✅ "anything" |
| 5 | Articles | ✅ "a new", "my old" | ✅ same (lowercase i) | ✅ "a new", "my old" | ✅ Perfect | ⚠️ "the old" vs "my" |
| 6 | Prepositions | ✅ "waiting for you" | ❌ format contamination | ✅ "have been waiting" | ✅ "have been waiting" | ⚠️ missing "have been" |
| 7 | Uncountable nouns | ✅ "information" | ❌ hallucinated reply | ✅ "information" | ✅ Perfect | ✅ "information" |
| 8 | Double comparative | ✅ "better than" | ✅ "better than" (+ prefix) | ✅ "better than" | ✅ Perfect | ❌ kept "more better" |
| 9 | Mixed conditional | ✅ "if I were...would travel" | ✅ "if I were...would" | ✅ "if I were...would travel" | ✅ Perfect | ❌ kept "would be" |
| 10 | Gerund/infinitive | ✅ "enjoy playing" | ✅ "enjoy playing" | ✅ "enjoy playing" | ✅ Perfect | ❌ kept "enjoy to play" |
| 11 | Word order | ✅ "I always eat...going" | ✅ same (+ prefix) | ✅ "I always eat...going" | ✅ Perfect | ❌ kept "Always I eat" |
| 12 | Pronoun gender | ❌ "her work" (brother) | ✅ "his work" | ❌ "her work" + annotation | ❌ "her work" | ❌ "her work" |

### Aggregate Performance

| Model | Load Time | Total (12 sents) | Avg/Sent | Avg TTFT | Tok/s | Score |
|-------|-----------|-----------------|----------|----------|-------|-------|
| Qwen 2.5 1.5B | 1.2s | 5.89s | **491ms** | 191ms | **27.9** | 9/12 |
| Llama 3.2 1B | 0.9s | 6.88s | 574ms | 249ms | 28.9 | 8/12 |
| Phi-4-mini 3.8B | 2.6s | 12.61s | 1,051ms | 462ms | 13.6 | 11/12 (9/12 clean) |
| **Qwen3 4B (non-think)** | **2.0s** | **14.83s** | **1,236ms** | **605ms** | **10.8** | **12/12** |
| Qwen3 4B (think mode) | 1.8s | 389.30s | 32,442ms | 594ms | 0.4 | 12/12 |
| T5 GEC | 7.8s | 4.93s | 411ms | N/A | 28.6 | 4/12 |

---

## Observations

### Qwen 2.5 1.5B (9/12 — Most Reliable, Fastest)
- **Strengths:** Handles all structural grammar errors (comparatives, conditionals, word order, gerunds). Zero hallucinations — always returns a valid correction. Consistent format (no stray quotes or prefixes). Fastest of all models (491ms avg).
- **Weaknesses:** Tense clash on sentence #1 ("am going...bought") — it latches onto the first verb's tense and ignores context cues. Pronoun gender confusion on #12 — kept "her" for "brother". Missing word order fix on long-form ("always I forget" kept as-is).
- **Verdict:** Best speed, reliable output, but 9/12 quality. Good enough for MVP, known gaps in tense and pronoun gender.

### Llama 3.2 1B (8/12 — Disqualified)
- **Strengths:** When it works, corrections are good (fixed tense on #1, pronoun gender on #12). Faster load time than Qwen.
- **Weaknesses:** 3 catastrophic failures — sentences #4, #6, #7 triggered full hallucination (chatbot replies, format echo, content injection). Inconsistent output format (sometimes quotes, sometimes "Corrected text:" prefix, sometimes raw). This is a dealbreaker for a tool that needs to work every time — users can't have their input randomly replaced with chatbot nonsense.
- **Verdict:** Cannot ship this. The hallucination risk is too high.

### Phi-4-mini 3.8B (11/12 grammar, 9/12 clean — Disqualified on Latency)
- **Strengths:** Best grammar of any tested model — 11/12 error categories. Fixed word order ("always I eat" → "I always eat") which Qwen missed. Used present perfect on #6 ("have been waiting") which is more natural. Strong subject-verb agreement, comparatives, conditionals, and gerund/infinitive handling.
- **Weaknesses:** Two format contamination issues on short sentences — added `(Past Tense)` after #2 and `(The intended tense is present.)` after #12. These are unwanted annotations despite the "Output only the corrected text" instruction. Still fails on pronoun gender (#12, kept "her" for "brother"). Significantly slower: 2x Qwen's latency (1,051ms vs 491ms avg), 2.3x slower on long-form (25.28s vs 9.73s).
- **Verdict:** Best grammar quality but 2x slower than Qwen. Format issues require prompt work. Disqualified on latency for real-time use.

### Qwen3 4B (12/12 — Perfect Grammar, Thinking Mode Kills Speed)
- **Strengths:** Perfect 12/12 grammar score on short sentences. No format contamination — clean output every time. Fixed word order on long-form ("always I forget" → "I always forget") which Qwen 2.5 1.5B missed. Clean, professional output. Same architecture family as Qwen 2.5 so no compatibility issues.
- **Weaknesses:** 2.5x slower than Qwen 2.5 1.5B (1,236ms vs 491ms avg, 24.17s vs 9.73s long-form). Still fails on pronoun gender (#12 — entire Qwen family shares this blind spot). Missing commas on #3.
- **Thinking Mode Discovery:** Qwen3 ships with a "thinking mode" that generates internal chain-of-thought tokens before answering. In our initial benchmark, thinking mode was ON by default — this caused the model to burn through hundreds of invisible tokens internally, resulting in **0.4 tok/s** (vs 10.8 tok/s without thinking). The 27x speedup was achieved by passing `thoughts: "discourage"` to the `QwenChatWrapper`. This is critical — anyone testing Qwen3 models needs to explicitly disable thinking mode or the model will appear unusably slow.
- **Verdict:** Best grammar (12/12) but 2.5x slower than Qwen 1.5B. If long-form speed can be improved through model optimization (e.g., Q5_0 or IQ4_XS quantization), it could become the production model.

### T5 GEC (4/12 — Fast but Incomplete)
- **Strengths:** Fastest inference by 2-3x (411ms avg vs 491ms). Smallest model (220M params). Zero hallucinations — it's specialized and stays on task. Fixed the tense on sentence #1 (the one neither LLM could handle). Handles surface-level corrections well (articles, subject-verb agreement, negatives, uncountable nouns).
- **Weaknesses:** Completely misses structural/syntactic errors — left "more better", "would be", "enjoy to play", and "Always I eat" uncorrected. Lowercase outputs, missing commas. Training data (C4-200M, JFLEG) apparently didn't cover these patterns.
- **Verdict:** Not suitable as the sole grammar engine. Could work as a fast first-pass filter if combined with something else for structural fixes.

---

## Issues Found

1. **1-1.5B LLMs hit a quality ceiling on grammar.** Prompt engineering didn't help — few-shot examples actually made things worse (+80% TTFT, hallucinations). The models are too small to reliably understand grammatical rules from instructions alone.

2. **T5 GEC can't handle structural errors.** It's fine for surface-level fixes (articles, plurals) but fails on comparatives, conditionals, gerund/infinitive, and word order — exactly the kind of structural errors non-native speakers need fixed.

3. **Catastrophic hallucination in Llama 1B.** 3 out of 12 sentences triggered completely wrong outputs. This isn't fixable with better prompting — it's a model capacity limitation.

4. **Qwen model family shares a pronoun gender blind spot.** Qwen 2.5 1.5B, Qwen3 4B, and Phi-4-mini all failed sentence #12 (keeping "her" for "brother"). Only Llama 1B got this right. This suggests gender disambiguation from minimal context is a systemic weakness in the Qwen training data, not a parameter count issue.

5. **Qwen3 thinking mode is a hidden performance killer.** The model's default thinking mode generates invisible chain-of-thought tokens that silently multiply latency by 27x. This isn't obvious from benchmarks or documentation — it was discovered accidentally through the blank-line artifacts in output and the absurd 0.4 tok/s speed. Always disable thinking mode for grammar correction tasks.

6. **Gemma 3 4B is incompatible with current node-llama-cpp.** The `gemma3` architecture causes a segfault in llama.cpp b8390 during Metal GPU initialization. This isn't fixable without a library upgrade.

---

## Lessons Learned

- **Small LLMs (1-1.5B) are great for structured tasks but unreliable for nuanced grammar correction.** The reasoning capacity isn't there yet.
- **Specialized GEC models are fast and hallucination-free but have blind spots.** They only know what they were trained on — structural errors may be underrepresented in training data.
- **Prompt engineering has diminishing returns at this scale.** The refined prompt improved things marginally over the original, but few-shot made things worse. You can't prompt your way out of a model capacity problem.
- **Benchmarking with only 4 sentences was dangerously misleading.** The original 4-sentence test showed T5 GEC as the clear winner. Expanding to 12 sentences revealed it can't handle half the error types. **Always test broadly before making a decision.**
- **Testing latency in isolation is not enough.** Milestone 1 proved Qwen was fast enough (41 tok/s), but the quality evaluation showed it isn't good enough. Speed gates and quality gates are both necessary.
- **Always check for thinking/CoT modes on newer models.** The 27x performance gap between think and non-think modes on Qwen3 was an accidental discovery. Default settings can be catastrophically wrong for latency-sensitive tasks.

---

## Qwen3 4B: Thinking vs Non-Thinking Mode

### Discovery

During the initial Qwen3 4B benchmark, the model appeared broken — generating at **0.4 tok/s** (vs Qwen 1.5B's 27.9 tok/s) and taking **389 seconds** to complete 12 sentences. Each output was preceded by a blank line, suggesting the model was generating invisible tokens.

Investigation revealed that Qwen3 models ship with a "thinking mode" by default (`QwenChatWrapper` variation "3"). In this mode, the model generates internal chain-of-thought tokens wrapped in `<think>...</think>` tags before producing the visible answer. These thinking tokens are stripped from the output by the chat wrapper, so the user never sees them — but they still consume generation time.

### Fix

Two methods were identified in the QwenChatWrapper source code:

1. **`thoughts: "discourage"`** — The recommended approach. Passed as an option to `QwenChatWrapper`. This forces an empty `<think></think>` block before the answer, preventing the model from generating thinking tokens. Used for the final benchmark.

2. **`keepOnlyLastThought: false`** (default is `true`) — Controls whether `<think>` blocks from previous messages in the chat history are retained. Not relevant for our stateless one-shot usage.

### Before/After Comparison

| Metric | Think Mode (default) | Non-Think (`thoughts: "discourage"`) | Improvement |
|--------|---------------------|--------------------------------------|-------------|
| Short avg/sent | 32,442ms | **1,236ms** | **26x faster** |
| Tok/s (short) | 0.4 | **10.8** | **27x faster** |
| Long-form total | 97,787ms | **24,172ms** | **4x faster** |
| Grammar score | 12/12 | 12/12 | Same |
| Format issues | None | None | Same |

**Key takeaway:** Disabling thinking mode has zero impact on grammar quality — the model produces identical corrections either way. The thinking tokens serve no purpose for grammar correction tasks and should always be disabled.

---

## Long-Form Dictation Test (~350 words / ~2 min speech)

After the initial 12-sentence benchmark, we added a realistic long-form dictation (~309 words simulating a 2-minute voice memo) to test how each model handles paragraph-level input.

### Input (full)

```
hi team i am writing to give you update on the project we was working on last week. so basically i finish the report that my manager she ask me to do but i am not sure if it is complete because there is some informations that i still need to collect from the client. the client he keep saying that he will send me the datas but he never did it yet. i think we need to send him a reminder email again maybe but i dont want to be annoying you know.

also i am thinking that maybe we should change the timeline because the original deadline it was too tight and the team they is working very hard but still cannot finish everything on time. i spoke to john about this yesterday and he also agree that we need more better plan for the next phase. he suggest that we should break the project into smaller pieces so that we can manage it more easier.

anyway please let me know if you have any thoughs about this. i can setup a meeting for tomorrow if everyone is available. also sorry for the late reply on your previous email i was busy with some others task that my collegue she assign to me at the last minute. i hope we can resolve all this issues by the end of this week if possible because next week i will be on vacation and i dont want to leave nothing pending.

one more thing, always i forget to mention this but the new software that we are testing it is causing some problem on my computer. it crash multiple time already and i am losing my work. can you please look into this when you get a chance. thanks everyone for your support and understanding have a great day
```

### Results

| Model | Time | TTFT | Tokens | Output Quality |
|-------|------|------|--------|----------------|
| Qwen 2.5 1.5B | **9.73s** | 735ms | 340 | ✅ Nearly perfect — missed only word order |
| Llama 3.2 1B | 8.73s | 671ms | 358 | ⚠️ Added preamble, changed tone |
| Phi-4-mini 3.8B | 25.28s | 2,093ms | 324 | ✅ Best quality overall — fixed everything |
| **Qwen3 4B (non-think)** | **24.17s** | **2,271ms** | 345 | ✅ Fixed word order, good quality |
| T5 GEC | 2.26s | N/A | 101 | ❌ Truncated mid-sentence |

### Key Observations

**Qwen 2.5 1.5B** handled the long-form input surprisingly well:
- Corrected tense throughout ("was working" → "were working", "finish" → "finished")
- Fixed subject-verb agreement ("team they is" → "team is")
- Corrected uncountable nouns ("informations" → "information", "datas" → "data")
- Fixed comparatives ("more better" → "better", "more easier" → "more easily")
- Fixed double negatives ("don't want to leave nothing" → "don't want to leave anything")
- **Missed only:** "always I forget" (word order) — kept it as "always I forget" instead of "I always forget"
- Preserved meaning and tone throughout. Proper paragraph structure. Production-viable quality at 9.73s.

**Qwen3 4B** fixed the word order blind spot that Qwen 1.5B missed:
- Fixed "always I forget" → "I always forget" — the one error Qwen 1.5B couldn't handle
- Corrected other errors Qwen 1.5B already handled (tense, agreement, comparatives, etc.)
- Good structure with proper paragraph breaks
- Clean output with no format contamination
- Speed: 24.17s (2.5x slower than Qwen 1.5B's 9.73s)
- For dictation, the extra 14 seconds of processing time may be acceptable if word order quality matters

**T5 GEC** has a hard 512-token input limit that makes it unusable for long dictation:
- Output was truncated mid-sentence after only ~100 tokens
- Lost paragraph structure (single block of text)
- Lowercased everything
- T5 GEC is only suitable for sentence-level corrections, not paragraph-level dictation

**Llama 3.2 1B** continued its pattern of unreliability with preamble noise and tone changes.

---

## Key Insight: Context Dependence

Every model performed **better on the long dictation than on isolated short sentences**. Longer text provides more context — the model can infer tense from surrounding verbs, resolve pronouns from earlier references, and understand the document's overall tone. The 12 short-sentence benchmark is a **harder test** than real usage because it strips all context.

This means:
- **Real-world dictation will naturally produce better corrections than the benchmarks suggest** because users dictate paragraphs, not isolated sentences
- **The short-sentence benchmark is useful for stress-testing but doesn't reflect real-world performance**
- **Prioritize models based on long-form quality** — that's the actual user experience

---

## Models Removed From Active Testing

Based on cumulative evidence, four models are removed from further consideration:

**Llama 3.2 1B** — 3/12 catastrophic hallucinations on short sentences, format contamination on long-form. Unreliable output is a dealbreaker for a tool that must work every time.

**Xenova/t5-base-grammar-correction (T5 GEC)** — 4/12 on short sentences (misses all structural errors: comparatives, conditionals, gerunds, word order). Hard 512-token limit causes truncation on any paragraph-length input. Only viable for single-sentence surface-level fixes.

**Gemma 3 4B (unsloth GGUF)** — Could not be benchmarked. The model loaded far enough for llama.cpp to recognize the `gemma3` architecture but segfaulted during Metal GPU initialization on Apple M1 (16GB). The crash occurred at the native C++ layer during thread pool GPU operations, likely caused by one of:
- Sliding Window Attention (SWA) not fully supported in the bundled llama.cpp b8390 with Metal
- A quirk in the unsloth GGUF conversion for Gemma 3's multimodal architecture
- GPU memory pressure on M1's 16GB unified memory during model loading
The bundled `node-llama-cpp` v3.18.1 ships llama.cpp b8390, which may not have full `gemma3` architecture stability on Metal.

**Phi-4-mini 3.8B** — Best grammar among tested models (11/12, fixed word order Qwen missed), but 2x slower (1,051ms avg, 25s long-form) and had format contamination on short sentences (2/12 with unwanted annotations). The speed gap made it impractical for real-time use despite better quality. Disqualified on latency.

---

## Decision: Qwen 2.5 1.5B vs Qwen3 4B

The final contenders are both Qwen family models:

| | Qwen 2.5 1.5B | Qwen3 4B |
|---|---|---|
| Grammar (short) | 9/12 | **12/12** |
| Pronoun gender | ❌ | ❌ (shared blind spot) |
| Word order (long-form) | ❌ "always I forget" | ✅ "I always forget" |
| Avg/sentence | **491ms** | 1,236ms (2.5x slower) |
| Long-form total | **9.73s** | 24.17s (2.5x slower) |
| Tok/s | **27.9** | 10.8 |
| Format issues | None | None |

**Trade-off:** Qwen3 4B fixes the word order blind spot and scores perfect 12/12 on short sentences, but at 2.5x the latency. For dictation use cases (where latency is secondary to accuracy), the extra 14 seconds may be acceptable. For interactive use (sentence-by-sentence correction), Qwen 2.5 1.5B's sub-500ms response time is superior.

**Next step:** Test Qwen3 4B speed optimizations (IQ4_XS quantization, smaller context window) to see if the 10.8 tok/s can be improved closer to Qwen 1.5B's 27.9 tok/s.

---

## Architecture Decision: Hybrid Local + OpenAI

**Date:** 2026-06-23
**Status:** Decided

### Context

After comprehensive benchmarking across 12 ESL error categories:
- **Qwen 2.5 1.5B** scores 9/12 — misses tense consistency, pronoun gender, and word order
- **Qwen3 4B** scores 12/12 but runs 2.5x slower (1,236ms avg vs 491ms) and shares the pronoun gender blind spot
- **Neither model bridges the quality-speed gap** well enough to be the sole grammar engine

### Decision

Adopt a **hybrid architecture** where users can choose between:
1. **Local mode** (default free path): Qwen 2.5 1.5B via node-llama-cpp — fast, private, offline-capable, good-enough quality
2. **OpenAI API mode** (optional, user-provided key): GPT-4o-mini (or similar) — higher quality, requires internet, incurs user's own API costs (storage is encrypted in macOS Keychain)

The user selects their preferred path from the settings page. No default is preselected — the choice is presented during first-run setup.

### Implications

- **Qwen3 4B removed from consideration** — the quality gain over Qwen 1.5B doesn't justify the 2.5x latency hit, and the OpenAI path provides a cleaner upgrade path for users who need better quality
- **Phi-4-mini 3.8B removed from consideration** — best grammar but too slow (1,051ms avg, 2.5x on long-form) and had format contamination
- **Application code needs a grammar engine abstraction** — a common interface with two implementations: `LocalGrammarEngine` (node-llama-cpp) and `OpenAIGrammarEngine` (openai npm package)
- **Settings page becomes MVP scope** — API key input, mode toggle, and visual mode indicator are now required features
- **Milestone plan updated** — M7 now includes the settings page alongside model management
