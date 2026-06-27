import whisperModule from "whisper-node";
const whisper = whisperModule.whisper;
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import {fileURLToPath} from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getAudioDuration(filePath) {
    const output = execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`, { encoding: "utf-8" });
    return parseFloat(output.trim());
}

async function main() {
    const audioPath = path.join(__dirname, "test.wav");
    
    if (!fs.existsSync(audioPath)) {
        console.error(`\nError: Test audio file not found at: ${audioPath}`);
        console.error("Please place a 16-bit PCM 16000Hz mono WAV file named 'test.wav' in the scratch directory.");
        console.error("\nYou can record a quick audio clip on your Mac and convert it to the required format using this terminal command:");
        console.error("  afconvert -f WAVE -d LEI16@16000 -c 1 input.m4a scratch/test.wav");
        process.exit(1);
    }

    const audioDuration = getAudioDuration(audioPath);

    console.log(`\n========================================`);
    console.log(`ASR Speed Benchmark`);
    console.log(`========================================`);
    console.log(`Audio File:  test.wav`);
    console.log(`Duration:    ${audioDuration.toFixed(2)} seconds`);
    console.log(`Model:       base.en`);

    const start = Date.now();
    
    try {
        const transcript = await whisper(audioPath, {
            modelName: "base.en"
        });
        
        const durationMs = Date.now() - start;
        const durationSec = durationMs / 1000;
        const rtf = durationSec / audioDuration;

        console.log(`\n================ Transcription ================`);
        if (Array.isArray(transcript)) {
            transcript.forEach((line) => {
                console.log(`[${line.start} -> ${line.end}]: ${line.speech.trim()}`);
            });
        } else {
            console.log(transcript);
        }
        console.log(`===============================================`);
        
        const passed = rtf < 0.3;
        console.log(`\n========================================`);
        console.log(`RESULTS`);
        console.log(`========================================`);
        console.log(`Processing Time:  ${durationSec.toFixed(2)}s`);
        console.log(`Real-Time Factor: ${rtf.toFixed(3)}x`);
        console.log(`Gate (RTF < 0.3x): ${passed ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`========================================\n`);

    } catch (error) {
        console.error("Error during transcription:", error);
    }
}

main().catch(console.error);
