/**
 * The audit vocabulary, asserted across every module at once.
 *
 * Each module owns its own actions and `infrastructure` holds only the three app-level ones, so
 * a single list pinning every action string by name would have to name every domain —
 * reintroducing, in a test, exactly the coupling the module split removes.
 *
 * So the properties are asserted structurally instead. Each is a real failure that has no other
 * guard:
 *
 *   1. **Uniqueness across modules.** Two modules independently choosing `admin.order.updated`
 *      type-checks — the union just collapses the duplicate — and produces an audit trail where a
 *      compliance query cannot tell which domain acted.
 *   2. **The dotted convention.** Log backends filter by prefix (`auth.*`, `admin.product.*`), so
 *      an action that is not `noun.noun.verb` is invisible to every saved search built on it.
 *   3. **Every module's file is reachable from the sweep.** A module whose actions live somewhere
 *      this test does not look is a module whose actions are unguarded, and the failure would be
 *      silence.
 */

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const MODULES_ROOT = path.join(__dirname, '../../src/modules');

/** Every `src/modules/<name>/audit.ts`, discovered rather than listed. */
const listAuditFiles = (): { module: string; file: string }[] =>
    readdirSync(MODULES_ROOT)
        .map((name) => ({ module: name, file: path.join(MODULES_ROOT, name, 'audit.ts') }))
        .filter((entry) => existsSync(entry.file));

/**
 * The action strings a module declares.
 *
 * Imported for real rather than parsed, so a module that fails to load fails this test instead of
 * silently contributing nothing. The exported const is the only value in these files; its name
 * varies per module (`accountAuditActions`, `cartAuditActions`, …), so it is found by shape.
 */
const readActions = async (file: string): Promise<Record<string, string>> => {
    const loaded = (await import(file)) as Record<string, unknown>;
    const exported = Object.values(loaded).find(
        (value) =>
            typeof value === 'object' &&
            value !== null &&
            Object.values(value).every((member) => typeof member === 'string')
    );
    return (exported ?? {}) as Record<string, string>;
};

describe('audit actions across modules', () => {
    it('finds an audit vocabulary in every module that emits one', async () => {
        const files = listAuditFiles();

        // A canary, as in the controller sweep: an empty result must mean "nothing declares
        // actions", not "the sweep stopped finding files". Six modules audit today; account,
        // users, products, orders, feedback and cart. `audit-logs` stores them and emits none.
        expect(files.length).toBeGreaterThanOrEqual(6);

        for (const { module, file } of files)
            expect(Object.keys(await readActions(file)).length).toBeGreaterThan(0);
    });

    it('never lets two modules claim the same action string', async () => {
        const owners = new Map<string, string>();
        const collisions: string[] = [];

        for (const { module, file } of listAuditFiles())
            for (const action of Object.values(await readActions(file))) {
                const existing = owners.get(action);
                if (existing)
                    collisions.push(`"${action}" claimed by both ${existing} and ${module}`);
                else owners.set(action, module);
            }

        expect(collisions).toEqual([]);
    });

    it('spells every action as dotted lower snake_case', async () => {
        const malformed: string[] = [];

        for (const { module, file } of listAuditFiles())
            for (const action of Object.values(await readActions(file)))
                // noun.noun.verb — at least three segments, each lower snake_case.
                if (!/^[a-z][\d_a-z]*(\.[a-z][\d_a-z]*){2,}$/.test(action))
                    malformed.push(`${module}: "${action}"`);

        expect(malformed).toEqual([]);
    });
});
