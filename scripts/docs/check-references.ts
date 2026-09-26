#!/usr/bin/env tsx
/**
 * Every file path the docs CLAIM exists, checked against the files that do — `npm run
 * check:docs-references`.
 *
 * `docs:build` already refuses a dead LINK between two pages. Nothing refuses a dead FACT, and a
 * page naming `src/routes/` in a repo that has been `src/modules/<name>/` for a year reads as
 * current to everyone who has not opened the tree. That class of rot is silent, cheap to write,
 * and this is the only thing that looks for it.
 *
 * WHAT IS SWEPT, and why each narrowing matters:
 *   - Inline code spans only. A fenced block is a code SAMPLE — its imports describe an example,
 *     not this repo's tree, and sweeping them buries the real findings in illustration.
 *   - `./`-relative tokens are skipped. VitePress resolves those against the page, not the repo,
 *     and `docs:build` already fails on a dead one.
 *   - Resolution is by SUFFIX, so `orders/model.ts` matches `src/modules/orders/model.ts` without
 *     every page having to spell a path from the root.
 *   - A `#anchor` riding on a path this repo tracks is checked too, against that page's own
 *     headings — a page renamed out from under a citation elsewhere still resolves as a FILE, and
 *     only the anchor half used to go unchecked. Limited to a page in THIS repo: the peer's
 *     headings are its own tree to answer for, not ours to parse.
 *   - `@`-prefixed tokens are rewritten through `tsconfig`'s own path aliases, so `@modules/x`
 *     is checked and `@asyncapi/cli` — matching no alias — is read as the npm package it is.
 *   - Tokens starting with `/` are HTTP routes, not files. The contract owns those, and
 *     `lint:openapi` already refuses one that does not exist.
 *   - Directories count as targets, so `src/infrastructure/` resolves without naming a file.
 *   - A token starting with the paired repo's directory name is resolved over THERE. That is what
 *     makes citing it by its package name instead of its directory name a finding.
 *   - A line carrying `<!-- doc-paths:ignore -->` is skipped whole. Some prose has to NAME a path
 *     that is deliberately gone — a rename table's left column, a paragraph explaining why a file
 *     was merged away. The marker says "this line names an absent path on purpose", which is an
 *     argument a reader can check, unlike silence.
 *
 * The floors below are the point. A sweep that silently reads zero pages reports a clean tree
 * forever, which is worse than no sweep — see `TierWallsTest`'s canary for the same guard.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { resolveFrontendPath, DEFAULT_FRONTEND_PATH } from '../pairing/paired-frontend-path';
import {
    ROOT,
    ALLOWED,
    allowed,
    NOT_A_PATH,
    trackedTargets,
    resolves,
    claimsAPath,
    readAliases,
    throughAliases
} from './repo-references';

/** The paired repo, addressed in prose by the directory it actually sits in. */
const PEER_DIRECTORY = path.basename(DEFAULT_FRONTEND_PATH);

/**
 * The floors. Set just under what the tree currently holds, so ordinary editing never trips them
 * and a sweep that stops seeing the docs does. Raise them when the docs grow; never lower them to
 * make a run pass.
 */
const MIN_PAGES = 90;
const MIN_REFERENCES = 300;

/** Opt-out for a line that names an absent path deliberately. See the module header. */
const IGNORE_LINE = '<!-- doc-paths:ignore -->';

/** One unresolved claim, and the page that makes it. */
interface Finding {
    page: string;
    token: string;
}

/**
 * A page's heading slugs, VitePress's own way — lowercased, inline `` ` ``/`*`/`_` stripped,
 * punctuation dropped, spaces to hyphens — plus any explicit `{#custom-id}` a heading carries.
 * Approximate on purpose: VitePress de-duplicates a repeated heading with a `-1`/`-2` suffix, and
 * this does not, so a genuine collision under-reports rather than over-reports.
 */
const slugify = (heading: string): string =>
    heading
        .replaceAll(/[*_`~]/g, '')
        .trim()
        .toLowerCase()
        .replaceAll(/[^\s\w-]/g, '')
        .replaceAll(/\s+/g, '-')
        .replaceAll(/-+/g, '-')
        .replaceAll(/^-|-$/g, '');

/** Every anchor a markdown page answers to: one per heading, its own `{#id}` if it wrote one. */
const headingSlugs = (markdown: string): Set<string> => {
    const slugs = new Set<string>();

    for (const line of markdown.split('\n')) {
        const heading = /^#{1,6}\s+(.+)$/.exec(line)?.[1];
        if (!heading) continue;

        const explicit = /{#([\w-]+)}\s*$/.exec(heading)?.[1];
        slugs.add(explicit ?? slugify(heading.replace(/{#[\w-]+}\s*$/, '')));
    }

    return slugs;
};

/**
 * Normalize one inline code span into the path it claims (with any `#anchor` kept, separately),
 * or `undefined` when it claims none.
 *
 * Trailing `:42` / `:functionName` is a locator within a file, not part of it, and a trailing
 * slash is a directory's punctuation. The `#anchor`, unlike those two, is itself a claim — a page
 * this repo can check once the target is a page it tracks — so it survives to {@link tokenOf}.
 */
const toPath = (span: string): { path: string; anchor?: string } | undefined => {
    if (NOT_A_PATH.test(span)) return undefined;
    if (/^(https?|mailto):/.test(span)) return undefined;
    // VitePress resolves these against the page, and `docs:build` already fails on a dead one.
    if (span.startsWith('./') || span.startsWith('../')) return undefined;
    // An HTTP route. The contract owns those, and `lint:openapi` refuses one that does not exist.
    if (span.startsWith('/')) return undefined;

    const [beforeAnchor, anchor] = span.split('#');
    const path = beforeAnchor
        .split(':')[0]
        .replaceAll(/[,.;]+$/g, '')
        .replaceAll(/\/+$/g, '');
    if (!path || path.startsWith('-') || path.startsWith('$')) return undefined;

    return { path, anchor };
};

/** What one page's inline code spans resolve to: the paths it claims, filtered to the real ones. */
interface Scan {
    tokens: string[];
    findings: string[];
}

/** Everything a page claims and everything it gets wrong — one page, so the caller stays flat. */
const scanPage = (
    markdown: string,
    context: {
        aliases: { prefix: string; target: string }[];
        roots: Set<string>;
        own: Set<string>;
        peer: Set<string> | undefined;
        anchorsOf: (ownPath: string) => Set<string> | undefined;
    }
): Scan => {
    const scan: Scan = { tokens: [], findings: [] };

    // Line by line, so the opt-out marker can scope to the one claim that needs it rather than to
    // a whole page.
    for (const line of markdown.split('\n')) {
        if (line.includes(IGNORE_LINE)) continue;

        for (const [, span] of line.matchAll(/`([^`]+)`/g)) {
            const claim = tokenOf(span, context.aliases, context.roots);
            if (!claim) continue;

            scan.tokens.push(claim.path);
            if (!isReal(claim, context.own, context.peer, context.anchorsOf))
                scan.findings.push(claim.anchor ? `${claim.path}#${claim.anchor}` : claim.path);
        }
    }

    return scan;
};

/** One code span's path claim, and any `#anchor` locator riding along with it. */
interface Claim {
    path: string;
    anchor?: string;
}

/** One code span reduced to the repo path (and anchor) it claims, or nothing when it claims none. */
const tokenOf = (
    span: string,
    aliases: { prefix: string; target: string }[],
    roots: Set<string>
): Claim | undefined => {
    const claimed = toPath(span);
    if (!claimed) return undefined;

    const path = throughAliases(aliases, claimed.path);
    if (!path || !claimsAPath(roots, path) || allowed(path)) return undefined;

    return { path, anchor: claimed.anchor };
};

/**
 * Whether the file a claim names exists, and — when it names an anchor too — whether that page
 * actually carries a heading answering to it. A citation of the paired repo resolves over THERE,
 * by its DIRECTORY name; the anchor half only ever applies to a page (`.md`) in THIS repo, since
 * that is the only tree a heading can be read out of here.
 */
const isReal = (
    claim: Claim,
    own: Set<string>,
    peer: Set<string> | undefined,
    anchorsOf: (ownPath: string) => Set<string> | undefined
): boolean => {
    if (claim.path.startsWith(`${PEER_DIRECTORY}/`))
        // No peer checkout (a bare clone, a worktree): the cross-repo half is skipped, not failed.
        return !peer || resolves(peer, claim.path.slice(PEER_DIRECTORY.length + 1));

    if (!resolves(own, claim.path)) return false;
    if (!claim.anchor) return true;

    const slugs = anchorsOf(claim.path);
    // Not a page this repo tracks the heading text of (a non-`.md` file, or one `resolves` only
    // matched by a spelling other than a bare `.md` file) — the anchor claim goes unchecked, the
    // same way a peer-repo path already does above.
    return !slugs || slugs.has(claim.anchor);
};

/**
 * Every tail one of THESE pages answers to, mapped back to its actual path — the same suffix idea
 * as {@link trackedTargets}, so an anchor lookup can go straight from a claim's spelling to the
 * page whose headings settle it.
 *
 * Scoped to the pages this sweep already reads (`docs/**\/*.md`), not every `.md` file the repo
 * tracks — `.2brain/llm-wiki/<source path>.md` mirrors every SOURCE file under its own path plus
 * `.md`, so a repo-wide glob here would resolve `orders/repository.ts#findByIdScoped`'s anchor
 * against that unrelated generated summary instead of skipping it as the non-page it cites.
 */
const anchorPageFor = (pages: string[]): Map<string, string> => {
    const byTail = new Map<string, string>();

    for (const page of pages) {
        const segments = page.split('/');
        for (let index = 0; index < segments.length; index += 1)
            byTail.set(segments.slice(index).join('/'), page);
    }

    return byTail;
};

const run = (): number => {
    const aliases = readAliases();
    const own = trackedTargets(ROOT);
    /* The tracked roots, plus the generated ones git never sees. */
    const roots = new Set([...own.roots, ...ALLOWED.map((entry) => entry.prefix.split('/')[0])]);
    const peerRoot = resolveFrontendPath();
    // Absent in a bare checkout or a worktree; the cross-repo half is skipped rather than fatal.
    const peerTargets = existsSync(path.join(peerRoot, '.git'))
        ? trackedTargets(peerRoot).targets
        : undefined;

    const pages = execFileSync('git', ['ls-files', 'docs'], { cwd: ROOT, encoding: 'utf8' })
        .split('\n')
        .filter((file) => file.endsWith('.md'));

    const anchorPages = anchorPageFor(pages);
    // One read per cited page, not per citation — a heavily-linked page (the glossary, the module
    // index) would otherwise reparse its own headings dozens of times over one sweep.
    const slugsCache = new Map<string, Set<string>>();
    const anchorsOf = (ownPath: string): Set<string> | undefined => {
        const page = anchorPages.get(ownPath) ?? anchorPages.get(`${ownPath}.md`);
        if (!page) return undefined;

        if (!slugsCache.has(page))
            slugsCache.set(page, headingSlugs(readFileSync(path.join(ROOT, page), 'utf8')));
        return slugsCache.get(page);
    };

    const findings: Finding[] = [];
    let references = 0;

    const context = { aliases, roots, own: own.targets, peer: peerTargets, anchorsOf };

    for (const page of pages) {
        const scan = scanPage(readFileSync(path.join(ROOT, page), 'utf8'), context);

        references += scan.tokens.length;
        for (const token of scan.findings) findings.push({ page, token });
    }

    if (pages.length < MIN_PAGES || references < MIN_REFERENCES) {
        console.error(
            `[docs-references] Swept ${pages.length} pages and ${references} references — below ` +
                `the floor of ${MIN_PAGES}/${MIN_REFERENCES}.\n` +
                '               A sweep reading nothing reports a clean tree forever. Fix the ' +
                'sweep, do not lower the floor.'
        );
        return 1;
    }

    if (findings.length === 0) {
        console.log(
            `[docs-references] ${pages.length} pages, ${references} references, all resolved.`
        );
        return 0;
    }

    console.error(
        `[docs-references] ${pages.length} pages, ${references} references, ` +
            `${findings.length} matching no file:\n`
    );
    let current = '';
    for (const { page, token } of findings) {
        if (page !== current) {
            console.error(`  ${page}`);
            current = page;
        }
        console.error(`      ${token}`);
    }
    console.error('\n               Correct the claim, or add it to ALLOWED with a reason.');

    return 1;
};

process.exitCode = run();
