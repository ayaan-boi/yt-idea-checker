"use client";

import { useRef, useState } from "react";

// Reads a File, resizes to max 1280px wide, returns:
//   { dataUrl, contrast } where contrast is RMS luminance contrast (0–1).
// Keeps payloads small (~50–200 KB) while preserving enough detail for vision models.
// The RMS contrast is computed using the standard sRGB luminance formula and is
// the feature Hoiles et al. (2017) identified as one of the top pre-upload
// predictors of YouTube view count.
async function fileToCompressedDataUrl(file, maxW = 1280, quality = 0.82) {
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });

  const scale = Math.min(1, maxW / img.width);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);

  // Compute RMS luminance contrast on a downsampled grid (fast, deterministic).
  const contrast = computeRmsContrast(ctx, w, h);

  return {
    dataUrl: canvas.toDataURL("image/jpeg", quality),
    contrast,
  };
}

// Standard RMS contrast: sqrt(mean((L_i - L_mean)^2)) on sRGB luminance.
// Sampled on a 64x36 grid so it's O(constant) regardless of input size.
function computeRmsContrast(ctx, w, h) {
  const gridW = 64, gridH = 36;
  const stepX = Math.max(1, Math.floor(w / gridW));
  const stepY = Math.max(1, Math.floor(h / gridH));
  const lums = [];
  for (let y = 0; y < h; y += stepY) {
    for (let x = 0; x < w; x += stepX) {
      const px = ctx.getImageData(x, y, 1, 1).data;
      // sRGB luminance approximation (Rec. 709).
      const L = (0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2]) / 255;
      lums.push(L);
    }
  }
  if (!lums.length) return 0;
  const mean = lums.reduce((a, b) => a + b, 0) / lums.length;
  const variance = lums.reduce((a, L) => a + (L - mean) ** 2, 0) / lums.length;
  return Math.sqrt(variance); // 0..~0.5 for typical images
}

export default function ThumbnailUpload({ value, onChange, disabled }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Accept either { dataUrl, contrast } (current) or a raw string (legacy/history).
  const previewUrl = value && typeof value === "object" ? value.dataUrl : value;
  const contrast = value && typeof value === "object" ? value.contrast : null;

  async function handleFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please pick an image file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be under 10 MB.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const { dataUrl, contrast } = await fileToCompressedDataUrl(file);
      onChange({ dataUrl, contrast });
    } catch (e) {
      setError("Couldn't read that image.");
    } finally {
      setBusy(false);
    }
  }

  function onPickClick() {
    inputRef.current?.click();
  }

  function onDrop(e) {
    e.preventDefault();
    if (disabled) return;
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  }

  function onRemove(e) {
    e.stopPropagation();
    onChange(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="field">
      <label>Thumbnail (optional)</label>
      <div
        className={`thumb-drop ${value ? "has-image" : ""} ${disabled ? "disabled" : ""}`}
        onClick={onPickClick}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
      >
        {previewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Thumbnail preview" className="thumb-preview" />
            <button
              type="button"
              className="thumb-remove"
              onClick={onRemove}
              disabled={disabled}
              aria-label="Remove thumbnail"
            >
              ×
            </button>
          </>
        ) : (
          <div className="thumb-empty">
            <div className="thumb-empty-icon">🖼️</div>
            <div className="thumb-empty-text">
              {busy ? "Processing…" : "Drop a thumbnail here or click to upload"}
            </div>
            <div className="thumb-empty-hint">PNG / JPG · up to 10MB</div>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={(e) => handleFile(e.target.files?.[0])}
          style={{ display: "none" }}
          disabled={disabled}
        />
      </div>
      {error && <span className="hint" style={{ color: "var(--red)" }}>{error}</span>}
      {previewUrl && !error && contrast != null && (
        <span className="hint">
          Measured RMS contrast: <strong>{contrast.toFixed(3)}</strong>
          {contrast < 0.1
            ? " · low (may look flat)"
            : contrast < 0.18
            ? " · moderate"
            : " · strong"}
        </span>
      )}
      {previewUrl && !error && contrast == null && (
        <span className="hint">AI will review what's visually working and what's not.</span>
      )}
    </div>
  );
}
