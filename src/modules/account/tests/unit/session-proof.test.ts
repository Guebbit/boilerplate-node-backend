/**
 * @module
 * The session proof rules: proofs combine without duplicates, and only an armed account without
 * `otp` is refused a first session.
 */

import { AMR, firstSessionRefused, withProofs } from '../../domain/session-proof';

describe('withProofs', () => {
    it('adds proofs after the carried ones, once each', () => {
        expect(withProofs([AMR.password], AMR.otp)).toEqual(['pwd', 'otp']);
        expect(withProofs([AMR.password, AMR.otp], AMR.otp)).toEqual(['pwd', 'otp']);
    });

    it('does not change what it was given', () => {
        const carried = [AMR.password];
        withProofs(carried, AMR.otp);
        expect(carried).toEqual(['pwd']);
    });
});

describe('firstSessionRefused', () => {
    it.each([
        { armed: true, amr: ['pwd'], refused: true },
        { armed: true, amr: [], refused: true },
        { armed: true, amr: ['email'], refused: true },
        { armed: true, amr: ['pwd', 'otp'], refused: false },
        { armed: false, amr: ['pwd'], refused: false },
        { armed: false, amr: [], refused: false }
    ])('armed=$armed amr=$amr -> refused=$refused', ({ armed, amr, refused }) => {
        expect(firstSessionRefused(armed, amr)).toBe(refused);
    });
});
