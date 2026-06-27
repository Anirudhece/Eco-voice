# workflow
- Document research findings, dead-ends, and benchmark results in `Docs/Research/` using the format `Research_MX_Topic.md` (where MX is the related milestone number), then link back from the milestone file. Include: what was tested, results, issues found, observations, lessons learned, and the decision/reasoning for next steps. Confidence: 0.80
- Include issues found, observations, and lessons learned within each milestone document so the user can reference them later. Confidence: 0.75
- Follow the rules defined in .clinerules and .cursorrules files when they exist in the project. Confidence: 0.75

# architecture
- Support a hybrid mode in EcoVoice where users can either use a local GGUF model or provide their own OpenAI API key for grammar correction, with the selection configurable from the app settings page. Let the user choose their preferred path (local vs OpenAI) rather than preselecting one. Confidence: 0.75

# documentation
- Include the complete content of code blocks, prompts, and inputs in documentation — do not truncate with "..." or use "(excerpt)" markers. Confidence: 0.70

# workflow
- Download GGUF models from HuggingFace using `curl -L -o` with the resolve/main URL pattern instead of `huggingface-cli download`. Confidence: 0.70

# communication
- When providing shell commands, include the working directory path so the user knows from where to run them. Confidence: 0.65

# workflow
- Keep only one active plan file in the project. Delete or archive old/superseded plan files (e.g., `EcoVoice_plan.md` after switching to `EcoVoice_plan2.md`) to avoid confusion with multiple plan documents. Confidence: 0.70

