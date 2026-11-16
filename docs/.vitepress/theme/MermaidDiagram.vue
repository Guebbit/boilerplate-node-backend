<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useData } from 'vitepress';
import { mermaidOptions } from './mermaid-options';

/**
 * One Mermaid diagram. `code` is the fence source, URL-encoded by the markdown rule in
 * `config.mts` so it survives being written into an HTML attribute.
 */
const props = defineProps<{ code: string }>();

/**
 * VitePress's appearance state: the diagram redraws in Mermaid's dark theme when it flips.
 */
const { isDark } = useData();

/**
 * The element the SVG is attached to. Its `mermaid` class is what the zoom overlay and
 * `custom.css` select.
 */
const host = ref<HTMLElement>();

/**
 * Counts renders so a slow earlier one never overwrites a newer one, and gives every render a
 * unique element id (Mermaid inserts a temporary node under that id).
 */
let renderCounter = 0;

/**
 * Random prefix, drawn once per component, so ids of two diagrams never collide.
 */
const idPrefix = `mermaid-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Whether the component is gone, so a late render stops touching the DOM.
 */
let unmounted = false;

/**
 * Draws the diagram into the host element. Mermaid is imported here, never at the top, so the
 * server-side build does not load it.
 *
 * @returns A promise settling once the SVG is attached or the failure is logged; it never rejects.
 */
const render = (): Promise<void> => {
    renderCounter += 1;
    const current = renderCounter;
    return import('mermaid')
        .then(({ default: mermaid }) => {
            // Mermaid initialize: `startOnLoad: false` (we render on demand), `securityLevel` strict
            // (labels are sanitised and `click` callbacks are off), `theme` is Mermaid's own name.
            // `suppressErrorRendering`: without it Mermaid 12 draws its error into a temp node on
            // `document.body` and never removes it; the failure is shown inside the host instead.
            // https://mermaid.js.org/config/schema-docs/config.html
            mermaid.initialize({
                ...mermaidOptions,
                startOnLoad: false,
                suppressErrorRendering: true,
                securityLevel: 'strict',
                // Mermaid 12 defaults to the ELK layout and the `neo` look; these two keep the
                // diagrams as they were drawn on 11.
                // https://mermaid.js.org/config/layouts.html
                layout: 'dagre',
                look: 'classic',
                theme: isDark.value ? 'dark' : 'neutral'
            });
            // render(id, source): returns the SVG as a string.
            // https://mermaid.js.org/config/usage.html#api-usage
            return mermaid
                .render(`${idPrefix}-${current}`, decodeURIComponent(props.code))
                .then(({ svg }) => {
                    if (unmounted || current !== renderCounter || !host.value) return;
                    // Parsed as HTML, not XML: Mermaid's HTML labels (`<br>`, `<i>`) are not well-formed
                    // XML, so an `image/svg+xml` parse would yield a parse error. The string is already
                    // sanitised by Mermaid under `securityLevel: 'strict'`.
                    const parsed = new DOMParser().parseFromString(svg, 'text/html');
                    const drawing = parsed.body.firstElementChild;
                    if (drawing) host.value.replaceChildren(drawing);
                });
        })
        .catch((error: unknown) => {
            // A chunk that fails to load, or a diagram Mermaid cannot parse: say why in the console and
            // in the diagram's own box, so the page still works and the cause is findable. A stale
            // render (superseded, or the component gone) touches nothing.
            console.error('Mermaid diagram not drawn', error);
            if (unmounted || current !== renderCounter || !host.value) return;
            host.value.textContent = `Diagram not drawn: ${error instanceof Error ? error.message : 'unknown error'}`;
        });
};

watch(isDark, () => {
    void render();
});

onMounted(() => {
    void render();
});

onBeforeUnmount(() => {
    unmounted = true;
});
</script>

<template>
    <div ref="host" class="mermaid"></div>
</template>
