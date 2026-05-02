// Low-level helpers for the Studio recorder.
// Kept framework-free so they can be unit-tested if needed.

export type StudioFormat = "9:16" | "16:9";

export const formatToRecordingFormat = (f: StudioFormat) =>
  f === "9:16" ? ("tiktok" as const) : ("youtube" as const);

export const pickMime = () => {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
};

export const getDisplayMediaSafely = () => {
  if (typeof navigator === "undefined") return null;
  const md = navigator.mediaDevices as MediaDevices | undefined;
  if (md?.getDisplayMedia) return md.getDisplayMedia.bind(md);
  const legacy = navigator as Navigator & {
    getDisplayMedia?: (c?: DisplayMediaStreamOptions) => Promise<MediaStream>;
  };
  if (legacy.getDisplayMedia) return legacy.getDisplayMedia.bind(legacy);
  return null;
};

export const isLikelyMobile = () => {
  if (typeof navigator === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
};

// Canvas dimensions for each format.
export const canvasSize = (f: StudioFormat) =>
  f === "9:16" ? { w: 720, h: 1280 } : { w: 1920, h: 1080 };

export const drawCover = (
  ctx: CanvasRenderingContext2D,
  v: HTMLVideoElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) => {
  const sw = v.videoWidth || dw;
  const sh = v.videoHeight || dh;
  const scale = Math.max(dw / sw, dh / sh);
  const w = sw * scale;
  const h = sh * scale;
  const x = dx + (dw - w) / 2;
  const y = dy + (dh - h) / 2;
  ctx.drawImage(v, x, y, w, h);
};

export const drawContain = (
  ctx: CanvasRenderingContext2D,
  v: HTMLVideoElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) => {
  const sw = v.videoWidth || dw;
  const sh = v.videoHeight || dh;
  const scale = Math.min(dw / sw, dh / sh);
  const w = sw * scale;
  const h = sh * scale;
  const x = dx + (dw - w) / 2;
  const y = dy + (dh - h) / 2;
  ctx.drawImage(v, x, y, w, h);
};

export const drawCircle = (
  ctx: CanvasRenderingContext2D,
  v: HTMLVideoElement,
  cx: number,
  cy: number,
  r: number,
) => {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const sw = v.videoWidth || r * 2;
  const sh = v.videoHeight || r * 2;
  const scale = Math.max((r * 2) / sw, (r * 2) / sh);
  const w = sw * scale;
  const h = sh * scale;
  ctx.drawImage(v, cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
};

export const fmtTime = (s: number) =>
  `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
