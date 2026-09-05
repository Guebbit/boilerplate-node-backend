/**
 * The analytics vocabulary, swept across every module — the twin of `audit-actions.test.ts`.
 * Names land in ONE Umami website which counts per name, so a name claimed twice produces rows
 * nothing can tell apart. The paired frontend emits no custom events, so this sweep is the whole
 * of the guard.
 *
 * See: docs/api/contract-fragmentation.md#the-analytics-names--the-bundle-that-stopped-being-one
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const MODULES_ROOT = path.join(__dirname, '../../src/modules');

/** The import specifier a module augments to add its names to the port's union. */
const ANALYTICS_PORT = '@infrastructure/observability/analytics';

/** Every `src/modules/<name>/analytics.ts`, discovered rather than listed. */
const listAnalyticsFiles = (): { module: string; file: string }[] =>
    readdirSync(MODULES_ROOT)
        .map((name) => ({ module: name, file: path.join(MODULES_ROOT, name, 'analytics.ts') }))
        .filter((entry) => existsSync(entry.file));

/**
 * The event names a module declares — imported for real, so a module that fails to load fails here
 * rather than silently contributing nothing. The constant's name varies per module
 * (`accountAnalyticsEvents`, `cartAnalyticsEvents`, …), so it is found by shape.
 */
const readEvents = async (file: string): Promise<Record<string, string>> => {
    const loaded = (await import(file)) as Record<string, unknown>;
    const exported = Object.values(loaded).find(
        (value) =>
            typeof value === 'object' &&
            value !== null &&
            Object.values(value).every((member) => typeof member === 'string')
    );
    return (exported ?? {}) as Record<string, string>;
};

describe('analytics event names across modules', () => {
    it('finds a vocabulary in every module that declares one', async () => {
        const files = listAnalyticsFiles();

        // Canary: an empty result must mean "nothing declares names", not "the sweep broke".
        expect(readdirSync(MODULES_ROOT).length).toBeGreaterThan(0);
        expect(files.length).toBeGreaterThanOrEqual(1);

        for (const { file } of files)
            expect(Object.keys(await readEvents(file)).length).toBeGreaterThan(0);
    });

    it('never lets two modules claim the same constant name', async () => {
        const owners = new Map<string, string>();
        const collisions: string[] = [];

        for (const { module, file } of listAnalyticsFiles())
            for (const key of Object.keys(await readEvents(file))) {
                const existing = owners.get(key);
                if (existing) collisions.push(`${key} claimed by both ${existing} and ${module}`);
                else owners.set(key, module);
            }

        expect(collisions).toEqual([]);
    });

    it('never lets two modules claim the same event string', async () => {
        // The collision that actually reaches Umami, unlike a duplicate constant name.
        const owners = new Map<string, string>();
        const collisions: string[] = [];

        for (const { module, file } of listAnalyticsFiles())
            for (const value of Object.values(await readEvents(file))) {
                const existing = owners.get(value);
                if (existing)
                    collisions.push(`"${value}" claimed by both ${existing} and ${module}`);
                else owners.set(value, module);
            }

        expect(collisions).toEqual([]);
    });

    it('spells every event as lower snake_case, subject first', async () => {
        const malformed: string[] = [];

        for (const { module, file } of listAnalyticsFiles())
            for (const value of Object.values(await readEvents(file)))
                // Two or more lower snake_case segments; the past-tense verb closes.
                // See docs/tools/analytics.md#naming.
                if (!/^[a-z][\da-z]*(_[a-z][\da-z]*)+$/.test(value))
                    malformed.push(`${module}: "${value}"`);

        expect(malformed).toEqual([]);
    });

    it('has every module widen the port union it emits through', () => {
        // Source text, not the type: the augmentation is erased at runtime, so a value-level
        // assertion could only restate that a string is a string.
        const missing = listAnalyticsFiles()
            .filter(
                ({ file }) =>
                    !readFileSync(file, 'utf8').includes(`declare module '${ANALYTICS_PORT}'`)
            )
            .map(
                ({ module }) =>
                    `${module}: no \`declare module '${ANALYTICS_PORT}'\` block — its names are not in AnalyticsEventMap`
            );

        expect(missing).toEqual([]);
    });
});
