/**
 * The file glossary, asserted against the repository it describes.
 *
 * `docs/reference/` claims to account for every tracked file in this repo. That claim is true for
 * about a week unless something checks it: a glossary goes wrong not when someone edits it, but
 * when someone adds a file and never thinks about it. So the coverage rules live HERE, as code,
 * and the pages hold only the prose — one list, not two lists that disagree.
 *
 * Four things are held:
 *
 *   1. **No orphans.** Every tracked file is named on a page, matched by a declared pattern, or
 *      matched by a declared exclusion. This is the assertion the whole section exists for.
 *   2. **No ghosts.** Every path the glossary names exists. Catches a rename the docs did not
 *      follow, and catches a path written from memory.
 *   3. **No dead rules.** Every pattern and exclusion matches at least one file, and appears in
 *      backticks on the page it claims — a rule nobody documented is a hidden exemption, and a
 *      rule that matches nothing is a shape the code deleted and the docs kept.
 *   4. **Links resolve.** Every relative link out of `docs/reference/` reaches a file that exists,
 *      and every anchor reaches a heading that exists. The glossary's job is to land a reader on
 *      the paragraph, so a link to a page that moved fails them exactly where they were promised
 *      an answer.
 *
 * And one more, specific to the module inventory: the table on `src-modules.md` says which
 * optional shapes each module carries, and that is the one claim a pattern CANNOT protect. A
 * module gaining a metrics file is already covered by the per-module metrics pattern, so nothing
 * above would notice the table quietly becoming wrong.
 *
 * (Globs are spelled in words in these block comments on purpose: written out, a wildcard followed
 * by a slash closes the comment. `jest.config.js` carries the same note.)
 *
 * Nothing else in the repo checks that a documented path exists, so the ghost assertion below is
 * the only thing standing between `docs/reference/` and a rename it did not follow.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.join(__dirname, '../..');
const REFERENCE_DIR = path.join(REPO_ROOT, 'docs/reference');

/** A coverage rule: one glob, the page that explains it, and why it is a shape and not a list. */
interface CoverageRule {
    glob: string;
    page: string;
    why: string;
}

/**
 * Shapes that repeat. One row in the docs explains the ROLE; this glob says which files hold it.
 *
 * The bar for an entry: the files are interchangeable to a reader. The per-module repository
 * qualifies, because knowing what one repository is tells you what all thirteen are. A file whose
 * explanation would differ from its neighbours' does not qualify, however many neighbours it has.
 */
const PATTERNS: CoverageRule[] = [
    // ── The module shapes. The whole reason the glossary is ten pages and not eight hundred rows.
    { glob: 'src/modules/*/module.ts', page: 'src-modules.md', why: 'the manifest' },
    { glob: 'src/modules/*/routes.ts', page: 'src-modules.md', why: 'the URL surface' },
    { glob: 'src/modules/*/controllers/*.ts', page: 'src-modules.md', why: 'one per operation' },
    { glob: 'src/modules/*/service.ts', page: 'src-modules.md', why: 'the domain decision' },
    { glob: 'src/modules/*/services/*.ts', page: 'src-modules.md', why: 'the same tier, split' },
    { glob: 'src/modules/*/repository.ts', page: 'src-modules.md', why: 'every query' },
    { glob: 'src/modules/*/model.ts', page: 'src-modules.md', why: 'the schema' },
    { glob: 'src/modules/*/openapi.yaml', page: 'src-modules.md', why: 'the REST fragment' },
    { glob: 'src/modules/*/asyncapi.yaml', page: 'src-modules.md', why: 'the async fragment' },
    { glob: 'src/modules/*/locales/*.json', page: 'src-modules.md', why: 'module-owned copy' },
    { glob: 'src/modules/*/index.ts', page: 'src-modules.md', why: 'the published barrel' },
    { glob: 'src/modules/*/domain/*.ts', page: 'src-modules.md', why: 'pure rules' },
    { glob: 'src/modules/*/events.ts', page: 'src-modules.md', why: 'published and consumed' },
    { glob: 'src/modules/*/audit.ts', page: 'src-modules.md', why: 'the audited operations' },
    { glob: 'src/modules/*/metrics.ts', page: 'src-modules.md', why: 'domain counters' },
    { glob: 'src/modules/*/analytics.ts', page: 'src-modules.md', why: 'product events' },
    { glob: 'src/modules/*/emails.ts', page: 'src-modules.md', why: 'which templates' },
    { glob: 'src/modules/*/probes.ts', page: 'src-modules.md', why: 'readiness contribution' },
    { glob: 'src/modules/*/demo.ts', page: 'src-modules.md', why: 'seed fixtures' },
    { glob: 'src/modules/*/factory.ts', page: 'src-modules.md', why: 'fixture builders' },
    { glob: 'src/modules/*/session/*.ts', page: 'src-modules.md', why: 'account only' },
    { glob: 'src/modules/*/providers/*.ts', page: 'src-modules.md', why: 'payments only' },
    { glob: 'src/modules/*/config.ts', page: 'src-modules.md', why: 'inventory only' },

    // ── Co-located suites. Catalogued with the rest of the tests, not with the module.
    { glob: 'src/modules/*/tests/unit/*.test.ts', page: 'tests.md', why: 'one per subject' },
    { glob: 'src/modules/*/tests/contract/*.test.ts', page: 'tests.md', why: 'one per module' },
    { glob: 'src/modules/*/tests/factory.ts', page: 'tests.md', why: 'test-only fixtures' },

    // ── The rest.
    { glob: 'src/locales/*.json', page: 'src-app.md', why: 'one per language' },
    { glob: 'db/migrations/*.js', page: 'data.md', why: 'one per schema change' },
    { glob: 'shared/views/templates-emails/*.ejs', page: 'ops.md', why: 'one per email' },
    { glob: 'shared/views/templates-files/*.ejs', page: 'ops.md', why: 'one per document' },
    { glob: 'shared/views/layouts/*.ejs', page: 'ops.md', why: 'the shared wrappers' },
    { glob: 'public/css/*.css', page: 'ops.md', why: 'one per screen' },
    { glob: 'public/favicon/*', page: 'ops.md', why: 'one icon set' },
    { glob: 'public/images/seed/*.jpg', page: 'ops.md', why: 'demo fixtures, hashed names' },

    /*
     * The docs site describing itself. Deliberately three rows rather than one per page: the
     * sidebar in the VitePress config IS the list of pages, and a second copy of it here would be
     * a second copy to keep in sync — for no reader who could not have used the sidebar.
     */
    { glob: 'docs/*.md', page: 'ops.md', why: 'the two pages outside a section' },
    { glob: 'docs/*/*.md', page: 'ops.md', why: 'every section page; the sidebar is the index' },
    { glob: 'docs/.vitepress/**', page: 'ops.md', why: 'the site config and theme' }
];

/**
 * Files accounted for by NOT being described, with the reason stated once.
 *
 * An exclusion is a decision on the record. The difference between "excluded" and "forgotten" is
 * invisible to a reader unless someone writes it down, and a reader who cannot tell the two apart
 * has to go and check — which is the work this section exists to remove.
 */
const EXCLUSIONS: CoverageRule[] = [
    {
        glob: 'api/models/*.ts',
        page: 'contracts.md',
        why: 'Orval writes the directory wholesale from the contract; a row each would restate the spec'
    }
];

/** Every file git tracks, as repo-relative POSIX paths. */
const trackedFiles = (): string[] =>
    execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 1 << 24 })
        .split('\n')
        .filter(Boolean);

/** The glossary pages, as `<name>.md` → contents. */
const referencePages = (): Map<string, string> =>
    new Map(
        readdirSync(REFERENCE_DIR)
            .filter((entry) => entry.endsWith('.md'))
            .map((entry) => [entry, readFileSync(path.join(REFERENCE_DIR, entry), 'utf8')])
    );

/**
 * What a backtick span has to look like before it is read as a path at all.
 *
 * The charset does two useful things for free. A span carrying a glob (a wildcard) or a
 * `<placeholder>` fails it, so a PATTERN written in the docs is never mistaken for a missing
 * file. And a span with a space, a bracket or a colon is prose, which is most of what the prose
 * contains.
 */
const PATH_SHAPED = /^[\w./@-]+$/;

/**
 * Whether a span names a file IN THIS REPOSITORY, decided from the repository rather than from a
 * list somebody has to maintain: it starts with a directory git tracks, or it IS a root file git
 * tracks.
 *
 * The alternative — "anything with a dot in it" — reads half the prose as paths. These pages talk
 * about `module.ts` and `demo.ts` constantly as SHAPES, and about `express.static` and
 * `services/index.ts` as things relative to somewhere else. None of those are repo paths and
 * every one of them would report as a dead file.
 *
 * What it gives up, stated plainly: a mistyped ROOT file is not in the tracked set and so is not
 * recognised as a path at all, rather than being caught as a dead one. A mistyped path anywhere
 * below a directory still fails, which is the overwhelming majority.
 */
const namesRepoFile = (span: string, tracked: string[]): boolean => {
    if (!PATH_SHAPED.test(span)) return false;
    // A trailing slash names a DIRECTORY, which these pages do constantly — "`src/modules/`
    // collapses to two dozen entries". There is no file to resolve and nothing to check.
    if (span.endsWith('/')) return false;
    if (!span.includes('/')) return tracked.includes(span);
    const topLevel = new Set(tracked.map((file) => file.split('/')[0]));
    return topLevel.has(span.split('/')[0]);
};

/** Every path named across the glossary, mapped to the pages that name it. */
const namedPaths = (pages: Map<string, string>, tracked: string[]): Map<string, string[]> => {
    const named = new Map<string, string[]>();
    for (const [page, text] of pages)
        for (const [, span] of text.matchAll(/`([^\n`]+)`/g)) {
            if (!namesRepoFile(span, tracked)) continue;
            named.set(span, [...(named.get(span) ?? []), page]);
        }
    return named;
};

const matchesAny = (file: string, rules: CoverageRule[]): boolean =>
    rules.some((rule) => path.matchesGlob(file, rule.glob));

/** Which page a missing file most likely belongs on — the failure message's whole value. */
const suggestPage = (file: string): string => {
    const suggestions: [RegExp, string][] = [
        [/^src\/modules\//, 'src-modules.md (or tests.md, for a co-located suite)'],
        [/^src\/infrastructure\//, 'src-infrastructure.md'],
        [/^src\//, 'src-app.md'],
        [/^tests\/|^k6\//, 'tests.md'],
        [/^scripts\/|^eslint\/|^\.husky\//, 'scripts.md'],
        [/^db\//, 'data.md'],
        [/^api\/|^shared\/contracts\/|^spectral|^openapi|^asyncapi|^contract\./, 'contracts.md'],
        [/^\.docker|^\.github\/|^public\/|^docs\/|^docker-compose/, 'ops.md']
    ];
    return suggestions.find(([pattern]) => pattern.test(file))?.[1] ?? 'root.md';
};

describe('the file glossary accounts for every tracked file', () => {
    it('finds the repository and the pages it is meant to check', () => {
        // A canary. An empty sweep must mean "everything is covered", not "the sweep broke" — and
        // both halves failing silently is exactly how this file would stop enforcing anything.
        expect(trackedFiles().length).toBeGreaterThan(100);
        expect(referencePages().size).toBeGreaterThan(1);
        expect(namedPaths(referencePages(), trackedFiles()).size).toBeGreaterThan(50);
    });

    it('leaves no tracked file undocumented', () => {
        const tracked = trackedFiles();
        const named = namedPaths(referencePages(), tracked);
        const orphans = tracked
            .filter((file) => !named.has(file))
            .filter((file) => !matchesAny(file, PATTERNS))
            .filter((file) => !matchesAny(file, EXCLUSIONS))
            .map((file) => `${file} — name it, or add a rule (likely page: ${suggestPage(file)})`);

        expect(orphans).toEqual([]);
    });

    it('names no file that does not exist', () => {
        const tracked = trackedFiles();
        const onDisk = new Set(tracked);
        const ghosts = [...namedPaths(referencePages(), tracked)]
            // `existsSync` as well as the index, so a file written but not yet added reads as
            // present. A path that is neither is a rename the docs did not follow.
            .filter(([file]) => !onDisk.has(file) && !existsSync(path.join(REPO_ROOT, file)))
            .map(([file, pages]) => `${pages.join(', ')} names ${file}, which does not exist`);

        expect(ghosts).toEqual([]);
    });

    it('declares no rule that matches nothing', () => {
        const tracked = trackedFiles();
        const dead = [...PATTERNS, ...EXCLUSIONS]
            .filter((rule) => !tracked.some((file) => path.matchesGlob(file, rule.glob)))
            .map((rule) => `${rule.glob} matches no tracked file — the shape is gone`);

        expect(dead).toEqual([]);
    });

    it('documents every rule on the page it claims', () => {
        // The anti-drift device. A rule that exists only here is an exemption nobody can read, so
        // the glob has to appear verbatim, in backticks, on the page that owns it.
        const pages = referencePages();
        const undocumented = [...PATTERNS, ...EXCLUSIONS]
            .filter((rule) => !pages.get(rule.page)?.includes(`\`${rule.glob}\``))
            .map((rule) => `${rule.glob} is not shown on docs/reference/${rule.page}`);

        expect(undocumented).toEqual([]);
    });
});

/** An anchor as VitePress slugifies a heading: lower case, non-word runs become hyphens. */
const slugify = (heading: string): string =>
    heading
        .toLowerCase()
        .replaceAll('`', '')
        .replaceAll(/[^\wÀ-\u{10FFFF}]+/gu, '-')
        .replaceAll(/^-+|-+$/g, '');

const headingSlugs = (file: string): Set<string> =>
    new Set(
        [...readFileSync(file, 'utf8').matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map(([, heading]) =>
            slugify(heading)
        )
    );
describe('the file glossary links where it says it does', () => {
    it('resolves every page it links to, and every anchor inside one', () => {
        const broken: string[] = [];

        for (const [page, text] of referencePages())
            for (const [, target] of text.matchAll(/]\((\.[^\s)]+)\)/g)) {
                const [relative, anchor] = target.split('#');
                // A `./theory/` style link resolves to a directory's index, which VitePress serves
                // and the filesystem does not.
                const resolved = path.join(
                    REFERENCE_DIR,
                    relative.endsWith('/') ? `${relative}index.md` : relative
                );

                if (!existsSync(resolved)) {
                    broken.push(`${page} → ${target} (no such file)`);
                    continue;
                }
                if (anchor && !headingSlugs(resolved).has(anchor))
                    broken.push(`${page} → ${target} (no heading with that anchor)`);
            }

        expect(broken).toEqual([]);
    });
});

describe('the module inventory matches the modules on disk', () => {
    /**
     * The optional shapes, as the inventory table writes them.
     *
     * Only OPTIONAL roles are listed. A core role is in every module by definition, so writing it
     * in thirteen rows would say nothing — and the two modules that lack a core file are explained
     * in their own row's prose, where a reader asking "why has this one no model?" is looking.
     */
    const OPTIONAL_ROLES = new Map<string, string>([
        ['index', 'index.ts'],
        ['services', 'services'],
        ['domain', 'domain'],
        ['session', 'session'],
        ['providers', 'providers'],
        ['config', 'config.ts'],
        ['asyncapi', 'asyncapi.yaml'],
        ['demo', 'demo.ts'],
        ['factory', 'factory.ts'],
        ['audit', 'audit.ts'],
        ['metrics', 'metrics.ts'],
        ['analytics', 'analytics.ts'],
        ['events', 'events.ts'],
        ['emails', 'emails.ts'],
        ['probes', 'probes.ts']
    ]);

    /** Each module mapped to the roles its row claims. */
    const claimedRoles = (): Map<string, string[]> => {
        const page = readFileSync(path.join(REFERENCE_DIR, 'src-modules.md'), 'utf8');
        return new Map(
            [
                ...page.matchAll(
                    /^\|\s*`src\/modules\/([\w-]+)\/module\.ts`\s*\|[^|]*\|([^|]*)\|/gm
                )
            ].map(([, moduleName, extras]) => [
                moduleName,
                extras
                    .split('·')
                    .map((role) => role.trim())
                    .filter((role) => role.length > 0 && role !== '—')
            ])
        );
    };

    /** Each module mapped to the roles it actually has, in the vocabulary's own order. */
    const actualRoles = (moduleName: string): string[] =>
        [...OPTIONAL_ROLES]
            .filter(([, entry]) =>
                existsSync(path.join(REPO_ROOT, 'src/modules', moduleName, entry))
            )
            .map(([role]) => role);

    it('lists every module exactly once', () => {
        const onDisk = readdirSync(path.join(REPO_ROOT, 'src/modules')).toSorted();
        expect([...claimedRoles().keys()].toSorted()).toEqual(onDisk);
    });

    it('keeps the module inventory honest', () => {
        // The one claim in this section that no pattern can protect: a metrics file appearing in a
        // module it never had is already covered by the per-module metrics pattern, so without this
        // the table would go wrong in complete silence.
        const wrong = [...claimedRoles()]
            .map(([moduleName, claimed]) => ({
                moduleName,
                claimed: claimed.toSorted(),
                actual: actualRoles(moduleName).toSorted()
            }))
            .filter(({ claimed, actual }) => claimed.join(',') !== actual.join(','))
            .map(
                ({ moduleName, claimed, actual }) =>
                    `${moduleName}: table says [${claimed.join(' · ')}], disk says [${actual.join(' · ')}]`
            );

        expect(wrong).toEqual([]);
    });

    it('uses only role names the inventory defines', () => {
        const unknown = [...claimedRoles()].flatMap(([moduleName, claimed]) =>
            claimed
                .filter((role) => !OPTIONAL_ROLES.has(role))
                .map((role) => `${moduleName} claims "${role}", which is not a known role`)
        );

        expect(unknown).toEqual([]);
    });
});
