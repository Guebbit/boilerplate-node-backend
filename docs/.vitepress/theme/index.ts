import type { EnhanceAppContext } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import './custom.css';

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

    overlay.appendChild(cloned);
    document.body.appendChild(overlay);
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

function attachToUnprocessed(): void {
    document.querySelectorAll<HTMLElement>('.vp-doc .mermaid').forEach((el) => {
        if (el.dataset.zoomAttached || !el.querySelector('svg')) return;
        el.dataset.zoomAttached = '1';
        el.addEventListener('click', () => openOverlay(el));
    });
}

export default {
    extends: DefaultTheme,
    enhanceApp(_ctx: EnhanceAppContext): void {
        if (typeof window === 'undefined') return;
        const observer = new MutationObserver(attachToUnprocessed);
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }
};
