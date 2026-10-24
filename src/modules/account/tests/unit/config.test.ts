/**
 * `accountFrontendLink` — this module's own link config: `infrastructure/http/frontend-link.ts` only
 * turns a resolved template into a URL, so the four kinds' env vars and default templates live
 * here, not in infrastructure.
 */
import { accountConfig, accountFrontendLink, deletionPurgeAt } from '@modules/account/config';
import { withoutEnvironmentInThisFile, setEnvironment } from '@tests/environment';

withoutEnvironmentInThisFile([
    'NODE_FRONTEND_URL',
    'NODE_FRONTEND_LINK_VERIFY',
    'NODE_FRONTEND_LINK_RESET',
    'NODE_FRONTEND_LINK_RESTORE',
    'NODE_ACCOUNT_DELETION_GRACE_DAYS',
    'NODE_FRONTEND_LINK_EMAIL_CHANGE'
]);

const TOKEN = 'a1b2c3d4e5f6';

describe('accountFrontendLink — the default template per kind', () => {
    it("builds the verify link: locale, then the frontend's verify-email page, token as a query param", () => {
        expect(accountFrontendLink('verify', { locale: 'en', token: TOKEN })).toBe(
            `http://localhost:8080/en/verify-email/confirm#token=${TOKEN}`
        );
    });

    it('builds the reset link', () => {
        expect(accountFrontendLink('reset', { locale: 'en', token: TOKEN })).toBe(
            `http://localhost:8080/en/password-reset/confirm#token=${TOKEN}`
        );
    });

    it('builds the restore link', () => {
        expect(accountFrontendLink('restore', { locale: 'en', token: TOKEN })).toBe(
            `http://localhost:8080/en/account-restore#token=${TOKEN}`
        );
    });

    it('builds the email-change link', () => {
        expect(accountFrontendLink('email-change', { locale: 'en', token: TOKEN })).toBe(
            `http://localhost:8080/en/email-change/confirm#token=${TOKEN}`
        );
    });

    it('gives every kind a distinct path, so one token can never be mistaken for another flow', () => {
        const urls = (['verify', 'reset', 'restore', 'email-change'] as const).map((kind) =>
            accountFrontendLink(kind, { locale: 'en', token: TOKEN })
        );

        expect(new Set(urls).size).toBe(urls.length);
    });
});

describe('accountFrontendLink — per-kind override', () => {
    it("lets a deployment override one kind's template without touching the others", () => {
        setEnvironment({ NODE_FRONTEND_LINK_RESET: 'change-password?t={token}' });

        expect(accountFrontendLink('reset', { locale: 'en', token: TOKEN })).toBe(
            `http://localhost:8080/en/change-password?t=${TOKEN}`
        );
        expect(accountFrontendLink('verify', { locale: 'en', token: TOKEN })).toBe(
            `http://localhost:8080/en/verify-email/confirm#token=${TOKEN}`
        );
    });
});

describe('NODE_ACCOUNT_DELETION_GRACE_DAYS', () => {
    it('defaults to 30 days', () => {
        expect(accountConfig().NODE_ACCOUNT_DELETION_GRACE_DAYS).toBe(30);
    });

    it.each(['0', '32'])('refuses %s, outside 1-31', (value) => {
        setEnvironment({ NODE_ACCOUNT_DELETION_GRACE_DAYS: value });
        expect(() => accountConfig()).toThrow();
    });
});

describe('deletionPurgeAt', () => {
    it('is the grace when that is the shorter bound: 5 March + 30 days', () => {
        expect(deletionPurgeAt(new Date('2026-03-05T10:00:00Z')).toISOString()).toBe(
            '2026-04-04T10:00:00.000Z'
        );
    });

    it('is one calendar month when February is in the window: 30 January lands on 28 February', () => {
        expect(deletionPurgeAt(new Date('2026-01-30T10:00:00Z')).toISOString()).toBe(
            '2026-02-28T00:00:00.000Z'
        );
    });

    it('never passes the month, even with the longest grace', () => {
        setEnvironment({ NODE_ACCOUNT_DELETION_GRACE_DAYS: '31' });
        expect(deletionPurgeAt(new Date('2026-04-30T23:00:00Z')).toISOString()).toBe(
            '2026-05-30T00:00:00.000Z'
        );
        expect(deletionPurgeAt(new Date('2026-03-05T10:00:00Z')).toISOString()).toBe(
            '2026-04-05T00:00:00.000Z'
        );
    });
});
