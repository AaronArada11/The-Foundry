import type { OcrResult, OcrWord } from "./models";

type ProgressCallback = (progress: number, status: string) => void;

let activeProgress: ProgressCallback | null = null;
let workerPromise: Promise<import("tesseract.js").Worker> | null = null;

async function getWorker(): Promise<import("tesseract.js").Worker> {
  if (!workerPromise) {
    workerPromise = import("tesseract.js").then(({ createWorker, OEM }) =>
      createWorker("eng", OEM.LSTM_ONLY, {
        workerPath: "/ocr/worker.min.js",
        // The baseline LSTM build is slower than SIMD on some devices, but is the
        // most reliable choice across embedded browsers and WebViews.
        corePath: "/ocr/core/tesseract-core-lstm.wasm.js",
        langPath: "/ocr/lang",
        workerBlobURL: false,
        logger: (message) => activeProgress?.(Math.round(message.progress * 100), message.status),
      }),
    ).catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

async function loadBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return createImageBitmap(file);
  }
}

export async function inspectImage(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await loadBitmap(file);
  const dimensions = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dimensions;
}

async function preprocess(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await loadBitmap(file);
  if (bitmap.width * bitmap.height > 40_000_000) {
    bitmap.close();
    throw new Error("Screenshots must contain 40 megapixels or fewer.");
  }
  const scale = bitmap.width < 1800 ? Math.min(2, 1800 / bitmap.width) : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error("This browser could not prepare the screenshot for OCR.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  for (let index = 0; index < data.length; index += 4) {
    const grey = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    const contrasted = Math.max(0, Math.min(255, (grey - 128) * 1.22 + 128));
    data[index] = contrasted;
    data[index + 1] = contrasted;
    data[index + 2] = contrasted;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

export async function recognizeSchedule(
  file: File,
  onProgress: ProgressCallback,
): Promise<OcrResult> {
  activeProgress = onProgress;
  const [worker, canvas] = await Promise.all([getWorker(), preprocess(file)]);
  try {
    const result = await worker.recognize(
      canvas,
      { rotateAuto: true },
      { text: true, blocks: true },
    );
    const words: OcrWord[] = [];
    for (const block of result.data.blocks ?? []) {
      for (const paragraph of block.paragraphs) {
        for (const line of paragraph.lines) {
          for (const word of line.words) {
            words.push({ text: word.text, confidence: word.confidence, bbox: word.bbox });
          }
        }
      }
    }
    return { text: result.data.text, confidence: result.data.confidence, words };
  } finally {
    activeProgress = null;
  }
}

export async function terminateOcr(): Promise<void> {
  const pending = workerPromise;
  workerPromise = null;
  activeProgress = null;
  if (pending) {
    try {
      const worker = await pending;
      await worker.terminate();
    } catch {
      // A failed worker has no resources left to terminate.
    }
  }
}
