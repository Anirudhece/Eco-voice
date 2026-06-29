import path from "path";
import fs from "fs/promises";
import os from "os";

const APP_DIR = path.join(os.homedir(), "Library", "Application Support", "EcoVoice");
const CONFIG_PATH = path.join(APP_DIR, "config.json");
const MODELS_DIR = path.join(APP_DIR, "models");

const DEFAULT_CONFIG = {
  grammarEngine: "local",
  geminiApiKey: "",
  setupComplete: false
};

export async function ensureAppDir() {
  await fs.mkdir(APP_DIR, { recursive: true });
}

export async function ensureModelsDir() {
  await fs.mkdir(MODELS_DIR, { recursive: true });
}

export function getModelsPath() {
  return MODELS_DIR;
}

export function getConfigPath() {
  return CONFIG_PATH;
}

export async function loadConfig() {
  await ensureAppDir();
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(config) {
  await ensureAppDir();
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}
