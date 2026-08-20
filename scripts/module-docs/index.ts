/**
 * Assemble `docs/modules/` from the running code, and hold it to five coverage rules.
 *
 * Generated regions sit between `<!-- gen:name:start -->` / `<!-- gen:name:end -->` markers, so a
 * page is one file carrying both the facts nobody should retype and the prose only a person can
 * write. Regenerating rewrites the regions and never touches a line outside them.
 *
 * See: docs/modules/index.md · docs/theory/module-lifecycle.md
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { format, resolveConfig } from 'prettier';
import type { AppModule } from '@kernel/registry';
import { gatherFacts, type ModuleFacts } from './facts';
import {
    dataBlock,
    filesBlock,
    identityBlock,
    mapBlock,
    signalsBlock,
    surfaceBlock,
    workingBlock
} from './blocks';
import {
    allEndpointsBlock,
    legendBlock,
    matrixBlock,
    overviewMapBlock,
    pairingBlock,
    tallyBlock
} from './overview';

/** Block 9a — the sub-pages this module has earned, or a line saying it needs none. */
const subPagesBlock = (moduleName: string): string => {
    const pages = subPagesOf(moduleName);
    if (pages.length === 0)
        return 'Nothing in this domain needs a page of its own — the story above is the whole of it.';
    return pages.map((page) => `- [${page.title}](./${page.slug}.md)`).join('\n');
};
import { FRONTEND_PAIRING } from './pairing';
import { SUB_PAGES, subPagesOf } from './subpages';

/** Where the module pages live. */
export const DOCS_DIR = path.resolve(__dirname, '../../docs/modules');

/** One page the generator owns, and what it should contain. */
interface RenderedPage {
    /** Absolute path. */
    file: string;
    /** Full desired content. */
    content: string;
}

/** Replace one marked region, leaving everything outside it exactly as it was. */
const replaceRegion = (source: string, name: string, body: string, file: string): string => {
    const marker = new RegExp(
        String.raw`(<!-- gen:${name}:start -->)[\s\S]*?(<!-- gen:${name}:end -->)`,
        'g'
    );
    if (!marker.test(source))
        throw new Error(
            `${path.relative(process.cwd(), file)} has no \`<!-- gen:${name}:start -->\` / ` +
                `\`<!-- gen:${name}:end -->\` markers. A new generated block has to be pasted into ` +
                `the pages once — add the two markers where the block belongs, then re-run ` +
                `\`npm run docs:modules\`.`
        );
    return source.replace(marker, `$1\n\n${body}\n\n$2`);
};

/** The page a module gets before anyone has written its story. */
const pageTemplate = (name: string): string =>
    `# ${name}

::: tip At a glance
**Owns** — _one line._
**Depends on** — _one line._
**Breaks if you change** — _one line._
:::

<!-- gen:identity:start -->
<!-- gen:identity:end -->

## The map

<!-- gen:map:start -->
<!-- gen:map:end -->

## The story

_Why this domain exists, the decisions that are not obvious from the code, and the traps._

## Data

<!-- gen:data:start -->
<!-- gen:data:end -->

## Surface

<!-- gen:surface:start -->
<!-- gen:surface:end -->

## Signals

<!-- gen:signals:start -->
<!-- gen:signals:end -->

## Files

<!-- gen:files:start -->
<!-- gen:files:end -->

## Working on it

<!-- gen:working:start -->
<!-- gen:working:end -->

## Deeper in

<!-- gen:subpages:start -->
<!-- gen:subpages:end -->

## Related pages

- [Modules overview](./index.md)
`;

/** The overview page before anyone has written its introduction. */
const OVERVIEW_TEMPLATE = `# Modules

_One page per domain, top to bottom._

## The whole map

<!-- gen:overview-map:start -->
<!-- gen:overview-map:end -->

## Reading the diagrams

<!-- gen:legend:start -->
<!-- gen:legend:end -->

## Every module

<!-- gen:tally:start -->
<!-- gen:tally:end -->

<!-- gen:matrix:start -->
<!-- gen:matrix:end -->

## The two repositories

<!-- gen:pairing:start -->
<!-- gen:pairing:end -->
`;

/**
 * Run a page through prettier before it is written or compared.
 *
 * Without this the repo has two writers for one artefact — the generator emits a table, prettier
 * pads its columns, and `check:module-docs` then fails on a file nobody edited. `.prettierignore`
 * solves the same clash elsewhere by exempting the artefact, which is not available here: these
 * pages carry hand-written prose that should be formatted like any other markdown. Formatting
 * inside the generator makes it one writer again.
 */
const formatPage = async (content: string, file: string): Promise<string> => {
    const options = await resolveConfig(file);
    return format(content, { ...options, filepath: file });
};

/** Render every page the generator owns, preserving the prose already in them. */
const render = async (all: ModuleFacts[]): Promise<RenderedPage[]> => {
    const pages: RenderedPage[] = [];

    for (const facts of all) {
        const file = path.join(DOCS_DIR, `${facts.name}.md`);
        let content = existsSync(file) ? readFileSync(file, 'utf8') : pageTemplate(facts.name);

        content = replaceRegion(content, 'identity', identityBlock(facts, all), file);
        content = replaceRegion(content, 'map', mapBlock(facts, all), file);
        content = replaceRegion(content, 'data', dataBlock(facts), file);
        content = replaceRegion(content, 'surface', surfaceBlock(facts), file);
        content = replaceRegion(content, 'signals', signalsBlock(facts), file);
        content = replaceRegion(content, 'files', filesBlock(facts), file);
        content = replaceRegion(content, 'working', workingBlock(facts), file);
        content = replaceRegion(content, 'subpages', subPagesBlock(facts.name), file);

        pages.push({ file, content: await formatPage(content, file) });
    }

    const overviewFile = path.join(DOCS_DIR, 'index.md');
    let overview = existsSync(overviewFile)
        ? readFileSync(overviewFile, 'utf8')
        : OVERVIEW_TEMPLATE;
    overview = replaceRegion(overview, 'overview-map', overviewMapBlock(all), overviewFile);
    overview = replaceRegion(overview, 'legend', legendBlock(), overviewFile);
    overview = replaceRegion(overview, 'tally', tallyBlock(all), overviewFile);
    overview = replaceRegion(overview, 'matrix', matrixBlock(all), overviewFile);
    overview = replaceRegion(overview, 'pairing', pairingBlock(all), overviewFile);
    pages.push({ file: overviewFile, content: await formatPage(overview, overviewFile) });

    /* The API index renders the same routes as the module pages, from the same routers. One source,
     * two audiences: "what does this application serve" and "what does this domain serve". */
    const endpointsFile = path.resolve(__dirname, '../../docs/api/endpoints.md');
    if (existsSync(endpointsFile)) {
        const endpoints = replaceRegion(
            readFileSync(endpointsFile, 'utf8'),
            'all-endpoints',
            allEndpointsBlock(all),
            endpointsFile
        );
        pages.push({ file: endpointsFile, content: await formatPage(endpoints, endpointsFile) });
    }

    return pages;
};

/**
 * The five rules that make "nothing left behind" a check rather than a promise.
 *
 * Freshness is checked by the caller, because it is the one rule that compares written bytes
 * rather than gathered facts.
 */
const coverageFailures = (all: ModuleFacts[]): string[] => {
    const failures: string[] = [];
    const names = new Set(all.map((facts) => facts.name));

    // 1 — page coverage, the direction the filesystem can answer: a page nothing owns.
    const existingPages = existsSync(DOCS_DIR)
        ? readdirSync(DOCS_DIR)
              .filter((entry) => entry.endsWith('.md') && entry !== 'index.md')
              .map((entry) => entry.replace(/\.md$/, ''))
        : [];
    const declaredSubPages = new Set(SUB_PAGES.map((page) => page.slug));
    for (const page of existingPages)
        if (!names.has(page) && !declaredSubPages.has(page))
            failures.push(
                `docs/modules/${page}.md documents nothing enabled. Delete it, add the module back to src/modules.ts, or declare it in scripts/module-docs/subpages.ts.`
            );

    // A declared sub-page that was never written is the half of the rule a filesystem walk misses.
    for (const page of SUB_PAGES) {
        if (!names.has(page.module))
            failures.push(
                `scripts/module-docs/subpages.ts declares "${page.slug}" under module "${page.module}", which is not enabled.`
            );
        else if (!existsSync(path.join(DOCS_DIR, `${page.slug}.md`)))
            failures.push(
                `docs/modules/${page.slug}.md is declared in scripts/module-docs/subpages.ts and does not exist.`
            );
    }

    // 2 — file coverage: a shape nobody has described is invisible until it is named.
    for (const facts of all)
        for (const file of facts.files)
            if (file.unknown)
                failures.push(
                    `src/modules/${facts.name}/${file.path} matches no entry in scripts/module-docs/shapes.ts. Add one line describing the shape.`
                );

    // 4 — edge symmetry: both ends of every edge must be a page a reader can reach.
    for (const facts of all)
        for (const edge of facts.dependsOn)
            if (!names.has(edge.module))
                failures.push(
                    `src/modules/${facts.name}/module.ts depends on "${edge.module}", which has no page.`
                );

    // 5 — cross-repository pairing: the gap that widens most quietly.
    for (const facts of all) {
        const pairing = FRONTEND_PAIRING[facts.name];
        if (!pairing) {
            failures.push(
                `Module "${facts.name}" has no entry in scripts/module-docs/pairing.ts. Name its frontend counterpart, or state why it has none.`
            );
            continue;
        }
        const sameName =
            pairing.counterparts.length === 1 && pairing.counterparts[0] === facts.name;
        if (!sameName && !pairing.why)
            failures.push(
                `Module "${facts.name}" pairs with ${
                    pairing.counterparts.length > 0 ? pairing.counterparts.join(' + ') : 'nothing'
                } in the frontend and gives no reason. Add \`why\` to its entry in scripts/module-docs/pairing.ts.`
            );
    }
    for (const name of Object.keys(FRONTEND_PAIRING))
        if (!names.has(name))
            failures.push(
                `scripts/module-docs/pairing.ts names "${name}", which is not an enabled module.`
            );

    return failures;
};

/**
 * Generate the pages, or check that the committed ones match.
 *
 * @param appModules - the enabled module list
 * @param checkOnly - report instead of writing, and exit non-zero on any difference
 * @returns process exit code
 */
export const generateModuleDocumentation = async (
    appModules: AppModule[],
    checkOnly: boolean
): Promise<number> => {
    const all = await gatherFacts(appModules);
    const failures = coverageFailures(all);
    const pages = await render(all);

    if (checkOnly) {
        const stale = pages.filter(
            (page) => !existsSync(page.file) || readFileSync(page.file, 'utf8') !== page.content
        );
        for (const page of stale)
            failures.push(
                existsSync(page.file)
                    ? `${path.relative(process.cwd(), page.file)} is stale. Run \`npm run docs:modules\`.`
                    : `${path.relative(process.cwd(), page.file)} is missing. Run \`npm run docs:modules\`.`
            );

        if (failures.length > 0) {
            console.error(`✖ module docs — ${failures.length} problem(s):\n`);
            for (const failure of failures) console.error(`  · ${failure}`);
            return 1;
        }
        console.log(`✔ module docs — ${pages.length} pages current, ${all.length} modules covered`);
        return 0;
    }

    mkdirSync(DOCS_DIR, { recursive: true });
    let written = 0;
    for (const page of pages) {
        const before = existsSync(page.file) ? readFileSync(page.file, 'utf8') : null;
        if (before === page.content) continue;
        writeFileSync(page.file, page.content);
        written += 1;
        console.log(
            `  ${before === null ? 'created' : 'updated'} ${path.relative(process.cwd(), page.file)}`
        );
    }
    console.log(`✔ module docs — ${written} page(s) written, ${pages.length - written} unchanged`);

    if (failures.length > 0) {
        console.error(`\n✖ ${failures.length} coverage problem(s):\n`);
        for (const failure of failures) console.error(`  · ${failure}`);
        return 1;
    }
    return 0;
};
