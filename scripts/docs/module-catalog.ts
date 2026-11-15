/**
 * @module
 * The module catalogue: every module's place in the docs, derived from what it says about itself.
 *
 * Feeds two readers that would otherwise be hand-kept lists of module names — the "Every module" section
 * of `docs/modules/start.md` and the `/modules/` sidebar in `docs/.vitepress/config.mts`. Both
 * group by `module.yaml#group` (foundation first, then the demo shop), so a new module appears in
 * the right place by declaring its group and a summary, and nothing else.
 *
 * Pure apart from {@link readCatalog}, the one disk read, so a test can drive the rest with a
 * virtual module list.
 *
 * @see docs/modules/start.md
 * @see docs/understand/strategic-ddd.md#4a-foundation-and-shop
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readAllModuleDescriptors, type ModuleDescriptor } from './module-descriptor';

/** A deeper page of one module's own, e.g. `cart-checkout.md` under `cart`. */
export interface CatalogPage {
    /** The page's file stem, which is also its URL under `/modules/`. */
    stem: string;
    /** What the sidebar calls it: the page's own first heading. */
    title: string;
}

/** One module, as the docs list it. */
export interface CatalogEntry {
    name: string;
    group: ModuleDescriptor['group'];
    subdomain: ModuleDescriptor['subdomain'];
    summary: string;
    /** Deeper pages, named `<module>-<topic>.md`, in file order. */
    pages: CatalogPage[];
}

/** The groups in the order the docs present them, with what each heading says. */
const GROUPS: readonly {
    group: ModuleDescriptor['group'];
    heading: string;
    blurb: string;
}[] = [
    {
        group: 'foundation',
        heading: 'Foundation',
        blurb: 'Ships with every deployment, whatever the project becomes.'
    },
    {
        group: 'shop',
        heading: 'Demo shop',
        blurb: 'The pet-supply e-commerce domain this boilerplate demos itself with. Nothing in the foundation may depend on it, and `npm run demo:remove` deletes it.'
    },
    {
        group: 'example',
        heading: 'Example',
        blurb: 'The module to copy when you start a new domain. Nothing depends on it, and it is deleted once you have your own.'
    }
];

/**
 * The section of the understand page that explains the `example` module, which has no page of its own.
 * Relative to `docs/`.
 */
const TEMPLATE_SECTION = 'understand/modules.md#the-module-template';

/**
 * The docs link of one module, relative to `docs/modules/`: its own page, or for the `example`
 * group the section that explains it.
 * @param entry - the module
 */
const pageLinkOf = (entry: CatalogEntry): string =>
    entry.group === 'example' ? `../${TEMPLATE_SECTION}` : `./${entry.name}.md`;

/** First `# ` heading of a Markdown file, falling back to the file stem. */
const titleOf = (file: string, fallback: string): string =>
    /^# (.+)$/m.exec(readFileSync(file, 'utf8'))?.[1] ?? fallback;

/**
 * The module a page belongs to: the LONGEST module name the stem starts with, so
 * `shop-tasks-notices` is `shop-tasks`'s and not `shop`'s.
 * @param stem - a page's file stem
 * @param names - every module name
 * @returns the owning module, or `undefined` for a module's own page or an unrelated one
 */
export const pageOwner = (stem: string, names: ReadonlySet<string>): string | undefined => {
    if (names.has(stem)) return undefined;
    return [...names]
        .filter((name) => stem.startsWith(`${name}-`))
        .toSorted((a, b) => b.length - a.length)[0];
};

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
export const readCatalog = (modulesRoot: string, pagesRoot: string): CatalogEntry[] => {
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
            .filter((stem) => pageOwner(stem, names) === name)
            .map((stem) => ({ stem, title: titleOf(path.join(pagesRoot, `${stem}.md`), stem) }))
    }));
};

/** The entries of one group, alphabetical. */
const inGroup = (
    entries: readonly CatalogEntry[],
    group: ModuleDescriptor['group']
): CatalogEntry[] =>
    entries
        .filter((entry) => entry.group === group)
        .toSorted((a, b) => a.name.localeCompare(b.name));

/** One module as a bullet: link, summary, and its deeper pages. */
const bullet = (entry: CatalogEntry): string => {
    const deeper =
        entry.pages.length > 0
            ? ` Deeper: ${entry.pages.map((page) => `[${page.title}](./${page.stem}.md)`).join(', ')}.`
            : '';
    return `- [\`${entry.name}\`](${pageLinkOf(entry)}) — ${entry.summary}${deeper}`;
};

/**
 * The Markdown for the "Every module" block of `docs/modules/start.md`: one section per group,
 * one bullet per module.
 * @param entries - the whole catalogue
 * @returns Markdown, no surrounding markers
 */
export const renderModuleList = (entries: readonly CatalogEntry[]): string =>
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
export const moduleSidebar = (entries: readonly CatalogEntry[]): SidebarSection[] => [
    { text: 'Overview', items: [{ text: 'The whole map', link: '/modules/start' }] },
    ...GROUPS.flatMap(({ group, heading }) => {
        const members = inGroup(entries, group);
        if (members.length === 0) return [];
        return [
            {
                text: heading,
                collapsed: false,
                items: members.map((entry) => ({
                    text: entry.name,
                    link:
                        entry.group === 'example'
                            ? `/${TEMPLATE_SECTION.replace('.md', '')}`
                            : `/modules/${entry.name}`,
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
