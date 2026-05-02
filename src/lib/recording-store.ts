// In-memory hand-off between the recorder and the result page.
// Blob URLs created with URL.createObjectURL stay valid across SPA
// navigations within the same document.

export type RecordingFormat = "youtube" | "tiktok";

export type LastRecording = {
  url: string;
  format: RecordingFormat;
};

let last: LastRecording | null = null;

export const setLastRecording = (rec: LastRecording) => {
  last = rec;
};

export const consumeLastRecording = (): LastRecording | null => {
  const r = last;
  last = null;
  return r;
};
