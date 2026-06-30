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

const activeDownloads = {};

function requestWithRedirect(method, url, rangeStart, options = {}) {
  return new Promise((resolve, reject) => {
    let req;
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

      req = lib.request(opts, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
          doRequest(res.headers.location, redirectsLeft - 1);
        } else if (res.statusCode === 206 || res.statusCode === 200) {
          const contentRange = res.headers["content-range"];
          let totalFromServer = parseInt(res.headers["content-length"] || "0", 10);
          if (contentRange) {
            const match = contentRange.match(/\/(\d+)/);
            if (match) totalFromServer = parseInt(match[1], 10);
          }
          resolve({ stream: res, serverSize: totalFromServer, req });
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });

      if (options.timeout) {
        req.setTimeout(options.timeout, () => {
          req.destroy(new Error("Connection timeout"));
        });
      }

      req.on("error", reject);
      req.end();

      if (options.onReqCreated) {
        options.onReqCreated(req);
      }
    };
    doRequest(url, 5);
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
  const totalSize = model.size;

  if (activeDownloads[modelKey]) {
    throw new Error(`Download already in progress for ${modelKey}`);
  }

  let isAborted = false;
  let currentReq = null;
  let currentStream = null;
  let currentWriteStream = null;
  let cancelTimerResolve = null;
  let innerReject = null;
  const cancelTimer = new Promise((_, reject) => {
    cancelTimerResolve = reject;
  });
  cancelTimer.catch(() => {});

  const abort = () => {
    console.log(`[DOWNLOADER] abort() called for ${modelKey}`);
    isAborted = true;
    if (cancelTimerResolve) {
      console.log(`[DOWNLOADER] Rejecting cancelTimer`);
      cancelTimerResolve(new Error("Aborted"));
    }
    if (innerReject) {
      console.log(`[DOWNLOADER] Rejecting innerReject`);
      try { innerReject(new Error("Aborted")); } catch (e) { console.error(e); }
    }
    if (currentReq) {
      try { currentReq.destroy(); } catch {}
    }
    if (currentStream) {
      try { currentStream.destroy(); } catch {}
    }
    if (currentWriteStream) {
      try { currentWriteStream.destroy(); } catch {}
    }
  };

  activeDownloads[modelKey] = { abort };

  const maxRetries = 3;
  let attempt = 0;

  try {
    while (attempt < maxRetries) {
      if (isAborted) {
        throw new Error("Aborted");
      }

      const partialBytes = getPartialBytes(modelKey);
      if (partialBytes >= totalSize * 0.95) {
        onProgress({
          model: modelKey,
          bytesDownloaded: totalSize,
          totalBytes: totalSize,
          percent: 100,
          phase: "complete"
        });
        delete activeDownloads[modelKey];
        return totalSize;
      }

      onProgress({
        model: modelKey,
        bytesDownloaded: partialBytes,
        totalBytes: totalSize,
        percent: Math.round(partialBytes / totalSize * 100),
        phase: attempt > 0 ? "retrying" : "connecting"
      });

      try {
        const { stream, req } = await requestWithRedirect("GET", model.url, partialBytes, {
          timeout: 30000,
          onReqCreated: (r) => {
            currentReq = r;
          }
        });

        currentStream = stream;

        if (isAborted) {
          throw new Error("Aborted");
        }

        onProgress({
          model: modelKey,
          bytesDownloaded: partialBytes,
          totalBytes: totalSize,
          percent: Math.round(partialBytes / totalSize * 100),
          phase: "downloading"
        });

        await new Promise((resolve, reject) => {
          innerReject = reject;
          const flags = partialBytes > 0 ? "a" : "w";
          currentWriteStream = fs.createWriteStream(filePath, { flags });
          let downloaded = partialBytes;

          let watchdog;
          const resetWatchdog = () => {
            if (watchdog) clearTimeout(watchdog);
            watchdog = setTimeout(() => {
              reject(new Error("Stream stalled"));
            }, 30000);
          };

          resetWatchdog();

          stream.on("data", (chunk) => {
            if (isAborted) {
              reject(new Error("Aborted"));
              return;
            }
            resetWatchdog();
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

          currentWriteStream.on("finish", () => {
            if (watchdog) clearTimeout(watchdog);
            if (isAborted) {
              reject(new Error("Aborted"));
            } else if (downloaded < totalSize * 0.95) {
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

          currentWriteStream.on("error", (err) => {
            if (watchdog) clearTimeout(watchdog);
            reject(err);
          });
          stream.on("error", (err) => {
            if (watchdog) clearTimeout(watchdog);
            reject(err);
          });

          stream.pipe(currentWriteStream);
        });

        delete activeDownloads[modelKey];
        return;

      } catch (err) {
        console.log(`[DOWNLOADER] Inner catch: ${err.message}`);
        if (isAborted || err.message === "Aborted") {
          console.log(`[DOWNLOADER] Throwing Aborted from inner catch`);
          throw new Error("Aborted");
        }

        attempt++;
        console.warn(`[Downloader] Attempt ${attempt} failed: ${err.message}`);

        if (attempt >= maxRetries) {
          throw err;
        }

        const delay = 2000 * Math.pow(2, attempt - 1);
        onProgress({
          model: modelKey,
          bytesDownloaded: getPartialBytes(modelKey),
          totalBytes: totalSize,
          percent: Math.round(getPartialBytes(modelKey) / totalSize * 100),
          phase: "retrying"
        });

        await Promise.race([
          new Promise((r) => setTimeout(r, delay)),
          cancelTimer
        ]);
      }
    }
  } catch (err) {
    console.log(`[DOWNLOADER] Outer catch: ${err.message}`);
    delete activeDownloads[modelKey];
    throw err;
  }
}
