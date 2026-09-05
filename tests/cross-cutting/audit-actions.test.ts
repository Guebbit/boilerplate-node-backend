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
 *   1. **Uniqueness across modules.** Two modules independently choosing `order.updated`
 *      type-checks — the union just collapses the duplicate — and produces an audit trail where a
 *      compliance query cannot tell which domain acted.
 *   2. **The dotted convention.** Log backends filter by prefix (`auth.*`, `admin.product.*`), so
 *      an action that is not `noun.noun` or `noun.noun.verb` is invisible to every saved search
 *      built on it.
 *   3. **Every module's file is reachable from the sweep.** A module whose actions live somewhere
 *      this test does not look is a module whose actions are unguarded, and the failure would be
 *      silence.
 *   4. **Coverage, not just shape.** The three checks above only ever see what a module declares —
 *      a module that should audit something and doesn't looks identical to one that legitimately
 *      has nothing to record. `EXPECTED_NON_AUDITING` below is the explicit, reviewed answer for
 *      the modules where that absence is a decision rather than an oversight; see
 *      `AUDIT_COVERAGE_GAPS.md` for the reasoning behind each entry.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const MODULES_ROOT = path.join(__dirname, '../../src/modules');

/**
 * Modules that deliberately emit no audit action at all.
 *
 * `audit-logs` owns and reads the trail — it is the destination, not a writer. `observability` is
 * infrastructure (health, metrics, the audit read endpoint, the SSE stream) and records nothing of
 * its own. `wishlist` saves and unsaves product references — low-stakes user data with no money,
 * no stock and no identity attached. A fourth entry needs the same kind of argument in review.
 */
const EXPECTED_NON_AUDITING: string[] = ['audit-logs', 'observability', 'wishlist'];

/** Every directory under `src/modules/`. */
const moduleFolders = (): string[] =>
    readdirSync(MODULES_ROOT).filter((entry) =>
        statSync(path.join(MODULES_ROOT, entry)).isDirectory()
    );

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

    it('spells every action as dotted lower snake_case', async () => {
        const malformed: string[] = [];

        for (const { module, file } of listAuditFiles())
            for (const action of Object.values(await readActions(file)))
                // domain.verb or domain.resource.verb — two to four segments, each lower
                // snake_case. Matches BE's identical bound, so a renamed action satisfies both
                // repositories' guards at once.
                if (!/^[a-z][\d_a-z]*(\.[a-z][\d_a-z]*){1,3}$/.test(action))
                    malformed.push(`${module}: "${action}"`);

        expect(malformed).toEqual([]);
    });

    it('keeps every module either auditing or explicitly excused', () => {
        const auditing = new Set(listAuditFiles().map(({ module }) => module));

        const unaccounted = moduleFolders()
            .filter((folder) => !auditing.has(folder))
            .filter((folder) => !EXPECTED_NON_AUDITING.includes(folder))
            .map(
                (folder) =>
                    `${folder}: no audit.ts and not in EXPECTED_NON_AUDITING — decide whether it should audit`
            );

        expect(unaccounted).toEqual([]);
    });

    it('keeps the non-auditing list free of modules that started auditing, or stopped existing', () => {
        const auditing = new Set(listAuditFiles().map(({ module }) => module));
        const folders = moduleFolders();

        const stale = EXPECTED_NON_AUDITING.filter(
            (module) => !folders.includes(module) || auditing.has(module)
        );

        expect(stale).toEqual([]);
    });
});
