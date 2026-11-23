---
source: docs/.vitepress/theme/MermaidDiagram.vue
source_sha256: c3c93eee79f42c55a081a974161dd48dcdba1f66f360e90e47f1c56ee6947d57
context_sha256: fb50714caea6b4d14892241bf5a988be2c776e7a484af9ac0843e3a2b94deefd
generated_at: 2026-11-22T01:34:57.963265+00:00
model: claude-code:claude-sonnet-5-5
---

# docs/.vitepress/theme/MermaidDiagram.vue

## Purpose
A Vue single-file component that renders one Mermaid diagram on a VitePress docs site. It takes the diagram source as a prop, lazily loads Mermaid in the browser, draws the SVG into a `div.mermaid`, and redraws when the site switches between light and dark mode.

## Key elements
- **`code` prop** (`string`): the fence source, URL-encoded by a markdown rule in `config.mts` so it can sit in an HTML attribute. It is decoded with `decodeURIComponent` before rendering.
- **`isDark`** (from VitePress `useData()`): selects Mermaid's `dark` theme, otherwise `neutral`. A watcher on it re-renders.
- **`host` ref**: the `<div class="mermaid">` that receives the SVG. The `mermaid` class is what the zoom overlay and `custom.css` select.
- **`render()`**: dynamically imports `mermaid`, initializes it, then renders the source to an SVG string. The string is parsed with `DOMParser` as `text/html` and its first element replaces the host's children. It never rejects.
- **`renderCounter`**: increments on each render. It makes ids unique and drops stale results, so a slow earlier render can't overwrite a newer one.
- **`idPrefix`**: a random per-component prefix (`mermaid-xxxxxx`), so ids from different diagrams don't collide.
- **`unmounted` flag**: set in `onBeforeUnmount`, so late renders stop touching the DOM.
- **Lifecycle**: `onMounted` triggers the first render, and `watch(isDark)` triggers re-renders.

## Relationships
- **`docs/.vitepress/theme/mermaid-options.ts`**: imports `mermaidOptions` and spreads it into the Mermaid initialization options. The component then overrides `startOnLoad`, `suppressErrorRendering`, `securityLevel`, `layout`, `look` and `theme`, so these win over any same-named keys in the shared options.
- **`docs/.vitepress/theme/index.ts`** (theme entry): not imported here. It is the theme entry in the same directory, so it presumably registers or uses this component. That wiring is not visible in this file.
- **`src/infrastructure/adapters/logger.ts`**: no import or call appears in this file. Errors are reported through the browser console directly.

## Notes
- Mermaid is imported dynamically inside `render()`, not at the top of the file, so the server-side build never loads it.
- `securityLevel: 'strict'` makes Mermaid sanitise labels and disable `click` callbacks. The SVG is parsed as HTML rather than `image/svg+xml` because Mermaid's HTML labels (`<br>`, `<i>`) are not well-formed XML.
- `suppressErrorRendering: true` stops Mermaid 12 from leaving an error node on `document.body`. Failures are shown inside the host as `Diagram not drawn: <message>` and also logged to the console.
- `layout: 'dagre'` and `look: 'classic'` pin the Mermaid 11 appearance, because Mermaid 12 defaults to ELK layout and the `neo` look.
- Mermaid is re-initialized on every render, because the theme can change between renders.
