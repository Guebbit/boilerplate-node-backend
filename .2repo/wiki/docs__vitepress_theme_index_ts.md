# docs/.vitepress/theme/index.ts

## Purpose

VitePress custom theme entry point that extends the default theme and adds a click-to-zoom interaction for Mermaid diagrams rendered in the docs. It injects a full-screen overlay (cloning the SVG) when a user clicks a diagram, with backdrop-click or Escape-key dismissal.

## Key elements

- **`openOverlay(container: HTMLElement)`** — Clones the `<svg>` inside the given Mermaid container into a new `.mermaid-zoom-overlay` dialog appended to `<body>`. Forces a reflow, adds the `--visible` modifier class to trigger the CSS transition, and wires up close handlers (backdrop click, `Escape` key). Removes the overlay and body class on close.
- **`attachToUnprocessed()`** — Iterates all `.vp-doc .mermaid` elements, skips ones already marked with `data-zoom-attached="1"` or lacking an inner `<svg>`, and binds a click listener that calls `openOverlay`.
- **Default export** — An object extending `DefaultTheme` with an `enhanceApp` hook. On the client only, it creates a `MutationObserver` on `document.documentElement` (`childList`, `subtree`) so the zoom handler is attached to Mermaid nodes as they are progressively rendered by VitePress.
- **`./custom.css` import** — Pulls in the overlay and zoom transition styles.

## Relationships

No graph neighbors are recorded for this file. It is a leaf: it imports only `vitepress` types, `vitepress/theme`, and a local stylesheet, and is not imported by any other file in the dependency graph.

## Notes

- The `MutationObserver` approach is required because Mermaid SVGs are injected asynchronously by VitePress after initial DOM parse; a one-shot query in `enhanceApp` would miss them.
- The `data-zoom-attached` attribute on each container is the guard against double-binding if the observer fires multiple times.
- The overlay close path relies on the CSS `transitionend` event to actually remove the node from the DOM; if the transition is disabled or never fires (e.g., `prefers-reduced-motion`), the overlay element may persist. The visible class is still removed, so it should be visually hidden, but the DOM node remains until another interaction or page navigation.
- The cloned SVG has its `width`/`height` attributes and inline styles stripped so it scales to the overlay container via CSS rather than retaining the original fixed dimensions.
