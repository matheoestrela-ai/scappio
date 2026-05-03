// In-memory hand-off between the recorder and the result page.
// Blob URLs created with URL.createObjectURL stay valid across SPA
// navigations within the same document.

export type RecordingFormat = "youtube" | "tiktok";

export type LastRecording = {
  url: string;
  format: RecordingFormat;
};

let last: LastRecording | null = null;
let lastConsumed: LastRecording | null = null;

export const setLastRecording = (rec: LastRecording) => {
  last = rec;
  lastConsumed = rec;
};

export const consumeLastRecording = (): LastRecording | null => {
  // Keep a fallback copy so React StrictMode's double-invocation
  // (or a quick remount) still finds the recording on the second pass.
  const r = last ?? lastConsumed;
  last = null;
  return r;
};
