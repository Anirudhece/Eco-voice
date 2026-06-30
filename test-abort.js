import { downloadModel, abortDownload } from './model-downloader.js';

async function runTest() {
  console.log("Starting download...");
  let progressCount = 0;
  
  const promise = downloadModel("whisper", (p) => {
    progressCount++;
    console.log(`Progress: ${p.phase} - ${p.percent}%`);
    if (progressCount === 10) {
      console.log("Aborting download...");
      const result = abortDownload("whisper");
      console.log("Abort returned:", result);
    }
  });

  try {
    await promise;
    console.log("Download finished successfully.");
  } catch (err) {
    console.log("Download failed with:", err.message);
  }
}

runTest();
