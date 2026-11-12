/**
 * @module
 * Dead `docs/…` links cited OUTSIDE `docs/` — in source comments, scripts, contract YAML and
 * `.env-example` — resolved the way `check-references.ts` resolves a page's own citations.
 *
 * Checks:      the cited page is tracked, and a `#anchor` is a heading of that page.
 * Does not:    judge wording, coverage or how many citations exist.
 * Skips:       a URL, a `../`-relative path and a peer repo's `<dir>/docs/…` (the lookbehind).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { slugify } from '@mdit-vue/shared';
import { gitEnvironment } from './repo-references';

/**
 * A page's heading slugs, VitePress's own way: its `slugify` (`@mdit-vue/shared`) over the
 * heading's plain text, a repeated heading de-duplicated with `-1`/`-2` as markdown-it-anchor
 * does, plus any explicit `{#custom-id}` a heading carries.
 * https://github.com/mdit-vue/mdit-vue/tree/main/packages/shared
 *
 * @param markdown - the page's source text
 * @returns every anchor a link to the page may use
 */
export const headingSlugs = (markdown: string): Set<string> => {
    const slugs = new Set<string>();
    let inFence = false;

    for (const line of markdown.split('\n')) {
        // A `#` line inside a fenced block is a code comment, not a heading.
        if (/^\s*(?:```|~~~)/.test(line)) inFence = !inFence;
        const heading = inFence ? undefined : /^#{1,6}\s+(\S.*)$/.exec(line)?.[1];
        if (!heading) continue;

        const explicit = /\{#([\w-]+)\}\s*$/.exec(heading)?.[1];
        // The title VitePress slugs is the heading's text: link targets, code ticks and
        // emphasis marks are not part of it.
        const text = heading
            .replace(/\{#[\w-]+\}\s*$/, '')
            .replaceAll(/\[([^\]]*)\]\([^)]*\)/g, '$1')
            .replaceAll(/[*`]/g, '');
        const base = explicit ?? slugify(text);

        let slug = base;
        for (let n = 1; slugs.has(slug); n++) slug = `${base}-${n}`;
        slugs.add(slug);
    }

    return slugs;
};

/**
 * `docs/<path>.md` with an optional `#anchor`, not glued to a longer path or a URL. Starting at
 * the repo's own `docs/` is what leaves a peer repo's pages and `https://…/docs/…` alone.
 */
const CITATION = /(?<![\w/.:-])(docs\/[\w./-]+\.md)(?:#([^\s)\]`'"<>,;]+))?/g;

/** Tracked files that may carry a citation: code, scripts, YAML contracts and the env example. */
const isCitingFile = (file: string): boolean =>
    (file.startsWith('src/') ||
        file.startsWith('scripts/') ||
        /\.ya?ml$/.test(file) ||
        file === '.env-example') &&
    !file.startsWith('docs/') &&
    !file.startsWith('.2brain/');

/**
 * Every `docs/…` citation in the tracked non-docs files of `root` that points at nothing.
 *
 * @param root - repository root, a git work tree
 * @returns one `file: citation` line per dead link, in file order
 */
export const deadCodeCitations = (root: string): string[] => {
    const files = execFileSync('git', ['ls-files'], {
        cwd: root,
        encoding: 'utf8',
        env: gitEnvironment()
    })
        .split('\n')
        .filter((file) => file !== '');
    const pages = new Set(files.filter((file) => file.startsWith('docs/') && file.endsWith('.md')));
    // One parse per cited page, however many files cite it.
    const slugsCache = new Map<string, Set<string>>();
    const slugsOf = (page: string): Set<string> => {
        if (!slugsCache.has(page))
            slugsCache.set(page, headingSlugs(readFileSync(path.join(root, page), 'utf8')));
        return slugsCache.get(page) ?? new Set();
    };

    const dead: string[] = [];
    for (const file of files.filter((file) => isCitingFile(file))) {
        const text = readFileSync(path.join(root, file), 'utf8');
        for (const [, page, cited = ''] of text.matchAll(CITATION)) {
            // Sentence punctuation after the anchor is not part of it.
            const anchor = cited.replace(/[.:!?]+$/, '');
            const known =
                pages.has(page) && (!anchor || slugsOf(page).has(decodeURIComponent(anchor)));
            if (!known) dead.push(`${file}: ${anchor ? `${page}#${anchor}` : page}`);
        }
    }

    return dead;
};
