/**
 * Every module's service is reached through exactly one namespace, and that namespace is complete.
 *
 * The convention was 9 modules to 3 before this file existed: most exported a `<domain>Service`
 * object, while `delivery`, `inventory` and `payments` exported loose functions their controllers
 * imported one by one. Both styles work, which is exactly why the split survived — nothing failed.
 * What it cost was smaller than a bug and more annoying than one: a spec copied from a module that
 * uses `jest.spyOn(service, 'fn')` does not run against a module that has no object to spy on, and
 * a new module had two working examples to copy.
 *
 * Two properties are asserted, and the second is the one that needed a test rather than a rule:
 *
 *   1. **One namespace per service, named `*Service`.** Discovered from disk rather than listed,
 *      so a module added tomorrow is covered without editing this file.
 *   2. **The namespace holds every function the service exports.** This is the failure mode a
 *      convention alone cannot prevent: adding a function and forgetting to list it in the object
 *      is SILENT — the loose export still works, callers that already import by name never notice,
 *      and the namespace slowly stops being the whole surface it claims to be.
 *
 * Deliberately NOT asserted: that the object is named after the module. `feedback` exports
 * `feedbackRequestService` and `audit-logs` exports `auditLogService`, both named for the record
 * they serve rather than the folder — a rule that would fail those two is a rule about spelling,
 * not about structure.
 */

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const MODULES_ROOT = path.join(__dirname, '../../src/modules');

/**
 * Every module's service entry point, whichever form it takes.
 *
 * `service.ts` or `services/index.ts` — the second is what a service becomes past ~300 lines (see
 * `docs/theory/layers.md`), and a module that took that step must not fall out of this sweep as a
 * side effect.
 */
const listServiceEntries = (): { module: string; file: string }[] =>
    readdirSync(MODULES_ROOT)
        .flatMap((name) => [
            { module: name, file: path.join(MODULES_ROOT, name, 'service.ts') },
            { module: name, file: path.join(MODULES_ROOT, name, 'services', 'index.ts') }
        ])
        .filter((entry) => existsSync(entry.file));

type Loaded = Record<string, unknown>;

const isFunction = (value: unknown): value is (...args: unknown[]) => unknown =>
    typeof value === 'function';

/** An object whose every member is a function — the shape a service namespace has. */
const isNamespace = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).length > 0 &&
    Object.values(value).every((member) => isFunction(member));

describe('service namespaces across modules', () => {
    it('finds a service in every module that has one', () => {
        const entries = listServiceEntries();

        /*
         * A canary, as in the audit sweep: an empty result must mean "no module has a service",
         * not "the sweep stopped finding files". Stated against the disk rather than as a count —
         * a literal floor here would be a copy of `src/modules.ts` written as an integer, in a
         * file that deliberately names no domain.
         */
        const modulesWithAService = readdirSync(MODULES_ROOT).filter(
            (name) =>
                existsSync(path.join(MODULES_ROOT, name, 'service.ts')) ||
                existsSync(path.join(MODULES_ROOT, name, 'services', 'index.ts'))
        );

        expect(entries.map((entry) => entry.module).toSorted()).toEqual(
            modulesWithAService.toSorted()
        );
        expect(entries.length).toBeGreaterThan(0);
    });

    it.each(listServiceEntries())(
        '$module exports exactly one `*Service` namespace',
        async ({ file }) => {
            const loaded = (await import(file)) as Loaded;

            const namespaces = Object.entries(loaded).filter(([, value]) => isNamespace(value));

            expect(namespaces).toHaveLength(1);
            expect(namespaces[0]![0]).toMatch(/Service$/);
        }
    );

    it.each(listServiceEntries())(
        "$module's namespace carries every function the service exports",
        async ({ file }) => {
            const loaded = (await import(file)) as Loaded;

            const [, namespace] = Object.entries(loaded).find(([, value]) => isNamespace(value))!;
            const members = new Set(Object.values(namespace as Record<string, unknown>));

            const missing = Object.entries(loaded)
                .filter(([, value]) => isFunction(value))
                .filter(([, value]) => !members.has(value))
                .map(([name]) => name);

            expect(missing).toEqual([]);
        }
    );
});
