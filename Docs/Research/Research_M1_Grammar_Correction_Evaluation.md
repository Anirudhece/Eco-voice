# Research: Grammar Correction Models Evaluation

**Date:** 2026-06-21
**Related Milestone:** [Milestone 1 — LLM Speed Benchmark](../Milestones/Milestone_1_LLM_Speed_Benchmark.md)
**Author:** Anirudh Jain

---

## Motivation

Milestone 1's gate required ≥35 tok/s generation speed, which Qwen 2.5 1.5B passed (41.03 tok/s). But the milestone only tested speed — it didn't deeply evaluate **correction quality**. Before committing Qwen as the app's grammar engine, we needed to know: *can a 1.5B parameter model actually fix grammar reliably?*

Initial testing showed both Qwen and Llama 1B had quality gaps. We expanded the evaluation to 12 error categories and added a third approach — specialized T5 GEC via Transformers.js.

---

## What We Tested

### Models


| Model                                      | Size            | Runtime                   | Type                                 |
| ------------------------------------------ | --------------- | ------------------------- | ------------------------------------ |
| Qwen 2.5 1.5B Instruct (Q4_K_M GGUF)       | 1.5B params     | node-llama-cpp            | General LLM (decoder-only)           |
| Llama 3.2 1B Instruct (Q4_K_M GGUF)        | 1B params       | node-llama-cpp            | General LLM (decoder-only)           |
| **Phi-4-mini 3.8B Instruct (Q4_K_M GGUF)** | **3.8B params** | **node-llama-cpp**        | **General LLM (decoder-only)**       |
| Xenova/t5-base-grammar-correction          | ~220M params    | @huggingface/transformers | Specialized GEC (encoder-decoder T5) |


### Prompt Variants Tested (Qwen & Llama only)


| Variant         | Prompt Text                                                                                                                                                                   | Effect                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Original        | `Fix grammar, spelling, and punctuation. Output professional English. Do NOT include explanations, greetings, or notes. Output only the corrected text.`                      | Baseline — 3/4 correct on Qwen, tense clash on #1 |
| Few-shot        | Added 3 Input:/Output: examples                                                                                                                                               | Made things worse: TTFT +80%, Llama hallucinated  |
| Refined (final) | `Rewrite the user's input with correct grammar, spelling, and punctuation. Determine the intended tense from context and keep it consistent. Output only the corrected text.` | Best of the three — used in final benchmark       |


### Test Dataset (12 error categories)


| #   | Category                      | Input Sentence                                                              |
| --- | ----------------------------- | --------------------------------------------------------------------------- |
| 1   | Tense consistency             | i am go to store and buyed some apple but it was very expensiv              |
| 2   | Subject-verb agreement        | she do not likes coding but she need to did it for class                    |
| 3   | Past progressive              | yesterday we was walking in park and it starts raining sudden so we got wet |
| 4   | Double negatives              | i don't have nothing to do this weekend so i'm just staying home            |
| 5   | Missing articles              | i need to buy new phone because old one is broken                           |
| 6   | Prepositions                  | i am waiting you since morning where are you                                |
| 7   | Uncountable nouns             | can you give me some informations about the course                          |
| 8   | Double comparative            | this book is more better than that one i read last week                     |
| 9   | Mixed conditional             | if i would be rich i will travel all around world                           |
| 10  | Gerund vs infinitive          | i enjoy to play football but i avoid to run                                 |
| 11  | Word order (adverb placement) | always i eat breakfast before go to work                                    |
| 12  | Pronoun gender                | my brother she is doctor and her work is very hard                          |


### Hardware

Apple M1 (8-core GPU), 16GB RAM, macOS. Metal GPU acceleration enabled for LLMs. ONNX runtime (CPU) for T5.

---

## Results

### Quality: Sentence-by-Sentence


| #   | Category           | Qwen 2.5 1.5B                 | Llama 3.2 1B               | **Phi-4-mini 3.8B**                    | T5 GEC                 |
| --- | ------------------ | ----------------------------- | -------------------------- | -------------------------------------- | ---------------------- |
| 1   | Tense              | ❌ "am going...bought" (clash) | ❌ same clash + quotes      | ✅ "going...to buy" (rephrased)         | ✅ "went...bought"      |
| 2   | Subj-verb agree    | ✅ Perfect                     | ✅ Perfect                  | ⚠️ Perfect + "(Past Tense)" annotation | ✅ Perfect              |
| 3   | Past progressive   | ✅ Perfect                     | ✅ Perfect (no comma)       | ✅ Perfect                              | ⚠️ Missing "the"       |
| 4   | Double negatives   | ✅ "anything"                  | ❌ hallucinated reply       | ✅ "anything"                           | ✅ "anything"           |
| 5   | Articles           | ✅ "a new", "my old"           | ✅ same (lowercase i)       | ✅ "a new", "my old"                    | ⚠️ "the old" vs "my"   |
| 6   | Prepositions       | ✅ "waiting for you"           | ❌ format contamination     | ✅ "have been waiting for you"          | ⚠️ missing "have been" |
| 7   | Uncountable nouns  | ✅ "information"               | ❌ hallucinated reply       | ✅ "information"                        | ✅ "information"        |
| 8   | Double comparative | ✅ "better than"               | ✅ "better than" (+ prefix) | ✅ "better than"                        | ❌ kept "more better"   |
| 9   | Mixed conditional  | ✅ "if I were...would travel"  | ✅ "if I were...would"      | ✅ "if I were...would travel"           | ❌ kept "would be"      |
| 10  | Gerund/infinitive  | ✅ "enjoy playing"             | ✅ "enjoy playing"          | ✅ "enjoy playing"                      | ❌ kept "enjoy to play" |
| 11  | Word order         | ✅ "I always eat...going"      | ✅ same (+ prefix)          | ✅ "I always eat...going"               | ❌ kept "Always I eat"  |
| 12  | Pronoun gender     | ❌ "her work" (brother)        | ✅ "his work"               | ❌ "her work" + annotation              | ❌ "her work"           |


### Aggregate Performance


| Model               | Load Time | Total (12 sents) | Avg/Sent    | Avg TTFT  | Tok/s    | Score                  |
| ------------------- | --------- | ---------------- | ----------- | --------- | -------- | ---------------------- |
| Qwen 2.5 1.5B       | 1.0s      | 6.39s            | 533ms       | 209ms     | 25.7     | **9/12**               |
| Llama 3.2 1B        | 0.9s      | 6.88s            | 574ms       | 249ms     | 28.9     | 8/12                   |
| **Phi-4-mini 3.8B** | **2.6s**  | **12.61s**       | **1,051ms** | **462ms** | **13.6** | **11/12** (9/12 clean) |
| T5 GEC              | 7.8s      | 4.93s            | **411ms**   | N/A       | 28.6     | 4/12                   |


---

## Observations

### Qwen 2.5 1.5B (9/12 — Most Reliable)

- **Strengths:** Handles all structural grammar errors (comparatives, conditionals, word order, gerunds). Zero hallucinations — always returns a valid correction. Consistent format (no stray quotes or prefixes).
- **Weaknesses:** Tense clash on sentence #1 ("am going...bought") — it latches onto the first verb's tense and ignores context cues. Pronoun gender confusion on #12 — kept "her" for "brother". Inconsistent article fix on #1 (uses "However" which changes tone slightly).
- **Verdict:** Best option among the three, but not production-ready for the polish feature.

### Phi-4-mini 3.8B (11/12 grammar, 9/12 clean — Best Grammar, Minor Format Issues)

- **Strengths:** Best grammar of any tested model — 11/12 error categories. Fixed word order ("always I eat" → "I always eat") which Qwen missed. Used present perfect on #6 ("have been waiting") which is more natural. Strong subject-verb agreement, comparatives, conditionals, and gerund/infinitive handling.
- **Weaknesses:** Two format contamination issues on short sentences — added `(Past Tense)` after #2 and `(The intended tense is present.)` after #12. These are unwanted annotations despite the "Output only the corrected text" instruction. Still fails on pronoun gender (#12, kept "her" for "brother"). Significantly slower: 2x Qwen's latency (1,051ms vs 533ms avg), 2.3x slower on long-form (25.28s vs 11.03s). 
- **Note:** The format contamination may be fixable with a stricter system prompt or a different chat template configuration.
- **Verdict:** Best grammar quality but format issues and speed need attention. Worth pursuing further.

### Llama 3.2 1B (8/12 — Disqualified)

- **Strengths:** When it works, corrections are good (fixed tense on #1, pronoun gender on #12). Faster load time than Qwen.
- **Weaknesses:** 3 catastrophic failures — sentences #4, #6, #7 triggered full hallucination (chatbot replies, format echo, content injection). Inconsistent output format (sometimes quotes, sometimes "Corrected text:" prefix, sometimes raw). This is a dealbreaker for a tool that needs to work every time — users can't have their input randomly replaced with chatbot nonsense.
- **Verdict:** Cannot ship this. The hallucination risk is too high.

### T5 GEC (4/12 — Fast but Incomplete)

- **Strengths:** Fastest inference by 2-3x (212ms avg vs 538ms). Smallest model (220M params). Zero hallucinations — it's specialized and stays on task. Fixed the tense on sentence #1 (the one neither LLM could handle). Handles surface-level corrections well (articles, subject-verb agreement, negatives, uncountable nouns).
- **Weaknesses:** Completely misses structural/syntactic errors — left "more better", "would be", "enjoy to play", and "Always I eat" uncorrected. Lowercase outputs, missing commas. Training data (C4-200M, JFLEG) apparently didn't cover these patterns.
- **Verdict:** Not suitable as the sole grammar engine. Could work as a fast first-pass filter if combined with something else for structural fixes.

---

## Issues Found

1. **1-1.5B LLMs hit a quality ceiling on grammar.** Prompt engineering didn't help — few-shot examples actually made things worse (+80% TTFT, hallucinations). The models are too small to reliably understand grammatical rules from instructions alone.
2. **T5 GEC can't handle structural errors.** It's fine for surface-level fixes (articles, plurals) but fails on comparatives, conditionals, gerund/infinitive, and word order — exactly the kind of structural errors non-native speakers need fixed.
3. **Catastrophic hallucination in Llama 1B.** 3 out of 12 sentences triggered completely wrong outputs. This isn't fixable with better prompting — it's a model capacity limitation.
4. **No single small model meets the quality bar.** None of the three approaches scored 12/12. The best (Qwen) still slips on tense consistency and pronoun gender.

---

## Lessons Learned

- **Small LLMs (1-1.5B) are great for structured tasks but unreliable for nuanced grammar correction.** The reasoning capacity isn't there yet.
- **Specialized GEC models are fast and hallucination-free but have blind spots.** They only know what they were trained on — structural errors may be underrepresented in training data.
- **Prompt engineering has diminishing returns at this scale.** The refined prompt improved things marginally over the original, but few-shot made things worse. You can't prompt your way out of a model capacity problem.
- **Benchmarking with only 4 sentences was dangerously misleading.** The original 4-sentence test showed T5 GEC as the clear winner. Expanding to 12 sentences revealed it can't handle half the error types. **Always test broadly before making a decision.**
- **Testing latency in isolation is not enough.** Milestone 1 proved Qwen was fast enough (41 tok/s), but the quality evaluation showed it isn't good enough. Speed gates and quality gates are both necessary.

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


| Model               | Time       | TTFT        | Tokens | Output Quality                                           |
| ------------------- | ---------- | ----------- | ------ | -------------------------------------------------------- |
| Qwen 2.5 1.5B       | **11.03s** | 826ms       | 340    | ✅ Nearly perfect — fixed almost all errors               |
| Llama 3.2 1B        | 8.73s      | 671ms       | 358    | ⚠️ Added preamble, changed tone, format contamination    |
| **Phi-4-mini 3.8B** | **25.28s** | **2,093ms** | 324    | ✅✅ Best quality — fixed everything including word order  |
| T5 GEC              | 2.26s      | N/A         | 101    | ❌ **Truncated** — cut off mid-sentence after ~100 tokens |


### Key Observations

**Qwen 2.5 1.5B** handled the long-form input surprisingly well:

- Corrected tense throughout ("was working" → "were working", "finish" → "finished")
- Fixed subject-verb agreement ("team they is" → "team is")
- Corrected uncountable nouns ("informations" → "information", "datas" → "data")
- Fixed comparatives ("more better" → "better", "more easier" → "more easily")
- Fixed double negatives ("don't want to leave nothing" → "don't want to leave anything")
- Missed only: "always I forget" (word order) — kept it as "always I forget" instead of "I always forget"
- Preserved meaning and tone throughout. Proper paragraph structure. This is production-viable quality.

**T5 GEC** has a **hard 512-token input limit** that makes it unusable for long dictation:

**Phi-4-mini 3.8B** had the best long-form quality overall:

- Fixed every error including the word order issue Qwen missed ("always I forget" → "I always forget")
- Used correct pronouns throughout ("he" for the client, "my colleague" without gender confusion)
- Good structure with proper paragraph breaks
- Only flaw: slow at 25.28s (2.3x Qwen) and 2,093ms TTFT
- No format contamination on the long-form (unlike short sentences) — context helps the model stay on task
- The long-form output was better than the short-sentence output, which is a key pattern (see Key Insight below)

**Llama 3.2 1B** continued its pattern of unreliability:

- Output was truncated mid-sentence after only ~100 tokens
- Lost paragraph structure (single block of text)
- Lowercased everything
- Couldn't fix the structural errors it already struggles with (word order, conditional, etc.)
- **T5 GEC is only suitable for sentence-level corrections, not paragraph-level dictation.**

**Llama 3.2 1B** continued its pattern of unreliability:

- Added a lengthy preamble: "Here's the rewritten text with correct grammar, spelling, and punctuation..."
- Changed tone from informal to overly formal
- Slowest time (11.35s)

### Updated Verdict

The long-form test changes the recommendations significantly:

- ❌ **T5 GEC cannot be the sole grammar engine** — it truncates on long input and misses structural errors.
- ✅ **Qwen 2.5 1.5B can handle long-form dictation** with good quality (11.03s / ~309 words). The only missed error was word order on one sentence.
- ❌ **Llama 3.2 1B** remains disqualified due to reliability issues.
- ✅ **Phi-4-mini 3.8B** has the best grammar (11/12) and fixed Qwen's blind spot (word order), but is 2x slower and has minor format contamination on short sentences.

### Key Insight: Context Dependence

Every model performed **better on the long dictation than on isolated short sentences**. Longer text provides more context — the model can infer tense from surrounding verbs, resolve pronouns from earlier references, and understand the document's overall tone. The 12 short-sentence benchmark is a **harder test** than real usage because it strips all context.

This means:

- **Real-world dictation will naturally produce better corrections than the benchmarks suggest** because users dictate paragraphs, not isolated sentences
- **The short-sentence benchmark is useful for stress-testing but doesn't reflect real-world performance**
- **Prioritize models based on long-form quality** — that's the actual user experience

### Models Removed From Active Testing

Based on cumulative evidence, two models are removed from further consideration:

**Llama 3.2 1B** — 3/12 catastrophic hallucinations on short sentences, format contamination on long-form. Unreliable output is a dealbreaker for a tool that must work every time.

**Xenova/t5-base-grammar-correction (T5 GEC)** — 4/12 on short sentences (misses all structural errors: comparatives, conditionals, gerunds, word order). Hard 512-token limit causes truncation on any paragraph-length input. Only viable for single-sentence surface-level fixes.

### Decision

The remaining two candidates are Qwen 2.5 1.5B and Phi-4-mini 3.8B. Neither is perfect:

- **Qwen 1.5B** — Faster (11s long-form, 533ms avg), cleaner output, but 9/12 grammar score
- **Phi-4-mini 3.8B** — Better grammar (11/12, fixes word order), but slower (25s long-form, 1,051ms avg) and minor format issues

The next step is to refine Phi-4-mini's system prompt to eliminate the format contamination and see if it can be sped up. If the format issues are fixable, Phi-4-mini is the better engine. If not, Qwen 1.5B is the safer choice despite slightly lower grammar quality.