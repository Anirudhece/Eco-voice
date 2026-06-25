import { getLlama, LlamaChatSession, QwenChatWrapper } from "node-llama-cpp";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const systemPrompt = `Rewrite the user's input with correct grammar, spelling, and punctuation. Determine the intended tense from context and keep it consistent. Output only the corrected text.`;

const testInputs = [
    // 1. Tense consistency
    "i am go to store and buyed some apple but it was very expensiv",
    // 2. Subject-verb agreement
    "she do not likes coding but she need to did it for class",
    // 3. Past progressive
    "yesterday we was walking in park and it starts raining sudden so we got wet",
    // 4. Double negatives
    "i don't have nothing to do this weekend so i'm just staying home",
    // 5. Missing articles
    "i need to buy new phone because old one is broken",
    // 6. Prepositions
    "i am waiting you since morning where are you",
    // 7. Uncountable nouns
    "can you give me some informations about the course",
    // 8. Double comparative
    "this book is more better than that one i read last week",
    // 9. Mixed conditional
    "if i would be rich i will travel all around world",
    // 10. Gerund vs infinitive
    "i enjoy to play football but i avoid to run",
    // 11. Word order
    "always i eat breakfast before go to work",
    // 12. Pronoun gender
    "my brother she is doctor and her work is very hard"
];

// ── Long-form dictation simulation (~350 words, ~2 min speech) ──
// Simulates a real voice dictation: run-on sentences, topic jumps, broken grammar,
// filler words, phonetic spelling errors — the kind of raw transcription EcoVoice
// would receive from Whisper before correction.
const longFormInput = `hi team i am writing to give you update on the project we was working on last week. so basically i finish the report that my manager she ask me to do but i am not sure if it is complete because there is some informations that i still need to collect from the client. the client he keep saying that he will send me the datas but he never did it yet. i think we need to send him a reminder email again maybe but i dont want to be annoying you know.

also i am thinking that maybe we should change the timeline because the original deadline it was too tight and the team they is working very hard but still cannot finish everything on time. i spoke to john about this yesterday and he also agree that we need more better plan for the next phase. he suggest that we should break the project into smaller pieces so that we can manage it more easier.

anyway please let me know if you have any thoughs about this. i can setup a meeting for tomorrow if everyone is available. also sorry for the late reply on your previous email i was busy with some others task that my collegue she assign to me at the last minute. i hope we can resolve all this issues by the end of this week if possible because next week i will be on vacation and i dont want to leave nothing pending.

one more thing, always i forget to mention this but the new software that we are testing it is causing some problem on my computer. it crash multiple time already and i am losing my work. can you please look into this when you get a chance. thanks everyone for your support and understanding have a great day`;

// ── Shared result structure ──────────────────────────────────
function emptyResults(modelName) {
    return {
        modelName,
        sentences: [],
        longForm: null,
        loadTimeMs: 0,
        totalInferenceMs: 0,
        ttfts: [],
        tokensPerSec: 0,
        totalTokens: 0,
        error: null
    };
}

// ── Qwen / Llama runner (node-llama-cpp) ─────────────────────
async function runLLM(modelName, ggufFile, chatWrapper) {
    const results = emptyResults(modelName);
    const modelPath = path.join(__dirname, "models", ggufFile);

    if (!fs.existsSync(modelPath)) {
        results.error = `Model file not found: ${ggufFile}`;
        return results;
    }

    const t0 = Date.now();
    const llama = await getLlama();
    const model = await llama.loadModel({ modelPath });
    results.loadTimeMs = Date.now() - t0;

    // ── Short sentences (same as before) ──
    for (const input of testInputs) {
        const context = await model.createContext();
        const sessionOptions = {
            contextSequence: context.getSequence(),
            systemPrompt
        };
        if (chatWrapper) sessionOptions.chatWrapper = chatWrapper;
        const session = new LlamaChatSession(sessionOptions);

        let tokenCount = 0;
        let ttft = null;
        const start = Date.now();
        const outputTokens = [];

        await session.prompt(input, {
            onToken(tokens) {
                if (ttft === null) ttft = Date.now() - start;
                tokenCount += tokens.length;
                outputTokens.push(model.detokenize(tokens));
            }
        });

        const elapsed = Date.now() - start;
        results.sentences.push({
            input,
            output: outputTokens.join(""),
            latencyMs: elapsed,
            ttftMs: ttft ?? elapsed,
            tokens: tokenCount
        });
        results.totalTokens += tokenCount;
        results.ttfts.push(ttft ?? elapsed);
        await context.dispose();
    }

    // ── Long-form dictation ──
    const ctx = await model.createContext();
    const sessOptions = {
        contextSequence: ctx.getSequence(),
        systemPrompt
    };
    if (chatWrapper) sessOptions.chatWrapper = chatWrapper;
    const sess = new LlamaChatSession(sessOptions);

    let tokenCount = 0;
    let ttft = null;
    const start = Date.now();
    const outputTokens = [];

    await sess.prompt(longFormInput, {
        onToken(tokens) {
            if (ttft === null) ttft = Date.now() - start;
            tokenCount += tokens.length;
            outputTokens.push(model.detokenize(tokens));
        }
    });

    const elapsed = Date.now() - start;
    results.longForm = {
        input: longFormInput,
        output: outputTokens.join(""),
        latencyMs: elapsed,
        ttftMs: ttft ?? elapsed,
        tokens: tokenCount
    };
    results.totalTokens += tokenCount;
    results.ttfts.push(ttft ?? elapsed);
    await ctx.dispose();

    results.totalInferenceMs = results.sentences.reduce((s, x) => s + x.latencyMs, 0) + results.longForm.latencyMs;
    results.tokensPerSec = results.totalInferenceMs > 0
        ? results.totalTokens / (results.totalInferenceMs / 1000) : 0;

    return results;
}

// ── Summary table ────────────────────────────────────────────
function printComparison(runs) {
    const valid = runs.filter(r => !r.error);

    // Header
    console.log("\n" + "=".repeat(100));
    console.log("  BENCHMARK COMPARISON: Grammar Correction Models");
    console.log("=".repeat(100));

    // Per-sentence output comparison
    console.log("\n── Sentence-by-Sentence Output ──\n");
    for (let i = 0; i < testInputs.length; i++) {
        console.log(`  Input #${i + 1}: "${testInputs[i]}"`);
        console.log(`  ${"-".repeat(90)}`);
        for (const run of valid) {
            const s = run.sentences[i];
            console.log(`  [${run.modelName}]`);
            console.log(`    Output: ${s.output}`);
            console.log(`    Time:   ${s.latencyMs}ms` + (s.ttftMs && s.ttftMs !== s.latencyMs ? `  (TTFT: ${s.ttftMs}ms)` : ""));
        }
        console.log();
    }

    // Short sentences aggregate
    console.log("── Short Sentence Aggregate (12 sentences) ──\n");
    const header = `${"Model".padEnd(42)} ${"Load".padEnd(8)} ${"Total".padEnd(8)} ${"Avg/Sent".padEnd(10)} ${"Avg TTFT".padEnd(10)} ${"Tok/s".padEnd(8)} ${"Tokens".padEnd(8)}`;
    const sep = "─".repeat(header.length);
    console.log(header);
    console.log(sep);

    for (const run of valid) {
        const shortOnly = run.sentences;
        const totalMs = shortOnly.reduce((s, x) => s + x.latencyMs, 0);
        const avgLat = totalMs / shortOnly.length;
        const totalTokens = shortOnly.reduce((s, x) => s + x.tokens, 0);
        const avgTtft = run.ttfts.length > 0
            ? run.ttfts.reduce((s, x) => s + x, 0) / run.ttfts.length : 0;
        const tokPerSec = totalMs > 0 ? totalTokens / (totalMs / 1000) : 0;

        console.log(
            `${run.modelName.padEnd(42)} ` +
            `${(run.loadTimeMs / 1000).toFixed(1) + "s".padEnd(6)} ` +
            `${(totalMs / 1000).toFixed(2) + "s".padEnd(4)} ` +
            `${avgLat.toFixed(0) + "ms".padEnd(6)} ` +
            `${avgTtft.toFixed(0) + "ms".padEnd(5)} ` +
            `${tokPerSec.toFixed(1).padEnd(7)} ` +
            `${totalTokens}`
        );
    }

    // Long-form aggregate row
    console.log("\n── Long-Form Dictation (~350 words / ~2 min speech) ──\n");
    const lfHeader = `${"Model".padEnd(42)} ${"Time".padEnd(10)} ${"TTFT".padEnd(10)} ${"Tok/s".padEnd(10)} ${"Tokens".padEnd(8)}`;
    console.log(lfHeader);
    console.log("─".repeat(lfHeader.length));
    for (const run of valid) {
        if (!run.longForm) continue;
        const lf = run.longForm;
        const tokPerSec = lf.latencyMs > 0 ? lf.tokens / (lf.latencyMs / 1000) : 0;
        console.log(
            `${run.modelName.padEnd(42)} ` +
            `${(lf.latencyMs / 1000).toFixed(2) + "s".padEnd(6)} ` +
            `${(lf.ttftMs || 0) + "ms".padEnd(6)} ` +
            `${tokPerSec.toFixed(1).padEnd(8)} ` +
            `${lf.tokens}`
        );
    }

    // Errors
    const errored = runs.filter(r => r.error);
    if (errored.length > 0) {
        console.log("\n── Errors ──\n");
        for (const r of errored) {
            console.log(`  ${r.modelName}: ${r.error}`);
        }
    }

    // ── Long-form dictation results ──
    console.log("\n" + "=".repeat(100));
    console.log("  LONG-FORM DICTATION (~350 words / ~2 min speech)");
    console.log("=".repeat(100));
    console.log("  Input word count:", longFormInput.split(/\s+/).length, "\n");

    for (const run of valid) {
        if (!run.longForm) continue;
        console.log(`  [${run.modelName}]`);
        console.log(`  Time: ${run.longForm.latencyMs}ms` +
            (run.longForm.ttftMs && run.longForm.ttftMs !== run.longForm.latencyMs
                ? `  (TTFT: ${run.longForm.ttftMs}ms)` : ""));
        console.log(`  Tokens: ${run.longForm.tokens}`);
        console.log(`  ${"─".repeat(90)}`);
        console.log(`  ${run.longForm.output}`);
        console.log();
    }

    // ── Summary header again for context ──
    console.log("=".repeat(100));
    console.log("  SHORT SENTENCE AGGREGATE (12 sentences)");
    console.log("=".repeat(100));
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
    console.log("\nLoading and benchmarking models...\n");

    const results = [];

    // 1. Qwen (if GGUF exists)
    results.push(await runLLM(
        "Qwen 2.5 1.5B (Q4_K_M)",
        "qwen2.5-1.5b-instruct-q4_k_m.gguf"
    ));

    // 2. Qwen3 4B (if GGUF exists) — disable thinking mode for speed
    const qwen3Wrapper = new QwenChatWrapper({ thoughts: "discourage" });
    results.push(await runLLM(
        "Qwen3 4B (Q4_K_M)",
        "Qwen3-4B-Q4_K_M.gguf",
        qwen3Wrapper
    ));

    // 3. Gemma 3 4B (if GGUF exists)
    results.push(await runLLM(
        "Gemma 3 4B (Q4_K_M)",
        "gemma-3-4b-it-Q4_K_M.gguf"
    ));

    printComparison(results);
}

main().catch(console.error);
