/**
 * `src/infrastructure/http/frontend-link.ts` — links into the paired frontend.
 *
 * Every account email and the orders confirmation share this one builder, so a bug here breaks
 * every confirmation link the app sends, not just one flow's.
 */

import { frontendLink } from '@infrastructure/http/frontend-link';
import { resetSupportedLocales } from '@infrastructure/i18n';

const TOKEN = 'a1b2c3d4e5f6';
const ORDER_ID = 'order-1';

/** Restores whichever env vars a test overrode, and drops the locale-list cache they may affect. */
const withEnv = (overrides: Record<string, string | undefined>, run: () => void): void => {
    const originals = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
    for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    resetSupportedLocales();

    try {
        run();
    } finally {
        for (const [key, value] of Object.entries(originals)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        resetSupportedLocales();
    }
};

describe('frontendLink — the default template per kind', () => {
    it('builds the verify link: locale, then the frontend\'s verify-email page, token as a query param', () => {
        expect(frontendLink('verify', { locale: 'en', token: TOKEN })).toBe(
            `http://localhost:8080/en/verify-email/confirm?token=${TOKEN}`
        );
    });

    it('builds the reset link', () => {
        expect(frontendLink('reset', { locale: 'en', token: TOKEN })).toBe(
            `http://localhost:8080/en/password-reset/confirm?token=${TOKEN}`
        );
    });

    it('builds the delete link', () => {
        expect(frontendLink('delete', { locale: 'en', token: TOKEN })).toBe(
            `http://localhost:8080/en/account-delete/confirm?token=${TOKEN}`
        );
    });

    it('builds the email-change link', () => {
        expect(frontendLink('email-change', { locale: 'en', token: TOKEN })).toBe(
            `http://localhost:8080/en/email-change/confirm?token=${TOKEN}`
        );
    });

    it('builds the order link off `id`, not `token`, with no query string', () => {
        expect(frontendLink('order', { locale: 'en', id: ORDER_ID })).toBe(
            `http://localhost:8080/en/orders/${ORDER_ID}`
        );
    });

    it('gives every kind a distinct path, so one token can never be mistaken for another flow', () => {
        const urls = [
            frontendLink('verify', { locale: 'en', token: TOKEN }),
            frontendLink('reset', { locale: 'en', token: TOKEN }),
            frontendLink('delete', { locale: 'en', token: TOKEN }),
            frontendLink('email-change', { locale: 'en', token: TOKEN })
        ];

        expect(new Set(urls).size).toBe(urls.length);
    });
});

describe('frontendLink — the locale segment', () => {
    it('puts the locale first, right after the origin', () => {
        const url = frontendLink('verify', { locale: 'it', token: TOKEN });

        expect(new URL(url).pathname).toBe(`/it/verify-email/confirm`);
    });

    it('clamps an unsupported locale to the deployment default, rather than 404ing the link', () => {
        withEnv({ NODE_SUPPORTED_LOCALES: 'en,it', NODE_DEFAULT_LOCALE: 'en' }, () => {
            const url = frontendLink('verify', { locale: 'kl', token: TOKEN });

            expect(new URL(url).pathname.startsWith('/en/')).toBe(true);
        });
    });
});

describe('frontendLink — configuration', () => {
    it('falls back to the frontend\'s own local dev origin when NODE_FRONTEND_URL is unset', () => {
        withEnv({ NODE_FRONTEND_URL: undefined }, () => {
            expect(frontendLink('verify', { locale: 'en', token: TOKEN })).toBe(
                `http://localhost:8080/en/verify-email/confirm?token=${TOKEN}`
            );
        });
    });

    it('reads NODE_FRONTEND_URL when a deployment sets one', () => {
        withEnv({ NODE_FRONTEND_URL: 'https://shop.example.com' }, () => {
            expect(frontendLink('verify', { locale: 'en', token: TOKEN })).toBe(
                `https://shop.example.com/en/verify-email/confirm?token=${TOKEN}`
            );
        });
    });

    it('lets a deployment override one kind\'s template without touching the others', () => {
        withEnv({ NODE_FRONTEND_LINK_RESET: 'change-password?t={token}' }, () => {
            expect(frontendLink('reset', { locale: 'en', token: TOKEN })).toBe(
                `http://localhost:8080/en/change-password?t=${TOKEN}`
            );
            expect(frontendLink('verify', { locale: 'en', token: TOKEN })).toBe(
                `http://localhost:8080/en/verify-email/confirm?token=${TOKEN}`
            );
        });
    });
});
