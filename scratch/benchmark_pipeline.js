import whisperModule from "whisper-node";
import { getLlama, LlamaChatSession } from "node-llama-cpp";
import OpenAI from "openai";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const whisper = whisperModule.whisper;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root (not scratch/)
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// ── Config ──────────────────────────────────────────────
const AUDIO_FILE = "test.wav";
const WHISPER_MODEL = "base.en";
const LLM_FILE = "qwen2.5-1.5b-instruct-q4_k_m.gguf";
const SYSTEM_PROMPT = `Rewrite the user's input with correct grammar, spelling, and punctuation. Determine the intended tense from context and keep it consistent. Output only the corrected text.`;

// Cloud API key — read from env, never logged
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || null;

// ── Audio duration helper ───────────────────────────────
function getAudioDuration(filePath) {
    const output = execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`, { encoding: "utf-8" });
    return parseFloat(output.trim());
}

// ── Step 1: Whisper ASR ─────────────────────────────────
async function transcribeAudio(audioPath) {
    console.log(`[1/3] Transcribing audio with Whisper ${WHISPER_MODEL}...`);

    const start = Date.now();
    const segments = await whisper(audioPath, { modelName: WHISPER_MODEL });
    const elapsed = (Date.now() - start) / 1000;

    const rawText = Array.isArray(segments)
        ? segments.map(s => s.speech.trim()).join(" ")
        : String(segments);

    console.log(`      Done in ${elapsed.toFixed(2)}s`);
    console.log(`      Raw transcript: "${rawText}"\n`);

    return { rawText, asrTimeMs: elapsed * 1000 };
}

// ── Step 2a: Local Qwen LLM ─────────────────────────────
async function polishLocal(rawText) {
    console.log("[2a/3] Polishing with local Qwen 2.5 1.5B...");

    const modelPath = path.join(__dirname, "models", LLM_FILE);
    if (!fs.existsSync(modelPath)) {
        return { error: `Model not found: ${LLM_FILE}` };
    }

    const start = Date.now();
    const llama = await getLlama();
    const model = await llama.loadModel({ modelPath });
    const loadTime = Date.now() - start;

    const context = await model.createContext();
    const session = new LlamaChatSession({
        contextSequence: context.getSequence(),
        systemPrompt: SYSTEM_PROMPT
    });

    let tokenCount = 0;
    let ttft = null;
    const outputTokens = [];
    const genStart = Date.now();

    await session.prompt(rawText, {
        onToken(tokens) {
            if (ttft === null) ttft = Date.now() - genStart;
            tokenCount += tokens.length;
            outputTokens.push(model.detokenize(tokens));
        }
    });

    const genTime = Date.now() - genStart;
    const polished = outputTokens.join("");
    await context.dispose();

    const tokPerSec = genTime > 0 ? tokenCount / (genTime / 1000) : 0;

    console.log(`      Load: ${loadTime}ms, TTFT: ${ttft}ms, Tokens: ${tokenCount}, Tok/s: ${tokPerSec.toFixed(1)}`);
    console.log(`      Output: "${polished}"\n`);

    return {
        polished,
        loadTimeMs: loadTime,
        ttftMs: ttft ?? genTime,
        genTimeMs: genTime,
        tokens: tokenCount,
        tokPerSec
    };
}

// ── Step 2b: Gemini API (OpenAI-compatible) ──────────────────
async function polishCloud(rawText) {
    console.log("[2b/3] Polishing with Gemini API (gemini-2.5-flash-lite)...");

    const start = Date.now();

    try {
        const gemini = new OpenAI({
            apiKey: GEMINI_API_KEY,
            baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
        });
        const response = await gemini.chat.completions.create({
            // model: "gemini-2.5-flash",
            model: "gemini-2.5-flash-lite",
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: rawText }
            ],
            temperature: 0,
            max_tokens: 512
        });

        const elapsed = Date.now() - start;
        const polished = response.choices[0].message.content;
        const usage = response.usage;

        console.log(`      Time: ${elapsed}ms, Tokens: ${usage.total_tokens} (${usage.prompt_tokens} in / ${usage.completion_tokens} out)`);
        console.log(`      Output: "${polished}"\n`);

        return {
            polished,
            apiTimeMs: elapsed,
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens
        };
    } catch (error) {
        console.error(`      Gemini API error: ${error.message}\n`);
        return { error: error.message };
    }
}

// ── Main pipeline ────────────────────────────────────────
async function main() {
    const audioPath = path.join(__dirname, AUDIO_FILE);

    if (!fs.existsSync(audioPath)) {
        console.error(`\nError: Audio file not found: ${audioPath}`);
        console.error("Record one with: ffmpeg -f avfoundation -i \":0\" -t 12 -acodec pcm_s16le -ac 1 -ar 16000 scratch/test.wav");
        process.exit(1);
    }

    const audioDuration = getAudioDuration(audioPath);

    console.log("=".repeat(70));
    console.log("  EcoVoice Pipeline Benchmark");
    console.log("  Audio → Whisper → Grammar Engine (Local + Cloud)");
    console.log("=".repeat(70));
    console.log(`  Audio:  ${AUDIO_FILE} (${audioDuration.toFixed(2)}s)`);
    console.log(`  ASR:    whisper ${WHISPER_MODEL}`);
    console.log(`  Local:  Qwen 2.5 1.5B (node-llama-cpp)`);
    console.log(`  Cloud:  Gemini (gemini-2.5-flash-lite)`);
    console.log("=".repeat(70) + "\n");

    // Step 1: Transcribe
    const { rawText, asrTimeMs } = await transcribeAudio(audioPath);

    // Step 2a: Local polish
    const localResult = await polishLocal(rawText);

    // Step 2b: Cloud polish
    let cloudResult = { error: "No GEMINI_API_KEY set in .env file." };
    if (GEMINI_API_KEY) {
        cloudResult = await polishCloud(rawText);
    }

    // ── Results ───────────────────────────────────────
    console.log("=".repeat(70));
    console.log("  RESULTS");
    console.log("=".repeat(70));

    console.log("\n  ── Raw Transcript ──");
    console.log(`  ${rawText}`);

    console.log("\n  ── Local Qwen 2.5 1.5B ──");
    if (localResult.error) {
        console.log(`  ❌ ${localResult.error}`);
    } else {
        console.log(`  ${localResult.polished}`);
        console.log(`  TTFT: ${localResult.ttftMs}ms | Tok/s: ${localResult.tokPerSec?.toFixed(1)} | Tokens: ${localResult.tokens}`);
    }

    console.log("\n  ── Gemini (gemini-2.5-flash-lite) ──");
    if (cloudResult.error) {
        console.log(`  ⚠️  ${cloudResult.error}`);
    } else {
        console.log(`  ${cloudResult.polished}`);
        console.log(`  API time: ${cloudResult.apiTimeMs}ms | Tokens: ${cloudResult.totalTokens} (${cloudResult.promptTokens} in / ${cloudResult.completionTokens} out)`);
    }

    // ── E2E timing ────────────────────────────────────
    const localE2e = asrTimeMs + (localResult.genTimeMs || 0);
    const localPass = localE2e < 2000;

    console.log("\n  ── End-to-End Timing ──");
    console.log(`  Local path: ASR ${(asrTimeMs/1000).toFixed(2)}s + LLM ${((localResult.genTimeMs || 0)/1000).toFixed(2)}s = ${(localE2e/1000).toFixed(2)}s`);
    console.log(`  Gate (E2E < 2s for 10s clip): ${localPass ? "✅ PASS" : "❌ FAIL (clip was " + audioDuration.toFixed(0) + "s — scale accordingly)"}`);
    console.log();

    if (!GEMINI_API_KEY) {
        console.log("  ⚠️  Add GEMINI_API_KEY to .env to test the Gemini path.");
    }

    console.log("=".repeat(70));
}

main().catch(console.error);
