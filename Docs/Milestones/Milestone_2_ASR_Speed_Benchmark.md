# Milestone 2 — ASR Speed Benchmark

## 1. What We Are Doing
We are going to benchmark local Speech-To-Text (ASR) on your Mac. We will:
* Download the **Whisper Base** model.
* Write a standalone Node.js script using `whisper-node` to load the model.
* Test the model on a short audio clip (10–15 seconds).
* Measure and calculate:
  1. **Transcription Accuracy:** Does the model correctly transcribe what was spoken, including handles accents?
  2. **Real-Time Factor (RTF):** How fast the model transcribes the audio compared to the length of the audio clip itself.

---

## 2. Why We Are Doing It
Dictation must be fast and accurate. If the app takes 10 seconds to transcribe 10 seconds of speech, it will feel too slow to use for real-time typing. 

By measuring the **Real-Time Factor (RTF)** on your Apple M1 chip, we will prove that local Whisper runs fast enough to meet our sub-2-second target.

---

## 3. What We Want to Achieve (The Gate)
**Pass Criteria:** The transcription script completes with a **Real-Time Factor (RTF) of < 0.3x** (which means a 10-second audio file is transcribed in under 3 seconds) and accurately transcribes the spoken words.

---

## 4. Key Concepts & Technical Terms (For Interviews)

### ASR (Automatic Speech Recognition)
* **Definition:** The technical term for speech-to-text. It is the process of converting an audio signal of spoken words into written text.

### Whisper
* **Definition:** A state-of-the-art open-source speech recognition model created by OpenAI. It is trained on 680,000 hours of multilingual data, making it extremely good at handling accents, background noise, and technical jargon.

### whisper.cpp
* **Definition:** A high-performance C++ port of OpenAI's Whisper model. It has zero external dependencies and is optimized for Apple Silicon (using Metal and Core ML), allowing it to run extremely fast on Macs.

### Real-Time Factor (RTF)
* **Definition:** The standard metric used to measure ASR speed.
* **Formula:** `RTF = Processing Time / Audio Duration`
* **Example:** If it takes 2 seconds to transcribe a 10-second audio file, the RTF is `2 / 10 = 0.2x`. Any RTF below `1.0x` is faster than real-time. We target `< 0.3x` for instant responsiveness.
