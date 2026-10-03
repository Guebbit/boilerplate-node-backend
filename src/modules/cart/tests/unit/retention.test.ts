/**
 * @module
 * The TTL retention this module's collection is configured with. Mirrors
 * `audit-logs/tests/unit/retention.test.ts`: a TTL index is created once, at startup, from
 * whatever `NODE_CART_RETENTION_DAYS` is then, so this re-imports the model to force that
 * import-time read to run again.
 */

// A real top-level import, not just for the type: without one, TS treats this file as a global
// script rather than a module, and its `loadSchema`/`ttlSeconds` collide with `audit-logs`'
// identically-named globals.
import type { Schema } from 'mongoose';
import { setEnvironment } from '@tests/environment';

/** Re-imports the cart model with a fresh module registry, so the import-time read runs again. */
const loadSchema = async (): Promise<Schema> => {
    jest.resetModules();
    const module_ = await import('@modules/cart/model');
    return module_.cartSchema;
};

/** The `expireAfterSeconds` the TTL index was declared with. */
const ttlSeconds = (schema: Schema): number | undefined =>
    schema
        .indexes()
        .map(([, options]) => (options as { expireAfterSeconds?: number }).expireAfterSeconds)
        .find((value) => value !== undefined);

describe('cart retention', () => {
    afterEach(() => {
        jest.resetModules();
    });

    it('defaults to 365 days when the variable is unset', async () => {
        setEnvironment({ NODE_CART_RETENTION_DAYS: undefined });

        expect(ttlSeconds(await loadSchema())).toBe(365 * 24 * 60 * 60);
    });

    it('honours a configured retention', async () => {
        setEnvironment({ NODE_CART_RETENTION_DAYS: '30' });

        expect(ttlSeconds(await loadSchema())).toBe(30 * 24 * 60 * 60);
    });
});
