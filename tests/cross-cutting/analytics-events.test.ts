/**
 * The analytics vocabulary, swept across every module — the twin of `audit-actions.test.ts`.
 * Names land in ONE Umami website which counts per name, so a name claimed twice produces rows
 * nothing can tell apart. The browser reports only the events modules declare for
 * `POST /analytics/events` (`AppModule.browserEvents`); this sweep guards every name, the
 * server-emitted ones and those.
 *
 * See: docs/api/contract-fragmentation.md#the-analytics-names--the-bundle-that-stopped-being-one
 */

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { MODULES_ROOT } from '@tests/paths';

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
});
