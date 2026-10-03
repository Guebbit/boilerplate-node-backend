/**
 * `src/infrastructure/http/frontend-link.ts` — one job: a template plus parameters becomes a link
 * into the paired frontend. `account` and `orders` own which KINDS exist, their own env vars and
 * default templates (D14) — this only covers what infrastructure itself is responsible for: the
 * origin, the locale segment, and placeholder substitution.
 */

import { frontendLink } from '@infrastructure/http/frontend-link';
import { resetSupportedLocales } from '@infrastructure/i18n';
import { overrideEnvironment } from '@infrastructure/config/store';

const TOKEN = 'a1b2c3d4e5f6';

/** Runs `run` with the given overrides, then puts them back and drops the locale-list cache they may affect. */
const withEnv = (overrides: Record<string, string | undefined>, run: () => void): void => {
    const restore = overrideEnvironment(overrides);
    resetSupportedLocales();

    try {
        run();
    } finally {
        restore();
        resetSupportedLocales();
    }
};

describe('frontendLink — placeholder substitution', () => {
    it('fills a named placeholder and URL-encodes the value', () => {
        expect(frontendLink('verify-email/confirm?token={token}', 'en', { token: TOKEN })).toBe(
            `http://localhost:8080/en/verify-email/confirm?token=${TOKEN}`
        );
    });

    it('fills more than one placeholder in the same template', () => {
        expect(frontendLink('orders/{id}/track/{code}', 'en', { id: 'order-1', code: 'abc' })).toBe(
            'http://localhost:8080/en/orders/order-1/track/abc'
        );
    });

    it('leaves a template with no placeholders untouched', () => {
        expect(frontendLink('orders/order-1', 'en')).toBe(
            'http://localhost:8080/en/orders/order-1'
        );
    });

    it('URL-encodes a value that would otherwise change the path shape', () => {
        expect(frontendLink('orders/{id}', 'en', { id: 'order 1/2' })).toBe(
            'http://localhost:8080/en/orders/order%201%2F2'
        );
    });

    it('ignores a param name the template never uses', () => {
        expect(frontendLink('orders/{id}', 'en', { id: 'order-1', unused: 'x' })).toBe(
            'http://localhost:8080/en/orders/order-1'
        );
    });
});

describe('frontendLink — the locale segment', () => {
    it('puts the locale first, right after the origin', () => {
        const url = frontendLink('verify-email/confirm?token={token}', 'it', { token: TOKEN });

        expect(new URL(url).pathname).toBe(`/it/verify-email/confirm`);
    });

    it('clamps an unsupported locale to the deployment default, rather than 404ing the link', () => {
        withEnv({ NODE_SUPPORTED_LOCALES: 'en,it', NODE_DEFAULT_LOCALE: 'en' }, () => {
            const url = frontendLink('verify-email/confirm?token={token}', 'kl', {
                token: TOKEN
            });

            expect(new URL(url).pathname.startsWith('/en/')).toBe(true);
        });
    });
});

describe('frontendLink — the origin', () => {
    it("falls back to the frontend's own local dev origin when NODE_FRONTEND_URL is unset", () => {
        withEnv({ NODE_FRONTEND_URL: undefined }, () => {
            expect(frontendLink('orders/{id}', 'en', { id: 'order-1' })).toBe(
                'http://localhost:8080/en/orders/order-1'
            );
        });
    });

    it('reads NODE_FRONTEND_URL when a deployment sets one', () => {
        withEnv({ NODE_FRONTEND_URL: 'https://shop.example.com' }, () => {
            expect(frontendLink('orders/{id}', 'en', { id: 'order-1' })).toBe(
                'https://shop.example.com/en/orders/order-1'
            );
        });
    });
});
