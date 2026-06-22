import whisper from "whisper-node";
import path from "path";
import fs from "fs";
import {fileURLToPath} from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    const audioPath = path.join(__dirname, "test.wav");
    
    if (!fs.existsSync(audioPath)) {
        console.error(`\nError: Test audio file not found at: ${audioPath}`);
        console.error("Please place a 16-bit PCM 16000Hz mono WAV file named 'test.wav' in the scratch directory.");
        console.error("\nYou can record a quick audio clip on your Mac and convert it to the required format using this terminal command:");
        console.error("  afconvert -f WAVE -d LEI16@16000 -c 1 input.m4a scratch/test.wav");
        process.exit(1);
    }

    // Try to get audio duration if possible (optional, for RTF calculation)
    // We will ask the user for the audio duration in seconds to calculate the exact RTF.
    console.log(`\n========================================`);
    console.log(`Starting Speech-to-Text Benchmark`);
    console.log(`Audio File: ${audioPath}`);
    console.log(`========================================`);

    const start = Date.now();
    
    try {
        // Run transcription using the default "base.en" model
        const transcript = await whisper(audioPath, {
            modelName: "base.en"
        });
        
        const durationMs = Date.now() - start;
        const durationSec = durationMs / 1000;

        console.log(`\n================ Transcription Results ================`);
        if (Array.isArray(transcript)) {
            transcript.forEach((line) => {
                console.log(`[${line.start} -> ${line.end}]: ${line.speech.trim()}`);
            });
        } else {
            console.log(transcript);
        }
        console.log(`=======================================================`);
        
        console.log(`\nProcessing time: ${durationSec.toFixed(2)} seconds`);
        console.log(`To calculate the Real-Time Factor (RTF), divide this by your audio clip's length:`);
        console.log(`  RTF = ${durationSec.toFixed(2)}s / (Audio Length in seconds)`);
        console.log(`  (We want this RTF to be less than 0.30x)\n`);

    } catch (error) {
        console.error("Error during transcription:", error);
    }
}

main().catch(console.error);
