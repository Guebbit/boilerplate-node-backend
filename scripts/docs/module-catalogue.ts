/**
 * @module
 * The module catalogue: every module's place in the docs, derived from what it says about itself.
 *
 * Feeds two readers that used to be hand-kept lists of module names — the "Every module" section
 * of `docs/modules/index.md` and the `/modules/` sidebar in `docs/.vitepress/config.mts`. Both
 * group by `module.yaml#group` (foundation first, then the demo shop), so a new module appears in
 * the right place by declaring its group and a summary, and nothing else.
 *
 * Pure apart from {@link readCatalogue}, the one disk read, so a test can drive the rest with a
 * virtual module list.
 *
 * See: docs/modules/index.md, docs/theory/strategic-ddd.md#4a-foundation-and-shop
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readAllModuleDescriptors, type ModuleDescriptor } from './module-descriptor';

/** A deeper page of one module's own, e.g. `cart-checkout.md` under `cart`. */
export interface CataloguePage {
    /** The page's file stem, which is also its URL under `/modules/`. */
    stem: string;
    /** What the sidebar calls it: the page's own first heading. */
    title: string;
}

/** One module, as the docs list it. */
export interface CatalogueEntry {
    name: string;
    group: ModuleDescriptor['group'];
    subdomain: ModuleDescriptor['subdomain'];
    summary: string;
    /** Deeper pages, named `<module>-<topic>.md`, in file order. */
    pages: CataloguePage[];
}

/** The groups in the order the docs present them, with what each heading says. */
export const GROUPS: readonly {
    group: ModuleDescriptor['group'];
    heading: string;
    blurb: string;
}[] = [
    {
        group: 'foundation',
        heading: 'Foundation',
        blurb: 'Ships with every deployment, whatever the project becomes. Copy `feedback` to start a new module.'
    },
    {
        group: 'shop',
        heading: 'Demo shop',
        blurb: 'The pet-supply e-commerce domain this boilerplate demos itself with. Nothing in the foundation may depend on it, and `npm run demo:remove` deletes it.'
    }
];

/** First `# ` heading of a Markdown file, falling back to the file stem. */
const titleOf = (file: string, fallback: string): string =>
    /^# (.+)$/m.exec(readFileSync(file, 'utf8'))?.[1] ?? fallback;

/**
 * Every module's catalogue entry, read off `module.yaml` and the pages beside it.
 *
 * A page is a deeper page of module `m` when it is named `m-<topic>.md` and is not itself a
 * module's page (`api-keys.md` belongs to `api-keys`, not to a module called `api`).
 *
 * @param modulesRoot - the `src/modules` directory
 * @param pagesRoot - the `docs/modules` directory
 * @returns one entry per module, alphabetical
 */
export const readCatalogue = (modulesRoot: string, pagesRoot: string): CatalogueEntry[] => {
    const descriptors = readAllModuleDescriptors(modulesRoot);
    const names = new Set(Object.keys(descriptors));
    const stems = existsSync(pagesRoot)
        ? readdirSync(pagesRoot)
              .filter((file) => file.endsWith('.md'))
              .map((file) => file.slice(0, -'.md'.length))
              .toSorted()
        : [];

    return Object.entries(descriptors).map(([name, descriptor]) => ({
        name,
        group: descriptor.group,
        subdomain: descriptor.subdomain,
        summary: descriptor.summary,
        pages: stems
            .filter((stem) => stem.startsWith(`${name}-`) && !names.has(stem))
            .map((stem) => ({ stem, title: titleOf(path.join(pagesRoot, `${stem}.md`), stem) }))
    }));
};

/** The entries of one group, alphabetical. */
const inGroup = (
    entries: readonly CatalogueEntry[],
    group: ModuleDescriptor['group']
): CatalogueEntry[] =>
    entries
        .filter((entry) => entry.group === group)
        .toSorted((a, b) => a.name.localeCompare(b.name));

/** One module as a bullet: link, summary, and its deeper pages. */
const bullet = (entry: CatalogueEntry): string => {
    const deeper =
        entry.pages.length > 0
            ? ` Deeper: ${entry.pages.map((page) => `[${page.title}](./${page.stem}.md)`).join(', ')}.`
            : '';
    return `- [\`${entry.name}\`](./${entry.name}.md) — ${entry.summary}${deeper}`;
};

/**
 * The Markdown for the "Every module" block of `docs/modules/index.md`: one section per group,
 * one bullet per module.
 * @param entries - the whole catalogue
 * @returns Markdown, no surrounding markers
 */
export const renderModuleList = (entries: readonly CatalogueEntry[]): string =>
    GROUPS.flatMap(({ group, heading, blurb }) => {
        const members = inGroup(entries, group);
        if (members.length === 0) return [];
        return [`### ${heading}`, '', blurb, '', ...members.map((entry) => bullet(entry)), ''];
    })
        .join('\n')
        .trimEnd();

/** One item of a VitePress sidebar group. */
export interface SidebarItem {
    text: string;
    link: string;
    items?: SidebarItem[];
}

/** One VitePress sidebar section. */
export interface SidebarSection {
    text: string;
    collapsed?: boolean;
    items: SidebarItem[];
}

/**
 * The `/modules/` sidebar: the overview, then one section per group with a module and its deeper
 * pages per item.
 * @param entries - the whole catalogue
 */
export const moduleSidebar = (entries: readonly CatalogueEntry[]): SidebarSection[] => [
    { text: 'Overview', items: [{ text: 'The whole map', link: '/modules/' }] },
    ...GROUPS.flatMap(({ group, heading }) => {
        const members = inGroup(entries, group);
        if (members.length === 0) return [];
        return [
            {
                text: heading,
                collapsed: false,
                items: members.map((entry) => ({
                    text: entry.name,
                    link: `/modules/${entry.name}`,
                    ...(entry.pages.length > 0
                        ? {
                              items: entry.pages.map((page) => ({
                                  text: page.title,
                                  link: `/modules/${page.stem}`
                              }))
                          }
                        : {})
                }))
            }
        ];
    })
];
