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
    size: 986_048_768
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

const activeDownloads = {};

function resolveCdnUrl(modelUrl) {
  return new Promise((resolve, reject) => {
    const doFollow = (target, redirectsLeft) => {
      const parsed = new URL(target);
      const lib = parsed.protocol === "https:" ? https : http;

      const req = lib.request({ method: "HEAD", hostname: parsed.hostname, path: parsed.pathname + parsed.search }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
          doFollow(new URL(res.headers.location, target).href, redirectsLeft - 1);
        } else {
          resolve(target);
        }
      });
      req.on("error", reject);
      req.end();
    };
    doFollow(modelUrl, 10);
  });
}

function streamFromUrl(cdnUrl, rangeStart, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(cdnUrl);
    const opts = {
      method: "GET",
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: {}
    };

    if (rangeStart > 0) {
      opts.headers.Range = `bytes=${rangeStart}-`;
    }

    const req = (parsed.protocol === "https:" ? https : http).request(opts, (res) => {
      if (res.statusCode === 206 || res.statusCode === 200) {
        const contentRange = res.headers["content-range"];
        let totalFromServer = parseInt(res.headers["content-length"] || "0", 10);
        if (contentRange) {
          const match = contentRange.match(/\/(\d+)/);
          if (match) totalFromServer = parseInt(match[1], 10);
        }
        resolve({ stream: res, serverSize: totalFromServer, req });
      } else if (res.statusCode === 416) {
        reject(new Error("HTTP 416 stale partial"));
      } else {
        reject(new Error(`HTTP ${res.statusCode}`));
      }
    });

    if (options.timeout) {
      req.setTimeout(options.timeout, () => req.destroy(new Error("Connection timeout")));
    }
    req.on("error", reject);
    req.end();
  });
}

export function abortDownload(modelKey) {
  const active = activeDownloads[modelKey];
  if (active) {
    active.abort();
    delete activeDownloads[modelKey];
    return true;
  }
  return false;
}

export async function deleteModel(modelKey) {
  const model = MODELS[modelKey];
  if (!model) throw new Error(`Unknown model: ${modelKey}`);
  const filePath = path.join(getModelsPath(), model.filename);
  try {
    await fs.promises.unlink(filePath);
    return true;
  } catch (err) {
    if (err.code === "ENOENT") {
      return true;
    }
    throw err;
  }
}

export async function downloadModel(modelKey, onProgress) {
  const model = MODELS[modelKey];
  if (!model) throw new Error(`Unknown model: ${modelKey}`);

  await ensureModelsDir();
  const filePath = path.join(getModelsPath(), model.filename);
  let totalSize = model.size;

  if (activeDownloads[modelKey]) {
    throw new Error(`Download already in progress for ${modelKey}`);
  }

  let isAborted = false;
  let currentReq = null;
  let currentStream = null;
  let currentWriteStream = null;
  let innerReject = null;

  const abort = () => {
    isAborted = true;
    try { if (innerReject) innerReject(new Error("Aborted")); } catch {}
    try { if (currentReq) currentReq.destroy(); } catch {}
    try { if (currentStream) currentStream.destroy(); } catch {}
    try { if (currentWriteStream) currentWriteStream.destroy(); } catch {}
  };

  activeDownloads[modelKey] = { abort };

  try {
    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Resolve a FRESH CDN URL for each attempt
      const cdnUrl = await resolveCdnUrl(model.url);
      const resumeFrom = getPartialBytes(modelKey);
      if (resumeFrom >= totalSize * 0.95) {
        onProgress({ model: modelKey, bytesDownloaded: totalSize, totalBytes: totalSize, percent: 100, phase: "complete" });
        delete activeDownloads[modelKey];
        return totalSize;
      }

      onProgress({
        model: modelKey,
        bytesDownloaded: resumeFrom,
        totalBytes: totalSize,
        percent: Math.round(resumeFrom / totalSize * 100),
        phase: attempt > 0 ? (resumeFrom > 0 ? "resuming" : "retrying") : "connecting"
      });

      try {
        const { stream, req, serverSize } = await streamFromUrl(cdnUrl, resumeFrom, { timeout: 60000 });

        // Use server-reported size — more accurate than hardcoded constant
        if (serverSize > 0) {
          totalSize = serverSize;
        }

        if (isAborted) throw new Error("Aborted");

        currentReq = req;
        currentStream = stream;

        onProgress({ model: modelKey, bytesDownloaded: resumeFrom, totalBytes: totalSize, percent: Math.round(resumeFrom / totalSize * 100), phase: "downloading" });

        await new Promise((resolve, reject) => {
          innerReject = reject;
          const flags = resumeFrom > 0 ? "a" : "w";
          currentWriteStream = fs.createWriteStream(filePath, { flags });
          let downloaded = resumeFrom;

          stream.on("data", (chunk) => {
            if (isAborted) { reject(new Error("Aborted")); return; }
            downloaded += chunk.length;
            const percent = Math.round(Math.min(downloaded / totalSize, 1) * 100);
            onProgress({ model: modelKey, bytesDownloaded: downloaded, totalBytes: totalSize, percent, phase: "downloading" });
          });

          currentWriteStream.on("finish", () => {
            if (isAborted) { reject(new Error("Aborted")); return; }
            if (downloaded < totalSize * 0.95) {
              reject(new Error(`Download incomplete: ${downloaded} / ${totalSize} bytes`));
            } else {
              onProgress({ model: modelKey, bytesDownloaded: downloaded, totalBytes: totalSize, percent: 100, phase: "complete" });
              resolve(downloaded);
            }
          });

          currentWriteStream.on("error", reject);
          stream.on("error", reject);
          stream.pipe(currentWriteStream);
        });

        // Success
        delete activeDownloads[modelKey];
        return;

      } catch (err) {
        if (isAborted || err.message === "Aborted") throw new Error("Aborted");

        if (err.message === "HTTP 416 stale partial") {
          console.warn(`[DOWNLOADER] 416 on attempt ${attempt} — deleting partial, retrying fresh`);
          try { fs.unlinkSync(filePath); } catch {}
          continue;
        }

        if (err.message.startsWith("Download incomplete")) {
          const remaining = totalSize - getPartialBytes(modelKey);
          console.warn(`[DOWNLOADER] Incomplete on attempt ${attempt} — ${Math.round(remaining / 1e6)}MB remaining`);
          continue;
        }

        if (attempt < maxAttempts - 1) {
          console.warn(`[DOWNLOADER] ${err.message} on attempt ${attempt} — retrying`);
          continue;
        }

        throw err;
      }
    }

    throw new Error(`Download failed after ${maxAttempts} attempts`);
  } catch (err) {
    delete activeDownloads[modelKey];
    throw err;
  }
}
