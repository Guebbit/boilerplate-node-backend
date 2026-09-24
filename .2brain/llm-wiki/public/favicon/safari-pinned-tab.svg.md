---
source: public/favicon/safari-pinned-tab.svg
sha256: 60736c080988dab89ef0c9a0f9c924e520df61727f1d3883a8414f479dcb1192
generated_at: 2026-09-23T17:16:16.000475+00:00
model: ollama:qwen3.8:27b
---

# public/favicon/safari-pinned-tab.svg

## Purpose

Static vector icon displayed by Safari when the user pins a site to their toolbar. It exists so that pinned-tab users see a crisp, resolution-independent glyph rather than a raster favicon. It is referenced from the HTML `<head>` (typically via a `<link rel="mask-icon" …>` tag) and is never loaded by application code.

## Key elements

- **`<svg>` root** — 558 × 558 pt canvas with `viewBox="0 0 558 558"` and `preserveAspectRatio="xMidYMid meet"`; no external references.
- **`<g transform="translate(0,558) scale(0.1,-0.1)"`** — flips the Y-axis (potrace output convention) and scales from the internal 5580-unit grid down to the 558 pt viewport. Fill is solid `#000000`, no stroke.
- **Single `<path>`** — the entire icon geometry (a stylised logo shape) in one compound path. No gradients, no additional layers, no text elements.
- **`<metadata>`** — records the generator (`potrace 1.14`); purely informational, ignored by browsers.

## Relationships

All neighbors (`android-chrome-512x512.png`, `apple-touch-icon.png`, `favicon-16x16.png`, `favicon-32x32.png`, `mstile-150x150.png`) are **sibling static assets** in the same `public/favicon/` directory. None import or reference this file; each is independently linked from the document head or the web-app manifest for its respective browser/platform. They form a single favicon _set_ but have no code-level coupling to one another.

## Notes

- The file is pure vector; Safari renders it at any pin size without upscaling artifacts. Do **not** rasterise or replace with a PNG unless the project drops Safari-pinned-tab support.
- Because it uses potrace's Y-flip transform, the path coordinates appear "upside-down" if you open them in a raw path editor. The visual top of the icon is at the _bottom_ of the coordinate space.
- Single solid-black fill means the icon will inherit the user's Safari tab-bar colour scheme only if the consuming HTML also declares a `mask-icon` with a matching format hint; otherwise it renders as-is (black on white).
