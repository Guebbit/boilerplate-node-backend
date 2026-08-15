/**
 * The barrel as published language.
 *
 * `index.ts` is the one surface a module offers its siblings, and ESLint already stops anyone
 * reaching past it. What ESLint cannot say is whether the surface is the right SIZE, and that is
 * the half that rots: an export costs nothing to add, nothing to keep, and quietly promises every
 * other module that a shape will not move. Thirty-six of them were promising that to nobody.
 *
 * The rule, decided here and applied to every module at once:
 *
 *   **A module publishes exactly what a sibling imports. No sibling, no barrel.**
 *
 * Which resolves the inconsistency `docs/theory/known-gaps.md` §1 recorded — `feedback` carrying a
 * full barrel nothing imported while `observability` and `locales`, in the same position, carried
 * none. `feedback` now has none either, and the lint boundary makes that structural: with no
 * `index.ts` a sibling cannot import the module at all, rather than being asked politely not to.
 *
 * Two things this rule deliberately does NOT count as a consumer:
 *
 *   - **the module's own specs.** A spec importing its own barrel is the module talking to itself,
 *     and it should reach `../model` like the rest of the module does. Counting it would let a
 *     module keep an export alive by testing it, which is the export equivalent of a test that
 *     asserts its own fixture.
 *   - **`index.ts` re-exporting for the module's own convenience.** Same reason.
 *
 * A `type` export is held to the same rule as a value. It is a smaller promise, not a free one:
 * `OrderDocument` leaving the barrel is what stops a sibling typing a variable against this
 * module's storage shape.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const MODULES_ROOT = path.join(__dirname, '../../src/modules');

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

/** What `<module>/index.ts` promises, or `undefined` when it has no barrel. */
const publishedBy = (name: string): Set<string> | undefined => {
    const barrel = path.join(MODULES_ROOT, name, 'index.ts');
    if (!existsSync(barrel)) return undefined;

    const published = new Set<string>();
    for (const clause of readFileSync(barrel, 'utf8').matchAll(/export\s+(?:type\s+)?{([^}]*)}/g))
        // `export { a as b }` publishes `b` — the promise is the name the caller writes.
        for (const name_ of clauseNames(clause[1])) published.add(name_.split(/\s+as\s+/).pop()!);
    return published;
};

/** `<module> → the names siblings actually import from its barrel`. */
const consumedFromBarrels = (): Map<string, Set<string>> => {
    const consumed = new Map(moduleNames().map((name) => [name, new Set<string>()]));

    for (const file of listFiles(path.join(MODULES_ROOT, '..'))) {
        const owner = file.startsWith(MODULES_ROOT)
            ? path.relative(MODULES_ROOT, file).split(path.sep)[0]
            : undefined;
        const source = readFileSync(file, 'utf8');

        for (const target of moduleNames()) {
            // Own files, specs included: a module is not a consumer of itself.
            if (target === owner) continue;
            const pattern = new RegExp(
                String.raw`import\s+(?:type\s+)?{([^}]*)}\s+from\s+["']@modules/${target}["']`,
                'g'
            );
            for (const clause of source.matchAll(pattern))
                // `import { a as b }` consumes `a` — the promise is the name the barrel wrote.
                for (const name of clauseNames(clause[1]))
                    consumed.get(target)!.add(name.split(/\s+as\s+/)[0].trim());
        }
    }
    return consumed;
};

describe('a barrel publishes exactly what a sibling imports', () => {
    it('finds the barrels it is meant to check', () => {
        // A canary: an empty sweep must mean "no module publishes anything", not "the sweep broke".
        const withBarrels = moduleNames().filter((name) => publishedBy(name) !== undefined);
        expect(withBarrels.length).toBeGreaterThanOrEqual(5);
    });

    it('promises nothing to nobody', () => {
        const consumed = consumedFromBarrels();
        const unused = moduleNames().flatMap((name) =>
            [...(publishedBy(name) ?? [])]
                .filter((exported) => !consumed.get(name)!.has(exported))
                .map((exported) => `${name} publishes ${exported}, which no sibling imports`)
        );

        expect(unused).toEqual([]);
    });

    it('gives no barrel to a module nothing imports', () => {
        const consumed = consumedFromBarrels();
        const pointless = moduleNames()
            .filter((name) => publishedBy(name) !== undefined && consumed.get(name)!.size === 0)
            .map((name) => `${name} has an index.ts, but no sibling imports it`);

        expect(pointless).toEqual([]);
    });
});
