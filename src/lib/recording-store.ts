// In-memory hand-off between the recorder and the result page.
// Blob URLs created with URL.createObjectURL stay valid across SPA
// navigations within the same document, so we just need to pass the URL.

export type LastRecording = {
  url: string;
  format: "standard" | "tiktok";
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
