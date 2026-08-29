# public/favicon/safari-pinned-tab.svg

## Purpose

Vector icon displayed in Safari's tab bar when the site is pinned. It provides a crisp, resolution-independent brand mark for that specific context. The file is referenced from the HTML `<head>` via a `<link rel="mask-icon">` tag (typically alongside a `color` hint).

## Key elements

- **Single `<path>` element** – One complex bezier path defines the entire glyph (a letterform/logo shape). It is the only visible drawing primitive in the file.
- **ViewBox / canvas** – `558 × 558 pt` coordinate space; the path is drawn inside a `<g>` that flips the Y-axis (`scale(0.1, -0.1)` + `translate(0, 558)`), a convention left over from the potrace vectorization pipeline.
- **Fill** – Solid black (`#000000`), no stroke. The icon is a single-color silhouette; the browser (or the `color` attribute in the `<link>` tag) supplies any background.
- **Metadata** – `<metadata>` block notes the file was produced by **potrace 1.14**, meaning the original artwork was a bitmap that was traced to vector.

## Relationships

All graph neighbors are siblings in the same favicon set:

- `apple-touch-icon.png`, `favicon-16x16.png`, `favicon-32x32.png`, `mstile-150x150.png` – Together these files form the complete set of site icons declared in the HTML `<head>`. Each targets a different browser/OS (Safari Pinned Tab, iOS home screen, generic favicons, Windows tiles). There is no code-level import between them; they are all independently referenced by the document's `<link>` elements and must stay visually consistent with one another.

## Notes

- **Potrace artifact**: The inverted-Y transform and the large absolute coordinate values in the `d` attribute are a by-product of potrace's PostScript-style coordinate system. If editing the path manually, keep the `<g>` transform intact or re-normalize the coordinates.
- **Mask icon convention**: Browsers typically apply this SVG as a *mask* (the colored area becomes the background color, the rest is transparent). Ensure the shape has sufficient "ink" area so it reads well when masked.
- **Size**: At 558 pt the vector is far larger than the ~16–32 px display size; no rasterization is needed at any standard DPI, but the file is still only ~5 KB, so there is no performance concern.
- **No external references**: The SVG is fully self-contained (no `<image>`, no `xlink:href`, no CSS imports). It will render identically offline.
