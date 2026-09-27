/**
 * `constantTimeEqual` — see `src/infrastructure/security/constant-time.ts`. The property under
 * test is behavioural (equal in, `true` out; unequal in, `false` out; never a thrown length
 * mismatch), since the double-hash's whole point — no timing branch on the inputs' own lengths —
 * isn't observable from a functional test.
 */

import { constantTimeEqual } from '@infrastructure/security/constant-time';

describe('constantTimeEqual', () => {
    it('accepts two equal strings', () => {
        expect(constantTimeEqual('shared-secret', 'shared-secret')).toBe(true);
    });

    it('rejects two different strings of the same length', () => {
        expect(constantTimeEqual('aaaaaaaa', 'bbbbbbbb')).toBe(false);
    });

    it('rejects two different strings of different lengths, without throwing', () => {
        expect(() => constantTimeEqual('short', 'a-lot-longer-than-that')).not.toThrow();
        expect(constantTimeEqual('short', 'a-lot-longer-than-that')).toBe(false);
    });

    it('rejects an empty string against a non-empty one', () => {
        expect(constantTimeEqual('', 'non-empty')).toBe(false);
    });

    it('accepts two empty strings', () => {
        expect(constantTimeEqual('', '')).toBe(true);
    });
});
