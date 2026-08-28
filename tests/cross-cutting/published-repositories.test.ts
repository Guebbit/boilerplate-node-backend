/**
 * A published repository is a write on someone else's collection, and has to be argued for.
 *
 * `tests/cross-cutting/published-language.test.ts` holds every barrel line to one question — does
 * a sibling import this? — and that question is the right one for a type. `OrderDocument` leaving
 * the barrel promises a shape will not move; the promise is either wanted by somebody or it is
 * not, and an importer is the whole of the evidence.
 *
 * A repository is not that kind of export, and the asymmetry is the reason this file exists.
 * `productRepository` is not a promise about a shape, it is a handle on a collection: whoever
 * holds it can create, update and delete rows of a module it does not own, with that module's
 * service — and every rule, event, counter and audit line the service carries — bypassed. The
 * export is not a description of a coupling, it IS the coupling, and it costs one line to make.
 *
 * `modules/inventory/index.ts` states the case as well as it can be stated, and states it by
 * refusing:
 *
 *   > The repositories, both models and every counter primitive are deliberately absent. This
 *   > module exists so that nothing outside it can move a stock number, and publishing a
 *   > repository would hand back the ability it was created to take away. A sibling asks for a
 *   > transition by name and gets a boolean; what it costs in counters is not their business.
 *
 * Every module that DOES publish one is answering that argument, and this file is where the answer
 * has to be written down. Two things are asked of it:
 *
 *   1. **A production caller, not a spec.** `published-language` counts a sibling's spec as a
 *      consumer on purpose — a type the tests name is a type the tests depend on. Applied to a
 *      repository that rule has a hole the size of the export: `cart` published `cartRepository`
 *      for exactly one reader, a `products` integration spec reading a cart back after a deletion,
 *      and `published-language` passed on it forever because a consumer is a consumer. A
 *      production write-surface that exists so a test can read is the failure this test is for,
 *      and it is one `published-language` structurally cannot see. The spec asks
 *      `cartService.cartGet` now and the barrel line is gone.
 *   2. **A reason, in the barrel's own words.** The same shape `credential-fields.test.ts` and
 *      `context-map.test.ts` use for their exemptions: the allowlist below is not a list of things
 *      that are fine, it is a list of things somebody had to write a sentence about. The reasons
 *      here are the arguments the barrels already make — reproduced rather than invented, so that
 *      a barrel and this file disagreeing is itself the finding.
 *
 * Nothing is hardcoded but the reasons. The modules, their barrels and their consumers are all
 * read off disk, for the reason every sweep here gives: a literal list is a copy of `src/modules.ts`
 * that goes stale on the commit that adds a domain rather than on the commit that breaks this file.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const MODULES_ROOT = path.join(__dirname, '../../src/modules');

/** The repo's runtime code, which is the only place a runtime consumer can be. */
const SOURCE_ROOT = path.join(MODULES_ROOT, '..');

/**
 * A published repository, as `<module>.<binding>`, with the reason its module publishes one.
 *
 * Qualified by module rather than keyed on the binding alone: two modules are free to publish a
 * repository under the same alias, and an allowlist that could not tell them apart would excuse
 * the second one for the first one's reasons.
 *
 * An entry is a deliberate edit with a reviewer attached. Adding a repository to a barrel and not
 * to this list fails the sweep below; adding it to both means writing down what a sibling is being
 * trusted to do with a collection it does not own.
 */
const PUBLISHED_FOR: Record<string, string> = {
    'orders.orderRepository':
        'A checkout writes the order row itself and rolls it back if clearing the cart fails, so ' +
        'that transaction belongs to cart rather than being an order cart asks for; the service ' +
        'layer would only hand back a response envelope for it to unwrap.',
    'products.productRepository':
        'Six production callers read the catalogue to price a cart line, reserve stock, snapshot ' +
        'a product onto an order or answer a wishlist, and a read of a product by id is not an ' +
        'operation the product service could own without becoming a pass-through to this.',
    'users.userRepository':
        'account is a second service over the same User record — signup, login and password ' +
        "reset all read and write it — which is the repo's one declared shared-kernel edge; the " +
        'width of this barrel and the label on that edge are the same fact written twice.'
};

/** Every `.ts` file below `directory`, recursively. */
const listFiles = (directory: string): string[] =>
    readdirSync(directory).flatMap((entry) => {
        const entryPath = path.join(directory, entry);
        if (statSync(entryPath).isDirectory()) return listFiles(entryPath);
        return entryPath.endsWith('.ts') ? [entryPath] : [];
    });

/** The names in one `{ … }` clause, with `type` prefixes dropped. */
const clauseNames = (clause: string): string[] =>
    clause
        .split(',')
        .map((name) => name.trim().replace(/^type\s+/, ''))
        .filter(Boolean);

const moduleNames = (): string[] =>
    readdirSync(MODULES_ROOT).filter((entry) =>
        statSync(path.join(MODULES_ROOT, entry)).isDirectory()
    );

/**
 * Whether a file is a spec, by the directory it sits in rather than by its name.
 *
 * `tests/factory.ts` and `tests/setup.ts` are not `*.test.ts` and are just as much test-only code;
 * a repository reachable only from a factory is still a repository no production caller wants.
 */
const isSpec = (file: string): boolean => file.includes(`${path.sep}tests${path.sep}`);

/**
 * The repositories a module's barrel publishes, as the names a sibling would write.
 *
 * Two signals, because either alone misses a real case: a binding whose published name ends in
 * `Repository`, and a binding re-exported from the module's `repository` file under any name. A
 * value `export { cartRepository as carts }` is still a handle on the cart collection.
 */
const publishedRepositoriesOf = (name: string): string[] => {
    const barrel = path.join(MODULES_ROOT, name, 'index.ts');
    if (!existsSync(barrel)) return [];

    const published = new Set<string>();
    const pattern = /export\s+(type\s+)?{([^}]*)}(?:\s+from\s+["']([^"']+)["'])?/g;

    for (const [, asType, clause, source] of readFileSync(barrel, 'utf8').matchAll(pattern)) {
        // A `type` re-export of a repository is a shape, not a handle: `published-language` owns it.
        if (asType) continue;
        const fromRepositoryFile =
            path.basename(source ?? '').replace(/\.ts$/, '') === 'repository';

        for (const binding of clauseNames(clause)) {
            // `export { a as b }` publishes `b` — the promise is the name the caller writes.
            const exported = binding
                .split(/\s+as\s+/)
                .pop()!
                .trim();
            if (fromRepositoryFile || /repository$/i.test(exported)) published.add(exported);
        }
    }
    return [...published];
};

/** Every published repository in the repo, as `{ module, binding }`. */
const publishedRepositories = (): { module: string; binding: string }[] =>
    moduleNames().flatMap((module) =>
        publishedRepositoriesOf(module).map((binding) => ({ module, binding }))
    );

/**
 * The files outside `module` that import `binding` from its barrel.
 *
 * Read from the source rather than resolved, for the reason `eslint-plugin-boundaries` gives and
 * `context-map.test.ts` repeats: the question is what the code SAYS, and answering it by booting
 * the app would make this an integration test.
 */
const consumersOf = (module: string, binding: string): string[] => {
    const pattern = new RegExp(
        String.raw`import\s+(?:type\s+)?{([^}]*)}\s+from\s+["']@modules/${module}["']`,
        'g'
    );

    return listFiles(SOURCE_ROOT).filter((file) => {
        // Own files, specs included: a module publishing to itself is not a consumer.
        if (path.relative(MODULES_ROOT, file).split(path.sep)[0] === module) return false;

        for (const clause of readFileSync(file, 'utf8').matchAll(pattern))
            for (const name of clauseNames(clause[1]))
                // `import { a as b }` consumes `a` — the promise is the name the barrel wrote.
                if (name.split(/\s+as\s+/)[0].trim() === binding) return true;
        return false;
    });
};

describe('a published repository has a production caller and a stated reason', () => {
    it('finds the published repositories it means to check', () => {
        // A canary: an empty sweep must mean "no barrel hands out a repository", which would be a
        // fine state of the world and a useless test. Against the disk, with a floor of one.
        expect(moduleNames().length).toBeGreaterThan(0);
        expect(publishedRepositories().length).toBeGreaterThanOrEqual(1);
    });

    it('publishes no repository that only a spec reaches', () => {
        /*
         * The assertion `published-language` cannot make. It counts a sibling's spec as a consumer
         * deliberately, so a repository published for one test reads to it as a repository somebody
         * needs — which is how `cartRepository` survived: zero production callers, one integration
         * spec in `products`, and a green suite. A spec that needs a sibling's internals has the
         * eslint override for spec files; production code is what a barrel line is for.
         */
        const testOnly = publishedRepositories()
            .map((entry) => ({
                ...entry,
                runtime: consumersOf(entry.module, entry.binding).filter((file) => !isSpec(file))
            }))
            .filter(({ runtime }) => runtime.length === 0)
            .map(
                ({ module, binding }) =>
                    `${module} publishes ${binding}, which no sibling's production code imports`
            );

        expect(testOnly).toEqual([]);
    });

    it('states, for every one of them, what a sibling is trusted to do with it', () => {
        const unexplained = publishedRepositories()
            .filter(({ module, binding }) => !(`${module}.${binding}` in PUBLISHED_FOR))
            .map(
                ({ module, binding }) =>
                    `${module} publishes ${binding}, which PUBLISHED_FOR does not account for`
            );

        expect(unexplained).toEqual([]);
    });

    it('gives every one of those reasons in a sentence', () => {
        /*
         * The threshold is not a style rule. `context-map.test.ts` makes the same check on its
         * edges for the same reason: a required field is filled in to satisfy whatever requires
         * it, and "needed" or "TODO" passes every check that only looks for presence.
         */
        const PLACEHOLDER = /^(todo|tbd|fixme|xxx|n\/?a|because|reason|see above|\W*)$/i;

        const hollow = Object.entries(PUBLISHED_FOR)
            .filter(([, reason]) => {
                const words = reason.trim().split(/\s+/).filter(Boolean);
                return (
                    reason.trim().length < 60 ||
                    words.length < 10 ||
                    PLACEHOLDER.test(reason.trim())
                );
            })
            .map(([name, reason]) => `${name}: ${JSON.stringify(reason)}`);

        expect(hollow).toEqual([]);
    });

    it('keeps no reason for a repository that has stopped being published', () => {
        // The standard guard against an exemption outliving its subject: a stale entry excuses a
        // barrel line somebody may add back tomorrow, for an argument nobody is making any more.
        const published = new Set(
            publishedRepositories().map(({ module, binding }) => `${module}.${binding}`)
        );
        const stale = Object.keys(PUBLISHED_FOR)
            .filter((name) => !published.has(name))
            .map((name) => `PUBLISHED_FOR names ${name}, which no barrel publishes`);

        expect(stale).toEqual([]);
    });
});
