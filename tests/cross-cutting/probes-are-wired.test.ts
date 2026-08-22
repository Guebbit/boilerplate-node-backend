import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { PROBED_SECTIONS } from '../../scripts/contracts/generate-collections';

/**
 * Guard: a module that declares `probes.ts` is actually wired into the generated collections.
 *
 * `probes.ts` is the one module-owned file the registry does not reach. Its four siblings plug into
 * extension points that name no domain — `audit.ts`/`analytics.ts` by declaration merging,
 * `events.ts` through `DomainEventMap`, `metrics.ts` through the shared registry — while probes are
 * listed in a hand-maintained map in `scripts/contracts/generate-collections.ts`, typed
 * `Partial<Record<…>>` so an omission is perfectly legal.
 *
 * The static import in that file is deliberate and stays: deleting a module stops it compiling,
 * which is a stronger failure than any test. It only covers deletion. A NEW module writing a
 * perfectly good `probes.ts` and not editing the map produces four contract collections that look
 * complete and contain none of its probes — silently, and against the registry's promise that
 * adding a domain edits nothing outside its own folder.
 *
 * So this asserts the other direction, and nothing else: every `probes.ts` on disk is in the map.
 * A module with no probes is not a finding — most read endpoints have no interesting rejection.
 */

const MODULES_ROOT = path.join(__dirname, '..', '..', 'src', 'modules');

/** Every module that has written a `probes.ts`, discovered rather than listed. */
const modulesDeclaringProbes = (): string[] =>
    readdirSync(MODULES_ROOT).filter((name) =>
        existsSync(path.join(MODULES_ROOT, name, 'probes.ts'))
    );

describe('every declared probes.ts reaches the collections', () => {
    it('finds no module whose probes are missing from the map', () => {
        const wired = new Set<string>(PROBED_SECTIONS);

        expect(modulesDeclaringProbes().filter((name) => !wired.has(name))).toEqual([]);
    });

    it('actually scans the module tree', () => {
        // A canary, as in the audit sweep: an empty result must mean "all wired", never "nothing
        // was read".
        expect(modulesDeclaringProbes().length).toBeGreaterThan(0);
    });

    it('maps no section that declares no probes', () => {
        // The reverse reading. An entry left behind after its `probes.ts` was deleted would not
        // stop the build — the import would — but it would mean the map and the tree disagree,
        // and this is the file that says they must not.
        const onDisk = new Set(modulesDeclaringProbes());

        expect(PROBED_SECTIONS.filter((section) => !onDisk.has(section))).toEqual([]);
    });
});
