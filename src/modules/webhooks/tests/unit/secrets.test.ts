/**
 * Secret-ring encryption at rest and the ring operations built on it — see `../../secrets.ts`.
 * `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY` is set for every suite in `tests/support/setup.ts`. The
 * crypto and version-mismatch behaviour itself is `versioned-secret.ts`'s, tested once in
 * `tests/unit/infrastructure/security/versioned-secret.test.ts` — this just holds the wiring.
 */

import {
    encryptRingSecret,
    decryptRingSecret,
    mintRingSecret,
    activeRingSecrets,
    removeRingSecret
} from '@modules/webhooks/secrets';
import type { WebhookSecretRingEntry } from '@modules/webhooks/model';

describe('encryptRingSecret / decryptRingSecret', () => {
    it('round-trips a plaintext secret under the configured webhook key', () => {
        const ciphertext = encryptRingSecret('whsec_hello-world');
        expect(decryptRingSecret(ciphertext)).toBe('whsec_hello-world');
    });
});

describe('mintRingSecret', () => {
    it('mints a Standard-Webhooks-shaped plaintext and a matching encrypted entry', () => {
        const { entry, plaintext } = mintRingSecret();

        expect(plaintext.startsWith('whsec_')).toBe(true);
        expect(entry.id).toMatch(
            /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i
        );
        expect(entry.createdAt).toBeInstanceOf(Date);
        expect(decryptRingSecret(entry.ciphertext)).toBe(plaintext);
    });

    it('mints a different secret and id every time', () => {
        const first = mintRingSecret();
        const second = mintRingSecret();
        expect(first.plaintext).not.toBe(second.plaintext);
        expect(first.entry.id).not.toBe(second.entry.id);
    });
});

describe('activeRingSecrets', () => {
    it('decrypts every entry, oldest first, preserving ring order', () => {
        const first = mintRingSecret();
        const second = mintRingSecret();
        const ring: WebhookSecretRingEntry[] = [first.entry, second.entry];

        expect(activeRingSecrets(ring)).toEqual([first.plaintext, second.plaintext]);
    });

    it('is empty for an empty ring', () => {
        expect(activeRingSecrets([])).toEqual([]);
    });
});

describe('removeRingSecret', () => {
    it('drops exactly the entry named by id', () => {
        const first = mintRingSecret();
        const second = mintRingSecret();
        const ring: WebhookSecretRingEntry[] = [first.entry, second.entry];

        expect(removeRingSecret(ring, first.entry.id)).toEqual([second.entry]);
    });

    it('is a no-op when the id is not in the ring', () => {
        const first = mintRingSecret();
        const ring: WebhookSecretRingEntry[] = [first.entry];

        expect(removeRingSecret(ring, 'not-a-real-id')).toEqual(ring);
    });
});
