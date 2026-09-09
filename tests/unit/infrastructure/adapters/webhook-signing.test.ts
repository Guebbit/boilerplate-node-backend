/**
 * `webhook-signing.ts` against the Standard Webhooks specification itself, not just its own
 * output — the vector below is copied verbatim from the spec reference implementation's own
 * `"sign function works"` test case, in https://github.com/standard-webhooks/standard-webhooks,
 * so a byte-for-byte match here is a claim about interoperability, not merely internal consistency.
 */

import {
    signWebhookPayload,
    verifyWebhookSignature
} from '@infrastructure/adapters/webhook-signing';

describe('signWebhookPayload — against the spec published test vector', () => {
    it('reproduces the reference implementation output exactly', () => {
        const { headers } = signWebhookPayload({
            id: 'msg_p5jXN8AQM9LWM0D4loKWxJek',
            timestamp: 1_614_265_330,
            body: '{"test": 2432232314}',
            secrets: ['whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw']
        });

        expect(headers['webhook-id']).toBe('msg_p5jXN8AQM9LWM0D4loKWxJek');
        expect(headers['webhook-timestamp']).toBe('1614265330');
        expect(headers['webhook-signature']).toBe(
            'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE='
        );
    });

    it('accepts a secret with no whsec_ prefix and signs identically', () => {
        // Same key bytes either way — the prefix is stripped, never part of what is decoded.
        const { headers } = signWebhookPayload({
            id: 'msg_p5jXN8AQM9LWM0D4loKWxJek',
            timestamp: 1_614_265_330,
            body: '{"test": 2432232314}',
            secrets: ['MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw']
        });

        expect(headers['webhook-signature']).toBe(
            'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE='
        );
    });

    it('signs a Buffer body identically to the same bytes as a string', () => {
        const fromString = signWebhookPayload({
            id: 'msg_p5jXN8AQM9LWM0D4loKWxJek',
            timestamp: 1_614_265_330,
            body: '{"test": 2432232314}',
            secrets: ['whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw']
        });
        const fromBuffer = signWebhookPayload({
            id: 'msg_p5jXN8AQM9LWM0D4loKWxJek',
            timestamp: 1_614_265_330,
            body: Buffer.from('{"test": 2432232314}', 'utf8'),
            secrets: ['whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw']
        });

        expect(fromBuffer.headers['webhook-signature']).toBe(
            fromString.headers['webhook-signature']
        );
    });
});

describe('verifyWebhookSignature — round-tripping signWebhookPayload', () => {
    const secret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';

    it('accepts its own signature, over the exact bytes signed', () => {
        const id = 'msg_p5jXN8AQM9LWM0D4loKWxJek';
        const timestamp = Math.floor(Date.now() / 1000);
        const body = '{"a":1}';
        const { headers } = signWebhookPayload({ id, timestamp, body, secrets: [secret] });

        expect(
            verifyWebhookSignature({
                id,
                timestamp,
                body,
                signatureHeader: headers['webhook-signature'],
                secrets: [secret]
            })
        ).toBe(true);
    });

    it('rejects an empty payload signed for a different one — verification is over the raw body, not re-serialized JSON', () => {
        const id = 'msg_p5jXN8AQM9LWM0D4loKWxJek';
        const timestamp = Math.floor(Date.now() / 1000);
        const { headers } = signWebhookPayload({ id, timestamp, body: '', secrets: [secret] });

        expect(
            verifyWebhookSignature({
                id,
                timestamp,
                body: 'not the same bytes',
                signatureHeader: headers['webhook-signature'],
                secrets: [secret]
            })
        ).toBe(false);
    });

    it('rejects a tampered signature value', () => {
        const id = 'msg_p5jXN8AQM9LWM0D4loKWxJek';
        const timestamp = Math.floor(Date.now() / 1000);
        const body = '{"a":1}';

        expect(
            verifyWebhookSignature({
                id,
                timestamp,
                body,
                signatureHeader: 'v1,dGhpcyBpcyBub3QgYSByZWFsIHNpZ25hdHVyZQ==',
                secrets: [secret]
            })
        ).toBe(false);
    });

    it('rejects a missing signature header outright', () => {
        expect(
            verifyWebhookSignature({
                id: 'msg_1',
                timestamp: Math.floor(Date.now() / 1000),
                body: '{}',
                signatureHeader: undefined,
                secrets: [secret]
            })
        ).toBe(false);
    });

    it('rejects a timestamp outside the tolerance window, before and after now', () => {
        const id = 'msg_1';
        const body = '{}';
        const tooOld = Math.floor(Date.now() / 1000) - 400;
        const tooNew = Math.floor(Date.now() / 1000) + 400;

        const old = signWebhookPayload({ id, timestamp: tooOld, body, secrets: [secret] });
        const future = signWebhookPayload({ id, timestamp: tooNew, body, secrets: [secret] });

        expect(
            verifyWebhookSignature({
                id,
                timestamp: tooOld,
                body,
                signatureHeader: old.headers['webhook-signature'],
                secrets: [secret],
                toleranceSeconds: 300
            })
        ).toBe(false);
        expect(
            verifyWebhookSignature({
                id,
                timestamp: tooNew,
                body,
                signatureHeader: future.headers['webhook-signature'],
                secrets: [secret],
                toleranceSeconds: 300
            })
        ).toBe(false);
    });

    it('honours a wider configured tolerance', () => {
        const id = 'msg_1';
        const body = '{}';
        const timestamp = Math.floor(Date.now() / 1000) - 400;
        const { headers } = signWebhookPayload({ id, timestamp, body, secrets: [secret] });

        expect(
            verifyWebhookSignature({
                id,
                timestamp,
                body,
                signatureHeader: headers['webhook-signature'],
                secrets: [secret],
                toleranceSeconds: 3600
            })
        ).toBe(true);
    });
});

describe('a secret ring rotation — two active secrets, one header', () => {
    const oldSecret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
    const newSecret = 'whsec_c2NyYXRjaC1wb3N0LW91dC1vZi1zdG9jay1zZWNyZXQ=';

    it('signs with every ring secret, space-separated, each independently verifiable', () => {
        const id = 'msg_rotate';
        const timestamp = Math.floor(Date.now() / 1000);
        const body = '{"rotate":true}';

        const { headers } = signWebhookPayload({
            id,
            timestamp,
            body,
            secrets: [oldSecret, newSecret]
        });

        // Two `v1,...` entries, space-separated — the Standard Webhooks mechanism for a rotation.
        expect(headers['webhook-signature'].split(' ')).toHaveLength(2);

        // A consumer that has switched to the new secret still verifies …
        expect(
            verifyWebhookSignature({
                id,
                timestamp,
                body,
                signatureHeader: headers['webhook-signature'],
                secrets: [newSecret]
            })
        ).toBe(true);
        // … and one that has not yet switched still verifies too, during the overlap.
        expect(
            verifyWebhookSignature({
                id,
                timestamp,
                body,
                signatureHeader: headers['webhook-signature'],
                secrets: [oldSecret]
            })
        ).toBe(true);
    });

    it('fails once the old secret is fully removed from the ring', () => {
        const id = 'msg_rotate_done';
        const timestamp = Math.floor(Date.now() / 1000);
        const body = '{"rotate":"done"}';

        const { headers } = signWebhookPayload({ id, timestamp, body, secrets: [newSecret] });

        expect(
            verifyWebhookSignature({
                id,
                timestamp,
                body,
                signatureHeader: headers['webhook-signature'],
                secrets: [oldSecret]
            })
        ).toBe(false);
    });
});
