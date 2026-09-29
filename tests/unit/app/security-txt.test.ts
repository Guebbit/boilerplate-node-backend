/**
 * `buildSecurityTxt` and `securityTxtWarning` — the pure halves of `/.well-known/security.txt`.
 */
import { buildSecurityTxt, securityTxtWarning } from '@app/security-txt';

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

describe('securityTxtWarning', () => {
    const contact = { NODE_SECURITY_CONTACT: 'mailto:a@b.c' };

    it('is silent when unconfigured', () => {
        expect(securityTxtWarning({}, NOW)).toBeUndefined();
    });

    it('warns when Expires is missing, invalid, past or within 30 days', () => {
        expect(securityTxtWarning(contact, NOW)).toContain('NOT published');
        expect(securityTxtWarning({ ...contact, NODE_SECURITY_EXPIRES: 'x' }, NOW)).toContain(
            'NOT published'
        );
        expect(
            securityTxtWarning({ ...contact, NODE_SECURITY_EXPIRES: '2026-09-01T00:00:00Z' }, NOW)
        ).toContain('past');
        expect(
            securityTxtWarning({ ...contact, NODE_SECURITY_EXPIRES: '2026-10-15T00:00:00Z' }, NOW)
        ).toContain('within 30 days');
    });

    it('is silent when Expires is comfortably in the future', () => {
        expect(
            securityTxtWarning({ ...contact, NODE_SECURITY_EXPIRES: '2027-09-29T00:00:00Z' }, NOW)
        ).toBeUndefined();
    });
});
