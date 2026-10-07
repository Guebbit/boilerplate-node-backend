import { deriveSubkey } from '@infrastructure/security/subkey';

/**
 * `deriveSubkey` is HKDF-SHA256 with an empty salt and a 32-byte output, cached per root and info.
 * The vector is the standard one, so a wrong argument order or digest cannot pass by agreeing with
 * itself.
 */
describe('deriveSubkey()', () => {
    it('matches RFC 5869 Appendix A.3 (empty salt, empty info), first 32 bytes of the OKM', () => {
        // IKM is 22 bytes of 0x0b; as a string, each byte is the ASCII control character U+000B.
        const root = '\u000B'.repeat(22);

        expect(deriveSubkey(root, '').export().toString('hex')).toBe(
            '8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d'
        );
    });

    it('gives two purposes under one root different keys', () => {
        const first = deriveSubkey('one-root-secret', 'purpose/a').export();
        const second = deriveSubkey('one-root-secret', 'purpose/b').export();

        expect(first.equals(second)).toBe(false);
    });

    it('gives one purpose under two roots different keys', () => {
        const first = deriveSubkey('root-a', 'purpose').export();
        const second = deriveSubkey('root-b', 'purpose').export();

        expect(first.equals(second)).toBe(false);
    });

    it('returns the cached instance for the same inputs', () => {
        expect(deriveSubkey('cached-root', 'purpose')).toBe(deriveSubkey('cached-root', 'purpose'));
    });

    it('returns a 32-byte secret key', () => {
        const key = deriveSubkey('size-root', 'purpose');

        expect(key.type).toBe('secret');
        expect(key.symmetricKeySize).toBe(32);
    });
});
