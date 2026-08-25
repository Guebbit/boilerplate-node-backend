/**
 * A module's manifest, its folder and the registry all describe the same domain — and agree.
 *
 * `src/modules.ts` is the enumeration: one folder under `src/modules/`, one import, one entry in
 * `enabledModules`. Three facts hold that together, and the type system checks none of them,
 * because each is an agreement between a value and the filesystem:
 *
 *   1. **`name` matches the folder.** The manifest's docblock already requires it ("Must match the
 *      folder name under `src/modules/`") and nothing enforced it. The name is what every other
 *      guard keys on — `context-map.test.ts` resolves `dependsOn` edges by it, the registry logs
 *      by it, `docs/modules/<name>.md` is named for it — so a manifest naming itself something
 *      the folder is not makes each of those quietly describe a module that does not exist.
 *   2. **Every folder is enabled, or is deliberately not.** A domain added and never listed
 *      compiles, lints, tests clean and serves nothing: its routes are never mounted, its
 *      subscribers never attached, its seeds never run. There is no error anywhere — the folder is
 *      simply inert, and looks exactly like a working one.
 *   3. **Routed and headless are what the folder looks like.** A `controllers/` directory is HTTP
 *      code; a module holding one and declaring no `basePath` has written handlers nothing mounts.
 *      The union in `kernel/registry.ts` makes `basePath` and `routes` inseparable from each
 *      other, which is as far as a type can go — it cannot see the directory.
 *
 * ── Overlap, and what this file leaves alone ──────────────────────────────────────────────────
 * `controller-naming.test.ts` holds controller FILENAMES to the verb they serve, and
 * `service-namespaces.test.ts` holds each service to one complete namespace. Both are about a
 * module's insides. This file is only about its outline: the three places a module announces
 * itself. Nothing here re-checks either.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { enabledModules } from '../../src/modules';

const MODULES_ROOT = path.join(__dirname, '../../src/modules');

/**
 * Folders that exist and are deliberately not registered.
 *
 * Empty, and meant to stay that way: an unregistered module is inert, so the honest states are
 * "listed" or "deleted". An entry here needs an argument in review — it is a domain someone is
 * paying to keep compiling and choosing not to serve.
 */
const DELIBERATELY_DISABLED: string[] = [];

/** Every directory under `src/modules/`, which is the only place a module may live. */
const moduleFolders = (): string[] =>
    readdirSync(MODULES_ROOT).filter((entry) =>
        statSync(path.join(MODULES_ROOT, entry)).isDirectory()
    );

const hasControllers = (module: string): boolean =>
    existsSync(path.join(MODULES_ROOT, module, 'controllers'));

describe('the shape every module declares', () => {
    it('finds the modules it means to check', () => {
        // A canary: a moved root or a renamed registry export would otherwise leave every case
        // below sweeping an empty list, which passes and proves nothing.
        expect(moduleFolders().length).toBeGreaterThanOrEqual(10);
        expect(enabledModules.length).toBeGreaterThanOrEqual(10);
    });

    it('names each module after the folder it lives in', () => {
        /*
         * Read from the registry rather than from disk: what matters is the name the RUNNING app
         * uses, and that is the manifest's, whatever the folder is called.
         */
        const misnamed = enabledModules
            .filter(({ name }) => !moduleFolders().includes(name))
            .map(
                ({ name }) =>
                    `${name}: registered under a name no folder matches — the manifest's name must be its directory`
            );

        expect(misnamed).toEqual([]);
    });

    it('enables every module that exists', () => {
        /*
         * The inert-domain check. Nothing fails when a folder goes unlisted, which is what makes
         * it worth a test: the symptom is a 404 on routes someone is certain they wrote.
         */
        const registered = new Set(enabledModules.map(({ name }) => name));
        const unregistered = moduleFolders()
            .filter((folder) => !registered.has(folder))
            .filter((folder) => !DELIBERATELY_DISABLED.includes(folder))
            .map((folder) => `${folder}: a module folder that src/modules.ts never lists`);

        expect(unregistered).toEqual([]);
    });

    it('keeps the disabled list free of modules that no longer exist', () => {
        // A stale exemption silently excuses a folder someone may re-add under the same name.
        const stale = DELIBERATELY_DISABLED.filter((folder) => !moduleFolders().includes(folder));

        expect(stale).toEqual([]);
    });

    it('mounts every module that has controllers', () => {
        /*
         * Handlers nothing routes. The type union already refuses `routes` without `basePath`; it
         * cannot refuse a `controllers/` folder with neither.
         */
        const unmounted = enabledModules
            .filter(({ name }) => hasControllers(name))
            .filter(({ basePath }) => !basePath)
            .map(
                ({ name }) =>
                    `${name}: has controllers/ but declares no basePath — nothing mounts them`
            );

        expect(unmounted).toEqual([]);
    });

    it('gives every mounted module the controllers to justify it', () => {
        /*
         * The reverse, and the cheaper mistake: a `basePath` reserved for routes that were never
         * written claims a URL prefix the API does not answer on.
         */
        const empty = enabledModules
            .filter(({ basePath }) => Boolean(basePath))
            .filter(({ name }) => !hasControllers(name))
            .map(
                ({ name, basePath }) => `${name}: mounts ${String(basePath)} with no controllers/`
            );

        expect(empty).toEqual([]);
    });

    it('gives every module unit specs of its own', () => {
        /*
         * The canary for the unit-layer wall in `eslint.config.ts`, which forbids booting the app
         * from a module's co-located `tests/unit` directory. A rule is only worth what it covers,
         * and a module without that directory is a module the rule says nothing about — so the
         * sweep must not be able to pass by finding nothing.
         */
        const untested = enabledModules
            .filter(({ name }) => !existsSync(path.join(MODULES_ROOT, name, 'tests/unit')))
            .map(({ name }) => `${name}: no tests/unit — the unit-layer rules cover nothing here`);

        expect(untested).toEqual([]);
    });

    it('never re-exports demo data through a barrel', () => {
        /*
         * The half of the two-door rule that `eslint-plugin-boundaries` cannot state.
         *
         * A module publishes `index.ts` for its runtime API and `demo.ts` for its fixtures, and
         * the plugin holds every module to taking the second door only from a seeder. It weighs
         * edges BETWEEN elements, though, and a barrel re-exporting its own `demo.ts` is an edge
         * inside one — invisible to it, and the one move that would undo the split from the other
         * side: every caller of the runtime API would get the fixtures too.
         *
         * `products/index.ts` published `SEED_PRODUCT_IDS` and `productFixtures` beside
         * `productService` before the doors were separated, which is the state this prevents
         * returning to.
         */
        const leaky = enabledModules
            .filter(({ name }) => existsSync(path.join(MODULES_ROOT, name, 'index.ts')))
            .filter(({ name }) =>
                /from '\.\/demo'|require\('\.\/demo'\)/.test(
                    readFileSync(path.join(MODULES_ROOT, name, 'index.ts'), 'utf8')
                )
            )
            .map(({ name }) => `${name}: index.ts re-exports its own demo.ts`);

        expect(leaky).toEqual([]);
    });

    it('gives every module a page, and every page a module', () => {
        /*
         * `docs/modules/` is hand-written now, so nothing regenerates a page into existence and
         * nothing deletes one that outlived its domain. Both directions are worth a check: a module
         * with no page is a domain nobody documented, and a page with no module documents something
         * the application does not serve — which is worse, because it reads as current.
         *
         * Sub-pages are the exception and are listed rather than discovered: a flow deep enough to
         * earn its own page is a deliberate act, and the list is short enough to state.
         */
        const SUB_PAGES = [
            'cart-checkout',
            'account-sessions',
            'inventory-reservations',
            'payments-provider-port'
        ];

        const docsDir = path.join(__dirname, '../../docs/modules');
        const pages = readdirSync(docsDir)
            .filter((entry) => entry.endsWith('.md') && entry !== 'index.md')
            .map((entry) => entry.replace(/\.md$/, ''));
        const names = new Set(enabledModules.map(({ name }) => name));

        expect(pages.length).toBeGreaterThan(0);

        const undocumented = [...names]
            .filter((name) => !pages.includes(name))
            .map((name) => `${name}: no docs/modules/${name}.md`);
        const orphaned = pages
            .filter((page) => !names.has(page) && !SUB_PAGES.includes(page))
            .map((page) => `docs/modules/${page}.md documents nothing enabled`);
        const missingSubPages = SUB_PAGES.filter((slug) => !pages.includes(slug)).map(
            (slug) => `docs/modules/${slug}.md is listed as a sub-page and does not exist`
        );

        expect([...undocumented, ...orphaned, ...missingSubPages]).toEqual([]);
    });

    it('starts every base path with a single slash and no trailing one', () => {
        /*
         * `app.ts` concatenates these. A missing leading slash mounts at a path nobody can guess,
         * and a trailing one produces `//` in every URL below it — both are routing bugs that
         * present as 404s rather than as anything naming the manifest.
         */
        const malformed = enabledModules
            .filter(({ basePath }) => Boolean(basePath))
            .filter(({ basePath }) => !/^(?:\/[\da-z][\da-z-]*)+$/.test(basePath!))
            .map(({ name, basePath }) => `${name}: ${String(basePath)}`);

        expect(malformed).toEqual([]);
    });
});
