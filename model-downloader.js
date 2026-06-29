import https from "https";
import http from "http";
import fs from "fs";
import path from "path";
import { getModelsPath, ensureModelsDir } from "./config.js";

const MODELS = {
  whisper: {
    name: "Whisper base.en (ASR)",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
    filename: "ggml-base.en.bin",
    size: 149_000_000
  },
  qwen: {
    name: "Qwen 2.5 1.5B Instruct (Grammar)",
    url: "https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf",
    filename: "Qwen2.5-1.5B-Instruct-Q4_K_M.gguf",
    size: 1_280_000_000
  }
};

export function isModelDownloaded(modelKey) {
  const model = MODELS[modelKey];
  if (!model) return false;
  const filePath = path.join(getModelsPath(), model.filename);
  try {
    const stat = fs.statSync(filePath);
    return stat.size >= model.size * 0.95;
  } catch {
    return false;
  }
}

export function getPartialBytes(modelKey) {
  const model = MODELS[modelKey];
  if (!model) return 0;
  const filePath = path.join(getModelsPath(), model.filename);
  try {
    const stat = fs.statSync(filePath);
    return stat.size < model.size ? stat.size : 0;
  } catch {
    return 0;
  }
}

function requestWithRedirect(method, url, rangeStart) {
  return new Promise((resolve, reject) => {
    const doRequest = (target, redirectsLeft) => {
      const parsed = new URL(target);
      const lib = parsed.protocol === "https:" ? https : http;

      const opts = {
        method,
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: {}
      };

      if (rangeStart > 0) {
        opts.headers.Range = `bytes=${rangeStart}-`;
      }

      const req = lib.request(opts, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
          doRequest(res.headers.location, redirectsLeft - 1);
        } else if (res.statusCode === 206 || res.statusCode === 200) {
          const contentRange = res.headers["content-range"];
          let totalFromServer = parseInt(res.headers["content-length"] || "0", 10);
          if (contentRange) {
            const match = contentRange.match(/\/(\d+)/);
            if (match) totalFromServer = parseInt(match[1], 10);
          }
          resolve({ stream: res, serverSize: totalFromServer });
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });

      req.on("error", reject);
      req.end();
    };
    doRequest(url, 5);
  });
}

export async function downloadModel(modelKey, onProgress) {
  const model = MODELS[modelKey];
  if (!model) throw new Error(`Unknown model: ${modelKey}`);

  await ensureModelsDir();
  const filePath = path.join(getModelsPath(), model.filename);
  const partialBytes = getPartialBytes(modelKey);
  const totalSize = model.size;

  onProgress({
    model: modelKey,
    bytesDownloaded: partialBytes,
    totalBytes: totalSize,
    percent: Math.round(partialBytes / totalSize * 100),
    phase: "connecting"
  });

  const { stream } = await requestWithRedirect("GET", model.url, partialBytes);

  onProgress({
    model: modelKey,
    bytesDownloaded: partialBytes,
    totalBytes: totalSize,
    percent: Math.round(partialBytes / totalSize * 100),
    phase: "downloading"
  });

  return new Promise((resolve, reject) => {
    const flags = partialBytes > 0 ? "a" : "w";
    const writeStream = fs.createWriteStream(filePath, { flags });
    let downloaded = partialBytes;

    stream.on("data", (chunk) => {
      downloaded += chunk.length;
      const percent = Math.round(Math.min(downloaded / totalSize, 1) * 100);
      onProgress({
        model: modelKey,
        bytesDownloaded: downloaded,
        totalBytes: totalSize,
        percent,
        phase: "downloading"
      });
    });

    writeStream.on("finish", () => {
      if (downloaded < totalSize * 0.95) {
        reject(new Error(`Download incomplete: ${downloaded} / ${totalSize} bytes`));
      } else {
        onProgress({
          model: modelKey,
          bytesDownloaded: downloaded,
          totalBytes: totalSize,
          percent: 100,
          phase: "complete"
        });
        resolve(downloaded);
      }
    });

    writeStream.on("error", reject);
    stream.on("error", reject);
    stream.pipe(writeStream);
  });
}
