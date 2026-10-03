import type { EnhanceAppContext } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import './custom.css';

/**
 * Show one Mermaid diagram enlarged in a full-screen overlay; a backdrop click or Escape closes it.
 *
 * @param container - the `.mermaid` element whose SVG is cloned into the overlay
 */
function openOverlay(container: HTMLElement): void {
    const svg = container.querySelector('svg');
    if (!svg) return;

    const overlay = document.createElement('div');
    overlay.className = 'mermaid-zoom-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Enlarged diagram — click or press Escape to close');

    const cloned = svg.cloneNode(true) as SVGElement;
    cloned.removeAttribute('width');
    cloned.removeAttribute('height');
    cloned.style.width = '';
    cloned.style.height = '';

    overlay.append(cloned);
    document.body.append(overlay);
    document.body.classList.add('mermaid-zoom-active');

    // Force a reflow so the CSS transition plays
    overlay.getBoundingClientRect();
    overlay.classList.add('mermaid-zoom-overlay--visible');

    function close(): void {
        overlay.classList.remove('mermaid-zoom-overlay--visible');
        overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
        document.body.classList.remove('mermaid-zoom-active');
        document.removeEventListener('keydown', onKey);
    }

    function onKey(e: KeyboardEvent): void {
        if (e.key === 'Escape') close();
    }

    // Only close when clicking the dark backdrop, not the SVG itself
    overlay.addEventListener('click', (e: MouseEvent) => {
        if (e.target === overlay) close();
    });
    document.addEventListener('keydown', onKey);
}

/** Make every diagram not yet wired clickable, once each (`data-zoom-attached` marks the done). */
function attachToUnprocessed(): void {
    for (const el of document.querySelectorAll<HTMLElement>('.vp-doc .mermaid')) {
        if (el.dataset.zoomAttached || !el.querySelector('svg')) continue;
        el.dataset.zoomAttached = '1';
        el.addEventListener('click', () => openOverlay(el));
    }
}

/**
 * The VitePress theme: the default one, plus a `MutationObserver` that wires up diagrams as the
 * page renders them (Mermaid draws client-side, after the page loads).
 * https://vitepress.dev/guide/extending-default-theme
 */
export default {
    extends: DefaultTheme,
    enhanceApp(_ctx: EnhanceAppContext): void {
        if (globalThis.window === undefined) return;
        const observer = new MutationObserver(attachToUnprocessed);
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }
};
