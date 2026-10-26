/**
 * The cases the PHP twin's crypto must answer identically: `shared/cases/crypto.cases.yaml`, run
 * against this repository's pseudonyms, HKDF subkeys, versioned secrets and argon2id verifier.
 */

import { z } from 'zod';
import { deriveSubkey } from '@infrastructure/security/subkey';
import { pseudonymise } from '@infrastructure/security/pseudonymise';
import { decryptVersionedSecret } from '@infrastructure/security/versioned-secret';
import { verifyPassword } from '@infrastructure/security/password-hash';
import { setEnvironment } from '@tests/environment';
import { caseBase, describeCases } from '@tests/cases';

/** One case; `kind` picks which primitive it exercises. */
const cryptoCase = z.discriminatedUnion('kind', [
    caseBase.extend({
        kind: z.literal('pseudonym'),
        root: z.string(),
        purpose: z.enum(['log', 'rate-limit', 'idempotency']),
        value: z.string(),
        digest: z.string()
    }),
    caseBase.extend({
        kind: z.literal('subkey'),
        root: z.string(),
        info: z.string(),
        key: z.string()
    }),
    caseBase.extend({
        kind: z.literal('decrypt'),
        ring: z.array(z.object({ version: z.string(), key: z.string() })),
        purpose: z.enum(['pii', 'totp', 'webhook-secret']),
        aad: z.string(),
        stored: z.string(),
        expect: z.string()
    }),
    caseBase.extend({
        kind: z.literal('verify-password'),
        password: z.string(),
        stored: z.string(),
        expect: z.boolean()
    })
]);

describeCases('crypto', cryptoCase, 22, (one) => {
    switch (one.kind) {
        case 'pseudonym': {
            setEnvironment({ NODE_PSEUDONYM_KEY: one.root });
            expect(pseudonymise(one.purpose, one.value)).toBe(one.digest);
            break;
        }
        case 'subkey': {
            expect(deriveSubkey(one.root, one.info).export().toString('hex')).toBe(one.key);
            break;
        }
        case 'decrypt': {
            const open = () =>
                decryptVersionedSecret(
                    one.stored,
                    one.ring,
                    { purpose: one.purpose, aad: one.aad },
                    'shared case'
                );
            if (one.expect === 'reject') expect(open).toThrow();
            else expect(open()).toBe(one.expect);
            break;
        }
        case 'verify-password': {
            // Async case: the harness awaits the returned promise.
            return expect(verifyPassword(one.password, one.stored)).resolves.toBe(one.expect);
        }
    }
});
