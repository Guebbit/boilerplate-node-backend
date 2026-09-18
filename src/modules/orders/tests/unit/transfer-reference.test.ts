/**
 * `orders/domain/transfer-reference.ts` — the RF reference `buildReference` mints and
 * `parseReference` reads back, and the guarantees that matter for matching money to the right
 * order: a round trip survives, a mistyped character is rejected rather than silently resolving,
 * and an order that predates this field is still reachable through its raw id.
 */
import { buildReference, parseReference } from '../../domain/transfer-reference';

/** A real ObjectId's hex, picked arbitrarily — any 24 hex characters exercise the same code path. */
const ORDER_ID = '507f1f77bcf86cd799439011';

describe('buildReference', () => {
    it('mints an RF reference of the documented shape', () => {
        const reference = buildReference(ORDER_ID);
        expect(reference).toMatch(/^RF\d{2}[\dA-Z]{19}$/);
    });

    it('is deterministic — the same order id always mints the same reference', () => {
        expect(buildReference(ORDER_ID)).toBe(buildReference(ORDER_ID));
    });

    it('mints a different reference for a different order', () => {
        expect(buildReference(ORDER_ID)).not.toBe(buildReference('000000000000000000000000'));
    });
});

describe('parseReference — the RF branch', () => {
    it('round-trips a reference buildReference just minted', () => {
        const reference = buildReference(ORDER_ID);
        expect(parseReference(reference)).toBe(reference);
    });

    it('tolerates the spacing and lowercase a customer might type it with', () => {
        const reference = buildReference(ORDER_ID);
        const grouped = reference
            .match(/.{1,4}/g)!
            .join(' ')
            .toLowerCase();
        expect(parseReference(grouped)).toBe(reference);
    });

    it('rejects a one-character typo instead of matching the wrong order', () => {
        const reference = buildReference(ORDER_ID);
        const lastChar = reference.at(-1)!;
        const typoChar = lastChar === '0' ? '1' : '0';
        const typo = `${reference.slice(0, -1)}${typoChar}`;

        expect(parseReference(typo)).toBeNull();
    });

    it('rejects a string that only looks structured, wrong length included', () => {
        expect(parseReference('RF00NOTAREALREFERENCE')).toBeNull();
    });
});

describe('parseReference — the raw ObjectId fallback', () => {
    it('accepts a 24-character hex ObjectId, for an order that predates this field', () => {
        expect(parseReference(ORDER_ID)).toBe(ORDER_ID);
    });

    it('normalizes an uppercase or spaced ObjectId to lowercase', () => {
        expect(parseReference('507F 1F77 BCF8 6CD7 9943 9011')).toBe(ORDER_ID);
    });

    it('rejects a string that is neither a valid reference nor 24 hex characters', () => {
        expect(parseReference('not-a-reference')).toBeNull();
        expect(parseReference('')).toBeNull();
    });
});
