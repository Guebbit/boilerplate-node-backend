/**
 * Locale ownership across modules.
 *
 * Each module carries its own dictionaries under `src/modules/<name>/locales/`, and `infrastructure` merges
 * them onto the shared file at boot. That merge is deep and last-writer-wins, which buys two
 * failure modes nothing else would catch — both silent, both producing wrong COPY rather than an
 * error:
 *
 *   1. **A module shadowing a shared key.** `generic.error-internal` and its three siblings are a
 *      cross-repo contract: the paired frontend reads them by name off `GET /locales/:locale` to
 *      render API copy when no response arrives. A module quietly redefining one changes text the
 *      other repo depends on, in a file nobody would think to look in.
 *   2. **Two modules colliding.** Deep merge makes the collision invisible — the later module wins
 *      and the earlier one's string is simply gone.
 *
 * The language-parity check (every locale declaring the same keys) lives in
 * `tests/unit/i18n/validation-messages.test.ts`, which asserts it against the merged dictionaries
 * and so already covers every module at once.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const SOURCE_ROOT = path.join(__dirname, '../../src');
const MODULES_ROOT = path.join(SOURCE_ROOT, 'modules');
const SHARED_LOCALES = path.join(SOURCE_ROOT, 'locales');

/** Every dotted leaf key in a dictionary, e.g. `account.email.reset-request.subject`. */
const flatten = (value: unknown, prefix = ''): string[] => {
    if (typeof value !== 'object' || value === null) return [prefix];
    return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
        flatten(nested, prefix ? `${prefix}.${key}` : key)
    );
};

const readDictionary = (file: string): Record<string, unknown> =>
    JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;

/** `<module name> → its English keys`, discovered rather than listed. */
const moduleKeys = (): Map<string, string[]> => {
    const found = new Map<string, string[]>();
    for (const name of readdirSync(MODULES_ROOT)) {
        const file = path.join(MODULES_ROOT, name, 'locales', 'en.json');
        if (existsSync(file)) found.set(name, flatten(readDictionary(file)));
    }
    return found;
};

describe('locale namespaces across modules', () => {
    it('finds dictionaries in every module that ships copy', () => {
        // A canary: an empty sweep must mean "no module ships copy", not "the sweep broke".
        //
        // Against the disk, not a count. How many modules ship copy is a fact about
        // `src/modules.ts`, and pinning it here means adding a domain fails a test about locales.
        expect(readdirSync(MODULES_ROOT).length).toBeGreaterThan(0);
        expect(moduleKeys().size).toBeGreaterThanOrEqual(1);
    });

    it('never lets a module shadow a shared key', () => {
        const shared = new Set(flatten(readDictionary(path.join(SHARED_LOCALES, 'en.json'))));
        const clashes: string[] = [];

        for (const [name, keys] of moduleKeys())
            for (const key of keys) if (shared.has(key)) clashes.push(`${name} redefines "${key}"`);

        expect(clashes).toEqual([]);
    });

    it('never lets two modules claim the same key', () => {
        const owners = new Map<string, string>();
        const clashes: string[] = [];

        for (const [name, keys] of moduleKeys())
            for (const key of keys) {
                const existing = owners.get(key);
                if (existing) clashes.push(`"${key}" claimed by both ${existing} and ${name}`);
                else owners.set(key, name);
            }

        expect(clashes).toEqual([]);
    });

    it('keeps every module inside a namespace it owns', () => {
        // A module's keys must sit under its own name, so "which module ships this string" is
        // answerable from the key alone — and so deleting the module cannot orphan half a
        // namespace that another module also writes into.
        const strays: string[] = [];

        for (const [name, keys] of moduleKeys())
            for (const key of keys)
                if (!key.startsWith(`${name}.`)) strays.push(`${name} ships "${key}"`);

        expect(strays).toEqual([]);
    });
});
