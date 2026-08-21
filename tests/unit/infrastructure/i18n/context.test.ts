/**
 * The request-scoped `t`, and the AsyncLocalStorage behind it.
 *
 * Tested for both directions that matter: inside a scope the ambient `t` must be the scope's, and
 * outside one it must silently be the global instance's. The second is what keeps jobs, workers
 * and migrations working, so a regression there is invisible until something out-of-band starts
 * answering in a raw key.
 *
 * The interleaving cases are the reason this code is its own file: the bug it exists to prevent —
 * one request answered in another's language — only appears under concurrency, so never in a test
 * that does not deliberately provoke it.
 */
import {
    createLocaleContext,
    getCurrentLocale,
    getLocaleContext,
    runWithLocale,
    t
} from '@infrastructure/i18n';
import enUsers from '@modules/users/locales/en.json';
import itUsers from '@modules/users/locales/it.json';

describe('the ambient t', () => {
    it('resolves against the scope’s locale inside a scope', () => {
        runWithLocale('it', () => {
            expect(t('users.field-email-invalid')).toBe(itUsers.users['field-email-invalid']);
            expect(getCurrentLocale()).toBe('it');
            expect(getLocaleContext()?.locale).toBe('it');
        });
    });

    it('falls back to the global instance outside any scope', () => {
        expect(getLocaleContext()).toBeUndefined();
        expect(t('users.field-email-invalid')).toBe(enUsers.users['field-email-invalid']);
    });

    it('survives awaits, so a thunk deep in a promise chain still sees the scope', async () => {
        const resolved = await runWithLocale('it', async () => {
            await Promise.resolve();
            // A real task hop, not a wall-clock wait: `setImmediate` crosses the same async
            // boundary a timer would — which is what the store has to survive — without asking
            // the test to guess how long a loaded machine needs.
            await new Promise((resolve) => setImmediate(resolve));
            return t('users.field-email-invalid');
        });

        expect(resolved).toBe(itUsers.users['field-email-invalid']);
    });

    it('keeps two overlapping scopes apart', async () => {
        const [italian, english] = await Promise.all([
            runWithLocale('it', async () => {
                // Two task hops against one, so the scopes genuinely interleave — see the note
                // on the previous test for why these are not timers.
                await new Promise((resolve) => setImmediate(resolve));
                await new Promise((resolve) => setImmediate(resolve));
                return t('users.field-email-invalid');
            }),
            runWithLocale('en', async () => {
                await new Promise((resolve) => setImmediate(resolve));
                return t('users.field-email-invalid');
            })
        ]);

        expect(italian).toBe(itUsers.users['field-email-invalid']);
        expect(english).toBe(enUsers.users['field-email-invalid']);
    });

    it('binds a context without mutating the global language', () => {
        const before = getCurrentLocale();
        createLocaleContext('it');
        expect(getCurrentLocale()).toBe(before);
    });
});
