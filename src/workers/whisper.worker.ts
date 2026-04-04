import { pipeline, env } from '@xenova/transformers';

// Skip local check to download from hub if not found locally
env.allowLocalModels = false;
env.useBrowserCache = true;

let transcriber: any = null;

type TranscribeMessage = {
  audio: Float32Array;
  language?: string;
};

async function getTranscriber(progressCallback: (data: any) => void) {
  if (!transcriber) {
    transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small', {
      progress_callback: progressCallback,
    });
  }
  return transcriber;
}

self.onmessage = async (e: MessageEvent<TranscribeMessage>) => {
  const { audio, language } = e.data;

  try {
    const pipe = await getTranscriber((progress) => {
      self.postMessage({ type: 'progress', data: progress });
    });

    const output = await pipe(audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
      language: language || 'russian',
      task: 'transcribe',
    });

    self.postMessage({ type: 'result', data: output });
  } catch (err: any) {
    self.postMessage({ type: 'error', data: err.message });
  }
};
