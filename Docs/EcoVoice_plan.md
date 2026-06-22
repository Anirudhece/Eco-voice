# EcoVoice — Project Plan & Milestones

**Platform target:** macOS (Apple Silicon) first, Windows/Linux later
**Stack:** Tauri (Rust + TS) · whisper.cpp · node-llama-cpp · Qwen2.5-1.5B-Instruct or Llama-3.2-1B-Instruct (Q4_K_M GGUF)

## Decisions made before building (context for future-you)

A few things were deliberately settled before writing code, so they don't get re-litigated mid-build:

- **Free for everyone, from day one, no monetization plan.** The main gap found versus tools like Wispr Flow and Aqua Voice is pricing (they're subscription-based), not capability — so EcoVoice's edge is "as good as those, but free and fully local," not "good enough since it's free." This means the quality bar for transcription and grammar-polish should be judged against those paid tools directly, not graded on a curve.
- **Sole maintainer, indefinitely, with no income from this.** That's an accepted tradeoff, not an oversight — worth remembering when scoping features, since every feature added is also a future support burden with no revenue to offset the time.
- **Stack is Tauri + native bindings (whisper.cpp, node-llama-cpp), not a pure-JS/WASM path.** A JS-only alternative exists (transformers.js, running Whisper/small LLMs via WASM/WebGPU with zero native bindings or Rust), and was considered explicitly given a JS-only background and no prior Rust/C++ experience. Native bindings were chosen anyway because they give real performance headroom against the PRD's speed targets, and Tauri's Rust footprint for a project like this is thin glue code (plugin config, passing data to/from the JS frontend) rather than deep systems programming — learnable without becoming a Rust expert, and honestly describable in interviews as "Rust limited to native shell glue, app logic in TypeScript."
- **Project priorities, in order:** (1) learning AI/local-inference concepts, (2) solving a genuine personal problem, (3) building a real, shippable, native-feeling app — explicitly not chasing monetization. This ordering should break ties when scope decisions come up later (e.g. prefer the path that teaches more about how local inference works, even if a shortcut exists).

## Sequencing principle

The two real technical risks in this PRD are LLM generation speed and ASR latency on your actual hardware — everything else (Tauri shell, global hotkeys, text injection) is well-trodden engineering with predictable timelines. So the plan front-loads the two unknowns as standalone, throwaway scripts before any app shell exists. If either benchmark fails to hit target, you find out in days, not after weeks of UI work.

Each milestone has a single pass/fail gate. Don't move to the next milestone until the current one's gate is met — if a gate fails, that's a model/approach decision point, not a bug to push through.

---

## Milestone 0 — Environment Setup

**Goal:** Confirm your Mac can run the native toolchains without fighting build errors.

- Install Node 20+, Rust (via rustup), and Xcode Command Line Tools
- Confirm Metal is available (`system_profiler SPDisplaysDataType` shows Apple GPU)
- Scratch directory, not inside the eventual Tauri project — this is throwaway test code

**Gate:** `npm install node-llama-cpp` and `npm install whisper-node` both complete without native build failures.

---

## Milestone 1 — LLM Speed Benchmark (standalone script)

**Goal:** Prove a quantized 1–1.5B model hits ≥35 tokens/sec on your machine with Metal acceleration.

- Download Qwen2.5-1.5B-Instruct Q4_K_M GGUF (and Llama-3.2-1B-Instruct Q4_K_M as a comparison point)
- Write a standalone Node script using `node-llama-cpp` that loads the model with Metal/GPU layers enabled, sends a fixed grammar-correction prompt (~512 token context cap, matching the PRD spec), and logs tokens/sec and time-to-first-token
- Test both models back to back on identical prompts

**Gate:** At least one model sustains ≥35 tok/s generation. If both fail, the fallback options are a smaller/more aggressively quantized model (Q4_0) or relaxing the speed target — decide explicitly rather than building UI around an unverified assumption. Since the whole pitch is "as good as Wispr Flow/Aqua Voice, but free," it's worth running the same grammar-correction prompts through one of those tools (free trial) for a side-by-side quality comparison, not just a speed number in isolation.

**Output:** a short results note (model, tok/s, RAM used, first-token latency) — this becomes the model selection decision record.

---

## Milestone 2 — ASR Speed Benchmark (standalone script)

**Goal:** Prove whisper.cpp hits real-time factor <0.3x on this machine.

- Set up `whisper-node` (or call whisper.cpp directly via CLI as a first pass — simpler to debug) with the `base` model
- Record a few 10–15 second test clips yourself (varied: clean audio, slight background noise, your actual accent/speech patterns since that's the real use case)
- Measure processing time for each clip, compute RTF (processing_time / audio_duration)

**Gate:** RTF < 0.3x consistently across your test clips. Note: Apple Silicon with Core ML acceleration for whisper.cpp can beat this significantly — worth testing the Core ML path specifically since it's a known Apple Silicon advantage over generic CPU/Metal paths for ASR specifically.

**Output:** results note (model size, RTF, accuracy spot-check on your own accent).

---

## Milestone 3 — Pipeline Glue (still no UI)

**Goal:** Chain Milestone 1 + 2 into one script: audio file in → transcribed → polished text out.

- Single Node script: load a test audio file, run through whisper.cpp, pipe raw transcript into the LLM with the system prompt from the PRD, print both raw and polished output side by side
- This is where you'll tune the system prompt — test it against transcripts with filler words, broken grammar, run-on sentences (your actual speech patterns are the best test data)

**Gate:** End-to-end (file → polished text) completes in under 2 seconds for a 10-second clip, matching the PRD's sub-2-second target. Polished output is a genuine improvement, not just paraphrasing.

---

## Milestone 4 — Tauri Shell + Global Hotkey

**Goal:** Get a minimal Tauri app that listens for a global hotkey and shows a floating overlay — no audio/LLM logic yet.

- Scaffold Tauri project
- Implement global shortcut registration (`Option+Space` or similar)
- Minimal floating overlay window with a waveform placeholder (static is fine for now)
- Confirm hotkey works across different focused apps (this is where macOS permissions — Accessibility, Microphone — first become a real concern; resolve entitlements now rather than late)

**Gate:** Hotkey reliably shows/hides overlay regardless of which app is focused.

---

## Milestone 5 — Wire Audio Capture into Tauri

**Goal:** Hold-to-talk actually captures mic audio inside the Tauri shell.

- Mic permission flow (macOS will prompt on first use — handle the denied-permission case explicitly)
- Audio buffer capture on hotkey-hold, flush on release
- Feed into the Milestone 3 pipeline (now living inside the app, not a standalone script)

**Gate:** Speaking into the held hotkey produces transcribed text printed to console/dev tools within target latency.

---

## Milestone 6 — System Text Injection

**Goal:** Polished/raw text actually lands in the active text field of whatever app has focus.

- Native keystroke emulation (this is usually the fiddliest part on macOS due to Accessibility permission requirements)
- Test injection into a few different target apps: a plain text editor, VS Code, a browser text field, Slack — they don't all handle synthetic keystrokes identically

**Gate:** Reliable injection into at least 3 different common app types without corrupting cursor position or triggering unwanted app shortcuts.

---

## Milestone 7 — Dual Mode + Model Asset Management

**Goal:** Implement the Mode A/Mode B toggle and the first-run model download wizard.

- Modifier-key-on-release logic for raw vs. polish mode
- First-boot setup wizard: download whisper-base (~140MB) and chosen LLM (~1.2GB) to Application Support, with progress UI and resumable downloads (don't skip resumability — 1.2GB on a flaky connection without resume is a real first-impression risk)

**Gate:** Fresh install → wizard → both models downloaded and verified → app fully functional, all without manual file placement.

---

## Milestone 8 — Performance Hardening

**Goal:** Hit the PRD's non-functional targets under real usage, not just benchmark conditions.

- Idle RAM <40MB: implement the model-offload-after-5-minutes-inactive logic
- Confirm ASR/LLM speed targets still hold when the app has been running a while (memory fragmentation, thermal throttling on sustained use)
- Battery/thermal impact check on a longer session (PRD doesn't specify this but it's a real desktop-app concern Apple Silicon users will notice)

**Gate:** App meets idle RAM target and sustains performance targets through a 30+ minute real session.

---

## Milestone 9 — MVP Polish & Dogfooding

**Goal:** Use it yourself for real work for a few days before calling Phase 1 done.

- Daily use across your actual workflows (Slack messages, code comments, emails)
- Track failure modes: missed words, bad polish outputs, injection glitches, hotkey conflicts with other apps
- Fix the highest-frequency annoyances only — PRD explicitly scopes out settings sliders, history, multilingual, cloud failover for Phase 1; resist scope creep here

**Gate:** You'd genuinely keep using it day to day without actively avoiding the polish mode due to quality concerns.

---

## After Phase 1

Per the PRD, explicitly out of scope until a Phase 2 decision: transcription history, cloud failover, multilingual-to-English translation, custom themes/settings UI. Revisit these only once Milestone 9's dogfooding surfaces real demand for them.

---

## Immediate Next Step

Milestone 1: standalone `node-llama-cpp` speed test. This is the single highest-leverage thing to validate first — if a 1.5B model can't hit your generation speed target, every downstream milestone's assumptions change.
