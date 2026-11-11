/**
 * The audit vocabulary, asserted across every module at once.
 *
 * Each module owns its own actions and `infrastructure` holds only the three app-level ones, so
 * a single list pinning every action string by name would have to name every domain —
 * reintroducing, in a test, exactly the coupling the module split removes.
 *
 * So the properties are asserted structurally instead:
 *
 *   1. **The sweep finds files.** An empty result must mean "nothing declares actions", not "the
 *      sweep stopped finding files".
 *   2. **Uniqueness across modules.** Two modules independently choosing `order.updated`
 *      type-checks — the union just collapses the duplicate — and produces an audit trail where a
 *      compliance query cannot tell which domain acted.
 *
 * The dotted-name convention (`noun.noun`, lower snake_case, 2-4 segments) is not asserted here:
 * ESLint refuses a malformed value in any `audit.ts` (`eslint.config.ts`), and the `rules.yaml`
 * and core `security.*` actions are shape-checked by their schemas when `regenerate` runs.
 */

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { MODULES_ROOT } from '@tests/paths';

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
        // actions", not "the sweep stopped finding files".
        //
        // Stated against the disk rather than as a count. A literal floor here is a copy of
        // `src/modules.ts` written as an integer, in a file that names no domain — so it goes
        // stale the day a domain is added or deleted, which is precisely when nobody is looking
        // at this line.
        expect(readdirSync(MODULES_ROOT).length).toBeGreaterThan(0);
        expect(files.length).toBeGreaterThanOrEqual(1);

        for (const { file } of files)
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
});
