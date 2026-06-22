# Milestone 0 — Environment Setup

**Status:** ✅ **COMPLETED** (Verified on 2026-06-21)
* **Node.js:** v24.14.1
* **GPU:** Apple M1 (Metal supported)
* **Xcode Command Line Tools:** Installed (`/Library/Developer/CommandLineTools`)
* **Libraries:** `node-llama-cpp` and `whisper-node` installed successfully in the `scratch/` folder.


## 1. What We Are Doing
We are setting up the development environment on your macOS computer. We will:
* Check if you have **Node.js** (version 20+) and **Xcode Command Line Tools** installed.
* Confirm that your Mac has **Metal** (Apple's graphics engine) enabled.
* Create a temporary folder called `scratch/` to test our AI code.
* Install `node-llama-cpp` and `whisper-node` to verify they compile successfully.

---

## 2. Why We Are Doing It
AI models (like Whisper and Llama) require massive computational power. To run them locally on your Mac at high speed, we must compile them specifically for your computer's hardware. 

If we don't set up the compilers correctly first, installing the AI libraries will fail. Testing this now avoids troubleshooting compiler errors later inside our main Electron code.

---

## 3. What We Want to Achieve (The Gate)
**Pass Criteria:** We can successfully run `npm install node-llama-cpp whisper-node` in our scratch folder with **zero build errors**.

---

## 4. Key Concepts & Technical Terms (For Interviews)

### Native C++ Bindings (Node Addons)
* **Definition:** JavaScript is not fast enough to run LLMs directly. Therefore, engines like `llama.cpp` and `whisper.cpp` are written in **C++** (which is extremely fast and runs directly on the computer hardware).
* **How it works:** A "native binding" is a bridge that connects JavaScript with C++. It compiles the C++ code into a binary file (with a `.node` extension) so Node.js can import it and run it like regular JavaScript.

### node-gyp
* **Definition:** `node-gyp` is the tool Node.js uses to compile native C++ addons. 
* **Requirement:** It requires your operating system's compiler tools. On macOS, this is provided by **Xcode Command Line Tools** (which includes `make`, `gcc`, and `clang`).

### Metal (GPU Acceleration)
* **Definition:** Metal is Apple's hardware-accelerated graphics API. It allows software to run calculations directly on the Apple Silicon GPU (Graphics Processing Unit) instead of the CPU.
* **Why it matters:** Running an LLM on the CPU is very slow (often under 5-10 tokens per second). Running it on the GPU via Metal increases speed by 4x to 10x, enabling smooth real-time generation.
