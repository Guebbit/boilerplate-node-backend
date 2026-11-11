/**
 * The cases the PHP twin's logger must answer identically: `shared/cases/log-redaction.cases.yaml`,
 * run against this repository's own redaction walk and message mask. The key lists themselves are
 * `shared/rules/log-redaction.yaml`, read by that same code; the message mask is code, pinned here.
 */

import { z } from 'zod';
import { redactSensitiveFields, serializeError } from '@infrastructure/adapters/logger';
import { correlationDigest } from '@infrastructure/security/pseudonymise';
import { caseBase, describeCases } from '@tests/cases';

/** One case: a key and whether its value is replaced, or a message and what it is masked to. */
const redactionCase = z.discriminatedUnion('kind', [
    caseBase.extend({
        kind: z.literal('key'),
        key: z.string().min(1),
        expect: z.enum(['redact', 'keep'])
    }),
    caseBase.extend({ kind: z.literal('message'), input: z.string(), expect: z.string() })
]);

/** A `{hash:X}` span of an expected message, which stands for the digest of X. */
const HASH_SPAN = /\{hash:([^}]*)\}/g;

describeCases('log-redaction', redactionCase, (one) => {
    if (one.kind === 'key') {
        const result = redactSensitiveFields({ [one.key]: 'value' }) as Record<string, unknown>;

        expect(result[one.key] === 'value' ? 'keep' : 'redact').toBe(one.expect);
        return;
    }

    // Through the serializer every logged error passes, so the case proves the wiring too.
    expect(serializeError(new Error(one.input)).message).toBe(
        one.expect.replaceAll(HASH_SPAN, (_span, address: string) => correlationDigest(address))
    );
});
