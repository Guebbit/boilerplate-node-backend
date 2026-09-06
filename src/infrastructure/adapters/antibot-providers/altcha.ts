/**
 * @module
 * The self-hosted option behind the human-challenge port: ALTCHA, a proof-of-work challenge this
 * server issues and verifies itself. No vendor, no third-party script, no traffic leaving the
 * deployment — the reason to pick it over `turnstile`. The cost is that the work runs on the
 * visitor's device, which taxes an honest phone harder than a rented server.
 */

import { createChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { verify } from 'altcha-lib/frameworks/shared';
import type { HumanChallengeProvider, HumanVerdict } from './index';
import { altchaStore } from './altcha-store';
import type { AntibotChallenge } from '@types';

/**
 * PBKDF2 rather than Argon2id: it runs on WebCrypto everywhere, while Argon2 is native only on
 * Node 24.7+ and absent on Bun and Deno. A boilerplate should start on the portable one.
 * https://github.com/altcha-org/altcha-lib/blob/main/docs/algorithms.md
 */
const ALGORITHM = 'PBKDF2/SHA-256';

/** Iteration count the solver must work through, and the dial a deployment turns. */
const DEFAULT_COST = 100_000;

/** How long a challenge stays solvable, in seconds. */
const TTL_SECONDS = 300;

/**
 * The HMAC secret challenge signatures are built on — its own secret, so rotating a login secret
 * never invalidates an in-flight challenge or the reverse.
 *
 * @throws {Error} when the provider is selected without one: an unsigned challenge would let a
 *   caller mint itself a trivial one.
 */
const signatureSecret = (): string => {
    const secret = process.env.NODE_ANTIBOT_ALTCHA_SECRET ?? '';
    if (secret.length < 16)
        throw new Error('NODE_ANTIBOT_PROVIDER is altcha but its secret is unset or too short.');
    return secret;
};

/** Higher taxes a bot's CPU and an honest visitor's alike — raise it only as far as abuse justifies. */
const cost = (): number =>
    Number.parseInt(process.env.NODE_ANTIBOT_ALTCHA_COST ?? '', 10) || DEFAULT_COST;

/**
 * altcha-lib: build a signed challenge for the widget to solve. `expiresAt` is what makes a stale
 * challenge unusable; `cost` is how much work solving it takes.
 * https://github.com/altcha-org/altcha-lib#createchallenge
 */
const issue = (): Promise<AntibotChallenge> =>
    createChallenge({
        algorithm: ALGORITHM,
        cost: cost(),
        deriveKey,
        expiresAt: new Date(Date.now() + TTL_SECONDS * 1000),
        hmacSignatureSecret: signatureSecret()
    }).then((challenge) => ({
        parameters: challenge.parameters,
        signature: challenge.signature ?? ''
    }));

/**
 * altcha-lib: verify the payload the widget returns — signature, expiry, the work itself, and
 * single-use via the store. `verified` is only true when every one of those passed.
 * https://github.com/altcha-org/altcha-lib#verifysolution
 */
const check = (payload: string): Promise<HumanVerdict> =>
    // `signatureSecret`'s throw has to happen INSIDE the chain: raised while evaluating an
    // argument it would escape synchronously, past the `.catch` that makes a broken deployment
    // refuse callers rather than 500 at them.
    Promise.resolve()
        .then(() => verify(payload, deriveKey, signatureSecret(), undefined, altchaStore))
        .then((result) => (result.verification?.verified === true ? 'human' : 'refused'));

/** ALTCHA behind the port: this server issues the challenge and verifies the solution. */
export const altchaProvider: HumanChallengeProvider = {
    name: 'altcha',
    // The widget needs no key — it is told where to fetch a challenge, and that route is ours.
    publicParameters: () => ({ challengeUrl: '/antibot/challenge' }),
    issueChallenge: issue,
    verify: (token) => check(token).catch(() => 'refused' as HumanVerdict)
};
