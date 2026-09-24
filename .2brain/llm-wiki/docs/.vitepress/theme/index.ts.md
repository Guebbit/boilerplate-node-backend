---
source: docs/.vitepress/theme/index.ts
sha256: 6a334f11e2e0f1e2aa72a34cffbefc6e13220389a47774f2d0f03c5d7b01f92a
generated_at: 2026-09-23T17:14:47.714634+00:00
model: ollama:qwen3.8:27b
---

# docs/.vitepress/theme/index.ts

## Purpose

VitePress theme entry point that extends the default theme to add a click-to-zoom overlay for Mermaid diagrams. It wires up the interaction at runtime (via `enhanceApp`) so that any `.mermaid` element rendered in the documentation can be enlarged in an accessible dialog.

## Key elements

- **`openOverlay(container: HTMLElement)`** — Clones the container's `<svg>`, strips fixed width/height attributes, appends it inside a `role="dialog"` overlay on `<body>`, and adds the `mermaid-zoom-active` body class. Handles closing via backdrop click or `Escape`, removes the overlay on `transitionend`, and cleans up the keydown listener.
- **`attachToUnprocessed()`** — Iterates `.vp-doc .mermaid` elements, skips ones already processed (`data-zoom-attached`), and binds a click handler that calls `openOverlay`.
- **Default export** — An object `{ extends: DefaultTheme, enhanceApp(_ctx) }` that registers a `MutationObserver` on `document.documentElement` (childList + subtree) so newly rendered Mermaid diagrams automatically get the zoom behavior.
- **`./custom.css`** — Side-effect import for the overlay's transition and backdrop styles.

## Relationships

No project-internal graph neighbors. The file depends only on the `vitepress` package (types, default theme) and the local `custom.css`.

## Notes

- **SSR guard:** `enhanceApp` bails out when `globalThis.window` is `undefined` (VitePress can call this during SSR/prerender).
- **Idempotent attachment:** The `data-zoom-attached="1"` attribute prevents duplicate listeners if `attachToUnprocessed` runs multiple times (it will, on every mutation).
- **Reflow trick:** `overlay.getBoundingClientRect()` is called before adding the `--visible` class to force a style flush so the CSS transition actually plays.
- **Backdrop-only close:** The click handler checks `e.target === overlay`; clicking the cloned SVG does _not_ dismiss the dialog.
- **Cleanup ordering:** `close()` removes the visibility class, schedules removal on `transitionend` (`{ once: true }`), strips the body class, and detaches the `keydown` listener — all synchronous so a rapid re-open doesn't leave stale listeners.
