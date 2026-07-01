# workflow
- Document research findings, dead-ends, and benchmark results in `Docs/Research/` using the format `Research_MX_Topic.md` (where MX is the related milestone number), then link back from the milestone file. Include: what was tested, results, issues found, observations, lessons learned, and the decision/reasoning for next steps. Confidence: 0.80
- Include issues found, observations, and lessons learned within each milestone document so the user can reference them later. Confidence: 0.75
- Follow the rules defined in .clinerules and .cursorrules files when they exist in the project. Confidence: 0.75
- Present a written plan before executing code changes — show the plan in full, then ask for execution permission. Do not ask to switch modes or request mode permissions without presenting the plan first. Confidence: 0.80

# architecture
- Use toggle mode (first keypress starts recording, second stops) for audio capture hotkey in EcoVoice, since Electron's `globalShortcut` doesn't support key-release events needed for true hold-to-talk. Confidence: 0.50

# architecture
- Support a hybrid mode in EcoVoice where users can either use a local GGUF model or provide their own OpenAI API key for grammar correction, with the selection configurable from the app settings page. Let the user choose their preferred path (local vs OpenAI) rather than preselecting one. Confidence: 0.75

# documentation
- Include the complete content of code blocks, prompts, and inputs in documentation — do not truncate with "..." or use "(excerpt)" markers. Confidence: 0.70

# workflow
- Download GGUF models from HuggingFace using `curl -L -o` with the resolve/main URL pattern instead of `huggingface-cli download`. Confidence: 0.70

# security
- Restrict OpenAI API key permissions to only what the app needs: Chat completions permission alone is sufficient for grammar correction — List models and Model capabilities permissions are unnecessary when the app hardcodes the model choice. Confidence: 0.70

# architecture
- Prefer Gemini API (via GEMINI_API_KEY env var) over Groq for cloud-based grammar correction in EcoVoice, since users are more familiar with Google than with a niche provider like Groq for API key setup. Confidence: 0.70
- Use `gemini-2.5-flash-lite` as the default Gemini model for cloud grammar correction in EcoVoice — it's lighter than `gemini-2.5-flash` while producing comparable results, even though it takes slightly longer. Confidence: 0.70
- Never read, view, or console.log the contents of `.env` files or environment variables containing secrets like API keys. Treat secret files as read-restricted — do not open, inspect, or output their contents. Confidence: 0.85

# communication
- When providing shell commands, include the working directory path so the user knows from where to run them. Confidence: 0.65

# workflow
- Keep only one active plan file in the project. Delete or archive old/superseded plan files (e.g., `EcoVoice_plan.md` after switching to `EcoVoice_plan2.md`) to avoid confusion with multiple plan documents. Confidence: 0.70
- Place milestone plan documents in `Docs/Milestones/` (e.g., `Docs/Milestones/Milestone_5_plan.md`), following the existing convention established by `Milestone_4_Electron_Shell.md`, not directly under `Docs/` or `temp/`. Confidence: 0.80

# packaging
- Bundle the whisper base.en model with the app download itself rather than requiring a separate post-install model download. The base model is mandatory for all users — there's no reason to make it a separate step. Confidence: 0.70

# code-style
- Use ES Modules (`"type": "module"` in `package.json`) instead of CommonJS (`require`/`module.exports`) for this project. Confidence: 0.72
- Include timestamps in console.log statements for debugging, to make log output easier to trace over time. Confidence: 0.75
- Remove debug console.log statements before committing code to follow production-level practices. Confidence: 0.70

