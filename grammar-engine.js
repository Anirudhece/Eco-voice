import { getLlama, LlamaChatSession } from "node-llama-cpp";
import OpenAI from "openai";
import path from "path";
import fs from "fs";
import { getModelsPath } from "./config.js";

const SYSTEM_PROMPT = `Rewrite the user's input with correct grammar, spelling, and punctuation. Determine the intended tense from context and keep it consistent. Output only the corrected text.`;

const QWEN_FILENAME = "Qwen2.5-1.5B-Instruct-Q4_K_M.gguf";

export async function createGrammarEngine(config) {
  if (config.grammarEngine === "gemini") {
    return createGeminiEngine(config.geminiApiKey);
  }
  return createLocalEngine();
}

async function createLocalEngine() {
  const modelPath = path.join(getModelsPath(), QWEN_FILENAME);

  if (!fs.existsSync(modelPath)) {
    return {
      polish: async (rawText) => {
        console.warn("[Grammar] Local model not downloaded — returning raw text");
        return rawText;
      }
    };
  }

  const llama = await getLlama();
  const model = await llama.loadModel({ modelPath });
  const context = await model.createContext();
  const session = new LlamaChatSession({
    contextSequence: context.getSequence(),
    systemPrompt: SYSTEM_PROMPT
  });

  return {
    polish: async (rawText) => {
      let polished = "";
      await session.prompt(rawText, {
        onToken(tokens) {
          polished += model.detokenize(tokens);
        }
      });
      return polished.trim() || rawText;
    }
  };
}

function createGeminiEngine(apiKey) {
  if (!apiKey) {
    return {
      polish: async (rawText) => {
        console.warn("[Grammar] No Gemini API key set — returning raw text");
        return rawText;
      }
    };
  }

  const client = new OpenAI({
    apiKey,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
  });

  return {
    polish: async (rawText) => {
      const response = await client.chat.completions.create({
        model: "gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: rawText }
        ],
        temperature: 0,
        max_tokens: 512
      });
      const content = response.choices[0]?.message?.content;
      return content?.trim() || rawText;
    }
  };
}
