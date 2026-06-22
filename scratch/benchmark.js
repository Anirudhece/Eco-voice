import {getLlama, LlamaChatSession} from "node-llama-cpp";
import path from "path";
import fs from "fs";
import {fileURLToPath} from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const systemPrompt = `Rewrite the user's input with correct grammar, spelling, and punctuation. Determine the intended tense from context and keep it consistent. Output only the corrected text.`;


// Multiple test sentences to get a better benchmark average
const testInputs = [
    "i am go to store and buyed some apple but it was very expensiv",
    "she do not likes coding but she need to did it for class",
    "yesterday we was walking in park and it starts raining sudden so we got wet",
    "can you please double check my email and tell if it have some mistake"
];

async function runBenchmark(modelName, modelFileName) {
    const modelPath = path.join(__dirname, "models", modelFileName);
    console.log(`\n========================================`);
    console.log(`Loading model: ${modelName}`);
    console.log(`From: ${modelPath}`);
    console.log(`========================================`);

    const startLoad = Date.now();
    const llama = await getLlama();
    const model = await llama.loadModel({
        modelPath: modelPath
    });
    const loadTime = Date.now() - startLoad;
    console.log(`Model loaded in ${(loadTime / 1000).toFixed(2)}s`);

    let totalTokens = 0;
    let totalTime = 0;
    const ttftList = [];

    console.log(`\nSystem Prompt: ${systemPrompt}`);
    console.log(`\nPolishing test sentences...`);

    for (let i = 0; i < testInputs.length; i++) {
        const testInput = testInputs[i];
        console.log(`\n[${i + 1}/${testInputs.length}] Input:  "${testInput}"`);

        const context = await model.createContext();
        const session = new LlamaChatSession({
            contextSequence: context.getSequence(),
            systemPrompt: systemPrompt
        });

        let tokenCount = 0;
        let firstTokenTime = null;
        const startGenerate = Date.now();

        process.stdout.write("      Output: ");
        const result = await session.prompt(testInput, {
            onToken(tokens) {
                if (firstTokenTime === null) {
                    firstTokenTime = Date.now();
                }
                tokenCount += tokens.length;
                process.stdout.write(model.detokenize(tokens));
            }
        });

        const endGenerate = Date.now();
        const duration = endGenerate - startGenerate;
        const ttft = firstTokenTime ? (firstTokenTime - startGenerate) : duration;

        totalTokens += tokenCount;
        totalTime += duration;
        ttftList.push(ttft);

        // Clean up context for this run to keep memory clean
        await context.dispose();
        console.log(); // Print a newline after output
    }

    const avgTtft = ttftList.reduce((sum, val) => sum + val, 0) / ttftList.length;
    const speed = totalTime > 0 ? (totalTokens / (totalTime / 1000)) : 0;

    console.log(`\n--- Benchmark Results for ${modelName} ---`);
    console.log(`Average Time to First Token (TTFT): ${avgTtft.toFixed(0)}ms`);
    console.log(`Total Tokens Generated: ${totalTokens}`);
    console.log(`Overall Generation Speed: ${speed.toFixed(2)} tokens/sec`);
    console.log(`Total Processing Time: ${(totalTime / 1000).toFixed(2)}s`);
    console.log(`----------------------------------------\n`);
}

async function main() {
    const qwenFile = "qwen2.5-1.5b-instruct-q4_k_m.gguf";
    const llamaFile = "Llama-3.2-1B-Instruct-Q4_K_M.gguf";

    const qwenExists = fs.existsSync(path.join(__dirname, "models", qwenFile));
    const llamaExists = fs.existsSync(path.join(__dirname, "models", llamaFile));

    if (!qwenExists && !llamaExists) {
        console.error("Error: No model files found in scratch/models/!");
        console.error(`Please download them first. Expected files:`);
        console.error(`  - scratch/models/${qwenFile}`);
        console.error(`  - scratch/models/${llamaFile}`);
        process.exit(1);
    }

    if (qwenExists) {
        try {
            await runBenchmark("Qwen 2.5 1.5B Instruct (Q4_K_M)", qwenFile);
        } catch (err) {
            console.error("Error running Qwen benchmark:", err);
        }
    }

    if (llamaExists) {
        try {
            await runBenchmark("Llama 3.2 1B Instruct (Q4_K_M)", llamaFile);
        } catch (err) {
            console.error("Error running Llama benchmark:", err);
        }
    }
}

main().catch(console.error);
