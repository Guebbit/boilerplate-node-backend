/**
 * Secret-ring encryption at rest and the ring operations built on it — see `../../secrets.ts`.
 * `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY` is set for every suite in `tests/support/setup-environment.ts`. The
 * crypto and version-mismatch behaviour itself is `versioned-secret.ts`'s, tested once in
 * `tests/unit/infrastructure/security/versioned-secret.test.ts` — this just holds the wiring.
 */

import {
    encryptRingSecret,
    decryptRingSecret,
    mintRingSecret,
    activeRingSecrets,
    liveRingEntries,
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

/** A minted entry stamped at a chosen instant, so expiry can be tested without waiting. */
const mintedAt = (at: Date) => {
    const minted = mintRingSecret();
    return { ...minted, entry: { ...minted.entry, createdAt: at } };
};

describe('the overlap window', () => {
    const hour = 3_600_000;
    const t0 = new Date('2026-10-06T00:00:00.000Z');

    it('keeps a superseded secret signing inside the 24-hour default', () => {
        const old = mintedAt(t0);
        const fresh = mintedAt(new Date(t0.getTime() + hour));
        const now = new Date(t0.getTime() + 24 * hour);

        expect(activeRingSecrets([old.entry, fresh.entry], now)).toEqual([
            old.plaintext,
            fresh.plaintext
        ]);
    });

    it('stops signing with it once its successor has been live for the window', () => {
        const old = mintedAt(t0);
        const fresh = mintedAt(new Date(t0.getTime() + hour));
        const now = new Date(t0.getTime() + 25 * hour);

        expect(activeRingSecrets([old.entry, fresh.entry], now)).toEqual([fresh.plaintext]);
        expect(liveRingEntries([old.entry, fresh.entry], now)).toEqual([fresh.entry]);
    });

    it('never expires the newest secret, however old', () => {
        const only = mintedAt(t0);

        expect(liveRingEntries([only.entry], new Date(t0.getTime() + 1000 * hour))).toEqual([
            only.entry
        ]);
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
