/**
 * @module
 * The `format: email` half of `tests/support/contract-data.ts`'s payload generator.
 *
 * One shape (`word@example.com`) is not what a real inbox looks like, and `B1` was exactly that
 * gap: a hand-tightened email regex rejected a plus-tag and an 8+ character TLD, and nothing in
 * this generator ever sent one to find out. This pins the fix — every shape the generator can
 * produce actually appears across enough draws.
 */

import { z } from 'zod';
import { validPayload } from '@tests/contract-data';

/** Draws enough samples that a 4-way random pick almost certainly hits every shape at least once. */
const SAMPLE_COUNT = 200;

describe('contract-data — email format', () => {
    it('generates a plus-tag, an 8+ character TLD, and a subdomain, across enough draws', () => {
        const schema = z.object({ email: z.email() });
        const emails = Array.from(
            { length: SAMPLE_COUNT },
            () => validPayload<{ email: string }>(schema).email
        );

        expect(emails.some((email) => email.includes('+'))).toBe(true);
        expect(emails.some((email) => /@[^.]+\.[a-z]{8,}$/.test(email))).toBe(true);
        expect(emails.some((email) => /@(?:[^.]+\.){2}[a-z]+$/.test(email))).toBe(true);
    });

    it('never emits a value the schema itself rejects', () => {
        const schema = z.object({ email: z.email() });

        for (let index = 0; index < SAMPLE_COUNT; index += 1) {
            const { email } = validPayload<{ email: string }>(schema);
            expect(schema.safeParse({ email }).success).toBe(true);
        }
    });
});
