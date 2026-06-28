# EcoVoice — Project Plan & Milestones

**Platform target:** macOS (Apple Silicon) first, Windows/Linux later
**Stack:** Electron (Node.js native) · whisper-node · node-llama-cpp · Qwen2.5-1.5B-Instruct (Q4_K_M GGUF) · Gemini API (optional grammar backend)

## Decisions made before building (context for future-you)

A few things were deliberately settled before writing code, so they don't get re-litigated mid-build:

- **Free for everyone, from day one, no monetization plan.** The main gap found versus tools like Wispr Flow and Aqua Voice is pricing (they're subscription-based), not capability — so EcoVoice's edge is "as good as those, but free and fully local," not "good enough since it's free." This means the quality bar for transcription and grammar-polish should be judged against those paid tools directly, not graded on a curve.
- **Sole maintainer, indefinitely, with no income from this.** That's an accepted tradeoff, not an oversight — worth remembering when scoping features, since every feature added is also a future support burden with no revenue to offset the time.
- **Stack is Electron + native Node bindings (whisper-node, node-llama-cpp).** Originally planned as Tauri + native bindings, but a real architecture conflict surfaced: Tauri's backend runs Rust, not Node, so Node packages like `node-llama-cpp`/`whisper-node` cannot run inside it directly — they'd need a sidecar Node process with IPC wiring, or a switch to Rust-native crates (`whisper-rs`, `llama-cpp-2`). Given the project's primary goal is learning AI/local-inference internals — not systems engineering — the sidecar/IPC complexity and Rust crate work were both judged not worth the detour. Electron was chosen instead: it bundles Node natively, so the AI libraries work with zero extra plumbing, at the direct cost of binary size and idle RAM versus Tauri.
- **Hybrid grammar mode: local LLM + optional Gemini API.** After extensive benchmarking (12 ESL error categories, long-form dictation, real voice pipeline), the local Qwen 2.5 1.5B model handles most real-world dictation surprisingly well — but edge cases (pronoun gender, mixed conditionals) persist. Users can optionally provide their own Gemini API key for cloud grammar correction via the settings page. Gemini was chosen over OpenAI (requires pre-paid credits) and Groq (niche brand) because: (1) free tier with no credit card needed, (2) Google brand trust for non-AI-developer users, (3) OpenAI-compatible API with zero SDK changes. The selected model is `gemini-2.5-flash-lite` — lighter and cheaper than `gemini-2.5-flash` with comparable grammar quality. The user chooses their preferred path — no default is preselected.
- **Known consequence: the PRD's <40MB idle RAM target is likely not achievable with Electron.** Electron's baseline footprint alone often exceeds that before any app logic loads. This is an accepted, conscious tradeoff in service of the learning goal, not an oversight — revisit only if idle RAM becomes a real annoyance during Milestone 9 dogfooding, at which point targeted fixes (unloading models when idle, as the original PRD describes) can be explored, but it's not a Phase 1 priority.
- **Project priorities, in order:** (1) learning AI/local-inference concepts, (2) solving a genuine personal problem, (3) building a real, shippable, native-feeling app — explicitly not chasing monetization. This ordering should break ties when scope decisions come up later (e.g. prefer the path that teaches more about how local inference works, even if a shortcut exists).

## Sequencing principle

The two real technical risks in this PRD are LLM generation speed and ASR latency on your actual hardware — everything else (Electron shell, global hotkeys, text injection) is well-trodden engineering with predictable timelines. So the plan front-loads the two unknowns as standalone, throwaway scripts before any app shell exists. If either benchmark fails to hit target, you find out in days, not after weeks of UI work.

Each milestone has a single pass/fail gate. Don't move to the next milestone until the current one's gate is met — if a gate fails, that's a model/approach decision point, not a bug to push through.

---

## Milestone 0 — Environment Setup [COMPLETED]

**Goal:** Confirm your Mac can run the native toolchains without fighting build errors.

- [x] Install Node 20+ and Xcode Command Line Tools (needed for native module builds via node-gyp)
- [x] Confirm Metal is available (`system_profiler SPDisplaysDataType` shows Apple GPU)
- [x] Scratch directory, not inside the eventual Electron project — this is throwaway test code
  **Gate:** `npm install node-llama-cpp` and `npm install whisper-node` both complete without native build failures. (Completed: compiled successfully in 29 seconds)

---

## Milestone 1 — LLM Speed Benchmark (standalone script) [COMPLETED]

**Goal:** Prove a quantized 1–1.5B model hits ≥35 tokens/sec on your machine with Metal acceleration.

- [x] Download Qwen2.5-1.5B-Instruct Q4_K_M GGUF (and Llama-3.2-1B-Instruct Q4_K_M as a comparison point)
- [x] Write a standalone Node script using `node-llama-cpp` that loads the model with Metal/GPU layers enabled, sends a fixed grammar-correction prompt (~512 token context cap, matching the PRD spec), and logs tokens/sec and time-to-first-token
- [x] Test both models back to back on identical prompts
  **Gate:** At least one model sustains ≥35 tok/s generation. (Completed: Qwen 2.5 1.5B hit **41.03 tokens/sec** and **212ms TTFT** on Apple M1 GPU. We select Qwen 2.5 1.5B as our model!)

**Output:** Qwen 2.5 1.5B Instruct selected (41.03 tok/s, 212ms TTFT). GGUF file saved in `scratch/models/`.

---

## Milestone 2 — ASR Speed Benchmark (standalone script) [COMPLETED]

**Goal:** Prove whisper.cpp hits real-time factor <0.3x on this machine.

- [x] Set up `whisper-node` with the `base.en` model (142MB, downloaded to scratch/node_modules)
- [x] Record a 12.9-second test clip (clean speech, natural accent)
- [x] Measure processing time, compute RTF
  **Gate:** RTF < 0.3x. (Completed: **0.063x** on first run — 0.81s to transcribe 12.93s of audio on Apple M1 GPU. Model: ggml-base.en.bin, 142MB.)

**Output:** base.en model, RTF 0.063x (well under 0.3x gate). Accuracy is solid for clear speech. Transcription: "Yesterday I go to the market because my mother tells me buy some vegetable but I forget my wallet so I coming back home and then go again later." — accurate word-for-word.

---

## Milestone 3 — Pipeline Glue (still no UI) [COMPLETED]

**Goal:** Chain Milestone 1 + 2 into one script: audio file in → transcribed → polished text out, supporting both grammar backends.

- [x] Single Node script: load a test audio file, run through whisper.cpp, pipe raw transcript into both the local LLM and OpenAI API (via `openai` npm package)
- [x] Test both backends on the same transcripts to compare quality
- [x] Tune the system prompt — tested against real voice transcripts with grammar errors
  **Gate:** End-to-end (file → polished text) in under 2s for the local LLM path. (Completed: **1.82s E2E** — 0.79s ASR + 1.03s LLM. Whisper base.en + Qwen 2.5 1.5B. OpenAI integration code validates but account has no credits — quality comparison deferred.)

**Output:** Pipeline script at `scratch/benchmark_pipeline.js`. Qwen 1.5B produces better grammar quality than the 9/12 benchmark score suggested — on connected, contextual text it's near-flawless. Head-to-head with Gemini 2.5 Flash Lite on a real voice transcript, Qwen beat Gemini on both speed (1.1s vs 5.4s) and polish quality (better transition words, sentence flow). Cloud path adds latency but gives users a trusted upgrade option for edge cases. Model chosen: `gemini-2.5-flash-lite` via Google's OpenAI-compatible endpoint.

---

## Milestone 4 — Electron Shell + Global Hotkey [COMPLETED]

**Goal:** Get a minimal Electron app that listens for a global hotkey and shows a floating overlay — no audio/LLM logic yet.

- [x] Scaffold Electron project (`main.js`, `preload.js`, `overlay.html`, `package.json`)
- [x] Implement global shortcut registration (Electron's built-in `globalShortcut` module — `Alt+Space`)
- [x] Minimal floating overlay window (frameless, always-on-top, transparent, `type: "panel"`) with animated CSS waveform placeholder and "Listening" label
- [x] Confirm hotkey works across different focused apps (this is where macOS permissions — Accessibility, Microphone — first become a real concern; resolve entitlements now rather than late)
- Since Electron bundles Node natively, `node-llama-cpp` and `whisper-node` can be required directly in the main process — no sidecar process or IPC bridge needed, unlike the original Tauri plan. This is the main complexity this stack switch removes.
**Gate:** Hotkey reliably shows/hides overlay regardless of which app is focused. (Completed: `Alt+Space` registers successfully. Overlay toggles on/off. Requires macOS Accessibility permission — one-time manual grant. Code handles denied case with error logging.)

**Output:** `main.js` (71 lines — app lifecycle, global shortcut, overlay window), `preload.js` (6 lines — context bridge), `overlay.html` (82 lines — blurred glass-morphism overlay with animated waveform). Security: context isolation ON, node integration OFF. Window type: `"panel"` (floats above apps, below menubar). See [Milestone 4 doc](Milestones/Milestone_4_Electron_Shell.md) for full details, architecture decisions, and trade-offs.

---

## Milestone 5 — Wire Audio Capture into Electron [IN PROGRESS]

**Goal:** Toggle-to-record: first Alt+Space starts mic capture, second press transcribes via whisper.

- [x] Toggle recording mode (Electron `globalShortcut` only supports key-down, not key-release — toggle is the pragmatic path)
- [x] Mic capture via `getUserMedia`/`MediaRecorder` in renderer (handles macOS permission prompt automatically)
- [x] webm → WAV conversion via `ffmpeg` (async, non-blocking `execFile`)
- [x] Whisper base.en transcription in main process via IPC
- [x] 4 visual states: idle, recording (green waveform), processing (yellow pulse), error (red)
- [x] Close button (✕) and Escape key to dismiss overlay
- [x] Error handling: mic denied, transcription failure, orphaned windows after crash
- [ ] Verify end-to-end on user's hardware: record speech → transcription appears in console
**Gate:** Speaking into the toggled hotkey produces transcribed text printed to console/dev tools within target latency. (Code complete, live test pending — mic permission dialog and actual transcription quality need verification)

---

## Milestone 6 — System Text Injection

**Goal:** Polished/raw text actually lands in the active text field of whatever app has focus.

- Native keystroke emulation (this is usually the fiddliest part on macOS due to Accessibility permission requirements)
- Test injection into a few different target apps: a plain text editor, VS Code, a browser text field, Slack — they don't all handle synthetic keystrokes identically
**Gate:** Reliable injection into at least 3 different common app types without corrupting cursor position or triggering unwanted app shortcuts.

---

## Milestone 7 — Settings Page + Dual Mode + Model Asset Management

**Goal:** Implement the settings page (API key config, mode toggle), dual-mode logic, and first-run model download wizard.

- Settings page with:
  - Grammar engine toggle: Local LLM / OpenAI API
  - OpenAI API key input (store in macOS Keychain or encrypted config file)
  - Model selection per mode (local: Qwen 2.5 1.5B; OpenAI: model picker like gpt-4o-mini)
  - Visual indicator showing which mode is active
- Modifier-key-on-release logic for raw vs. polish mode
- First-boot setup wizard: download whisper-base (~~140MB) and Qwen 2.5 1.5B (~~1.2GB) to Application Support, with progress UI and resumable downloads (don't skip resumability — 1.2GB on a flaky connection without resume is a real first-impression risk)
**Gate:** Fresh install → wizard → both models downloaded and verified → settings page toggles between local and OpenAI modes → app fully functional with either backend, all without manual file placement.

---

## Milestone 8 — Performance Hardening

**Goal:** Get reasonable real-world performance, with the idle RAM target treated as aspirational rather than a hard gate (see stack decision above — Electron's baseline footprint makes the PRD's original <40MB idle target unrealistic).

- Implement model-offload-after-5-minutes-inactive logic anyway — it's still good practice and meaningfully reduces idle RAM even if it won't hit the original 40MB number
- Confirm ASR/LLM speed targets still hold when the app has been running a while (memory fragmentation, thermal throttling on sustained use)
- Battery/thermal impact check on a longer session (PRD doesn't specify this but it's a real desktop-app concern Apple Silicon users will notice)
**Gate:** App sustains ASR/LLM performance targets through a 30+ minute real session, and idle RAM is meaningfully reduced by the offload logic versus an always-loaded baseline (exact number not a hard gate).

---

## Milestone 9 — MVP Polish & Dogfooding

**Goal:** Use it yourself for real work for a few days before calling Phase 1 done.

- Daily use across your actual workflows (Slack messages, code comments, emails)
- Track failure modes: missed words, bad polish outputs, injection glitches, hotkey conflicts with other apps
- Fix the highest-frequency annoyances only — PRD explicitly scopes out settings sliders, history, multilingual, cloud failover for Phase 1; resist scope creep here
**Gate:** You'd genuinely keep using it day to day without actively avoiding the polish mode due to quality concerns.

---

## After Phase 1

Explicitly out of scope until a Phase 2 decision: transcription history, multilingual-to-English translation, custom themes, cloud failover for ASR (Whisper stays local). Revisit these only once Milestone 9's dogfooding surfaces real demand for them.

---

## Immediate Next Step

Milestone 4: Scaffold the Electron app — global hotkey, floating overlay window, and macOS permission handling.