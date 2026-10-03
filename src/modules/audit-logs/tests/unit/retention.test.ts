import { setEnvironment } from '@tests/environment';
/**
 * @module
 * The TTL retention this module's collection is configured with.
 *
 * Read from the environment at import time, which is unusual enough to be worth a case: a TTL
 * index is created once, at startup, from whatever the value is then. The default branch is what
 * every deployment that has not set the variable actually runs.
 */

/** Re-imports the audit model with a fresh module registry, so the import-time read runs again. */
const loadSchema = async () => {
    jest.resetModules();
    const module_ = await import('@modules/audit-logs/model');
    return module_.auditLogSchema;
};

/** The `expireAfterSeconds` the TTL index was declared with. */
const ttlSeconds = (schema: Awaited<ReturnType<typeof loadSchema>>): number | undefined =>
    schema
        .indexes()
        .map(([, options]) => (options as { expireAfterSeconds?: number }).expireAfterSeconds)
        .find((value) => value !== undefined);

describe('audit log retention', () => {
    afterEach(() => {
        jest.resetModules();
    });

    it('defaults to 90 days when the variable is unset', async () => {
        setEnvironment({ NODE_AUDIT_RETENTION_DAYS: undefined });

        expect(ttlSeconds(await loadSchema())).toBe(90 * 24 * 60 * 60);
    });

    it('honours a configured retention', async () => {
        setEnvironment({ NODE_AUDIT_RETENTION_DAYS: '30' });

        expect(ttlSeconds(await loadSchema())).toBe(30 * 24 * 60 * 60);
    });
});
