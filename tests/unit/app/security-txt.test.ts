/**
 * `buildSecurityTxt` — the pure half of `/.well-known/security.txt`.
 */
import { buildSecurityTxt } from '@app/security-txt';

const NOW = new Date('2026-09-29T00:00:00Z');

describe('buildSecurityTxt', () => {
    it('is undefined until a contact is set', () => {
        expect(buildSecurityTxt({ NODE_SECURITY_EXPIRES: '2027-01-01T00:00:00Z' })).toBeUndefined();
    });

    it('is undefined without a usable Expires, which RFC 9116 requires', () => {
        expect(buildSecurityTxt({ NODE_SECURITY_CONTACT: 'mailto:a@b.c' })).toBeUndefined();
        expect(
            buildSecurityTxt({
                NODE_SECURITY_CONTACT: 'mailto:a@b.c',
                NODE_SECURITY_EXPIRES: 'soon'
            })
        ).toBeUndefined();
    });

    it('emits the two required fields plus language, omitting unset optionals', () => {
        expect(
            buildSecurityTxt({
                NODE_SECURITY_CONTACT: 'mailto:a@b.c',
                NODE_SECURITY_EXPIRES: '2027-01-01'
            })
        ).toBe(
            'Contact: mailto:a@b.c\nExpires: 2027-01-01T00:00:00.000Z\nPreferred-Languages: en\n'
        );
    });

    it('is undefined once Expires has passed, since an expired file must not be trusted', () => {
        const settings = {
            NODE_SECURITY_CONTACT: 'mailto:a@b.c',
            NODE_SECURITY_EXPIRES: '2026-09-01T00:00:00Z'
        };

        expect(buildSecurityTxt(settings, NOW)).toBeUndefined();
        // Expiring at this very instant counts as expired.
        expect(
            buildSecurityTxt({ ...settings, NODE_SECURITY_EXPIRES: NOW.toISOString() }, NOW)
        ).toBeUndefined();
    });

    it('is judged against the clock at each call, so a running server stops publishing', () => {
        const settings = {
            NODE_SECURITY_CONTACT: 'mailto:a@b.c',
            NODE_SECURITY_EXPIRES: '2026-10-01T00:00:00Z'
        };

        expect(buildSecurityTxt(settings, new Date('2026-09-30T23:59:59Z'))).toBeDefined();
        expect(buildSecurityTxt(settings, new Date('2026-10-01T00:00:01Z'))).toBeUndefined();
    });

    it('adds Policy and Canonical when their sources are set', () => {
        const body = buildSecurityTxt({
            NODE_SECURITY_CONTACT: 'https://x.test/advisories/new',
            NODE_SECURITY_EXPIRES: '2027-01-01T00:00:00Z',
            NODE_SECURITY_POLICY_URL: 'https://x.test/SECURITY.md',
            NODE_URL: 'https://api.x.test/'
        });

        expect(body).toContain('Policy: https://x.test/SECURITY.md\n');
        expect(body).toContain('Canonical: https://api.x.test/.well-known/security.txt\n');
    });
});
