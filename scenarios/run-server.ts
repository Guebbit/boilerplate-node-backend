#!/usr/bin/env tsx
/**
 * The demo profile: the real API, self-contained and disposable — `npm run demo`.
 *
 * Boots the actual application against an in-memory MongoDB, seeds it from the `shop` scenario
 * (`@scenarios/index`'s registry), and serves on `NODE_PORT`. No Docker, no Redis, no broker —
 * cache and queue run `disabled`, which is a supported deployment shape.
 *
 * This is what the paired frontend's dev server and e2e suite run against instead of a hand-written
 * mock. Calls `enableDemoProfile()` in-process below, which additionally mounts the control
 * surface in `src/app/demo.ts` — no environment variable can do that on its own.
 *
 * Several instances can run side by side, each owning its own in-memory Mongo:
 *
 *   NODE_PORT=3101 npm run demo
 *
 * Point `NODE_TEST_MONGO_URI` at a compose Mongo instead and the shop persists across restarts —
 * see `startEphemeralMongo`. Several instances then share that one database, which several
 * in-memory instances never did; do not combine the two without meaning to.
 *
 * See: docs/tools/demo-profile.md
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseDotenv } from 'dotenv';
import { enableDemoProfile } from '@infrastructure/runtime/demo-profile';
import { registerOAuthProvider } from '@modules/account/oauth/providers';
import { fakeOAuthProvider } from '@modules/account/oauth/providers/fake';
import { startEphemeralMongo } from './support/ephemeral-mongo';
import { startInProcessMongod } from './support/ephemeral-mongod';
import { DEMO_BANK_TRANSFER, SCRIPTED_RATE_LIMITS } from './rate-limits';

/**
 * `.env`'s own `NODE_CORS_ORIGIN`, read in isolation — never `import 'dotenv/config'` here: that
 * would load every OTHER key too, and `.env`'s real rate limits and token secrets are exactly
 * what `REQUIRED_DEFAULTS`/`SCRIPTED_RATE_LIMITS` below exist to override for this throwaway
 * profile. `dotenv.parse` only reads the file into a plain object — no `process.env` write — so
 * this borrows just the one value a lane's non-default frontend ports actually need.
 * https://github.com/motdotla/dotenv#parse
 * @returns the file's `NODE_CORS_ORIGIN`, or `undefined` when `.env` is missing or doesn't set it
 */
const corsOriginFromDotenv = (): string | undefined => {
    const environmentPath = path.join(process.cwd(), '.env');
    try {
        return parseDotenv(readFileSync(environmentPath, 'utf8')).NODE_CORS_ORIGIN;
    } catch {
        // No `.env` in this checkout — REQUIRED_DEFAULTS' own fallback below covers it.
        return undefined;
    }
};

const REQUIRED_DEFAULTS: Record<string, string> = {
    NODE_ENV: 'development',
    // Loopback only: this profile's tokens are signed with a public, hard-coded secret, and its
    // control surface wipes the database on request — every interface would hand both to anyone
    // on the LAN. `NODE_HOST=0.0.0.0 npm run demo` overrides it, the same way as `NODE_PORT`
    // above, for the rare case of reaching it from another device.
    NODE_HOST: '127.0.0.1',
    // Real secrets guard real tokens; a demo signs throwaway tokens for a throwaway database.
    NODE_TOKEN_ACCESS: 'demo-access-secret',
    NODE_TOKEN_REFRESH: 'demo-refresh-secret',
    // Same for the at-rest encryption keys: the seed writes address-book PII, and a key ring with
    // no key cannot encrypt it — a checkout with no `.env` (every CI runner) died seeding.
    NODE_PII_ENCRYPTION_KEY: 'demo-pii-encryption-key',
    NODE_TOTP_ENCRYPTION_KEY: 'demo-totp-encryption-key',
    NODE_WEBHOOK_SECRET_ENCRYPTION_KEY: 'demo-webhook-secret-encryption-key',
    // `orders`' and `products`' own boot-time requirements (SK-08) — `assertRequiredConfig` no
    // longer exempts this profile, so it satisfies the gate the ordinary way, with the same
    // values `.env-example` ships for a plain developer checkout.
    NODE_SHOP_COUNTRY: 'IT',
    NODE_VAT_RATE_DEFAULT: '0.22',
    NODE_VAT_RATE_REDUCED: '0.10',
    // `.env`'s own value when it sets one — a lane pointed at non-default frontend ports (to
    // avoid clashing with another lane's live e2e) is respected instead of silently overridden.
    // Falls back to both standard local frontend ports: the dev server (8080) and the e2e preview
    // (8085). Without the second, a browser on the preview is refused by CORS while every
    // Node-side call passes.
    NODE_CORS_ORIGIN: corsOriginFromDotenv() ?? 'http://localhost:8080,http://localhost:8085',
    // The e2e suite is not a person browsing, and neither is the seeder behind it — see
    // `./rate-limits`, which `scenarios/apply.ts` needs for the same reason.
    ...SCRIPTED_RATE_LIMITS,
    ...DEMO_BANK_TRANSFER
};

/**
 * External services have no place here — force-disable whatever the shell happens to carry.
 *
 * Blanked, not deleted: `src/app.ts` imports `dotenv/config`, which loads `.env` into
 * `process.env` for every key `.env` sets and the SHELL had not already set — deleting a key
 * would leave the shell's own version absent too, but `.env`'s compose hostname would come right
 * back the moment the shell hadn't set one. `dotenv` never overrides a key that is already
 * PRESENT, empty string included, so setting one to `''` is what actually sticks. Every reader
 * checked treats an empty string as unset (`if (process.env.NODE_REDIS_URL)`, `!process.env.NODE_REDIS_PORT`).
 */
const FORCED_ABSENT = [
    'NODE_REDIS_URL',
    'NODE_REDIS_HOST',
    'NODE_REDIS_PORT',
    'NODE_RABBITMQ_URL',
    'NODE_RABBITMQ_HOST',
    'NODE_RABBITMQ_PORT'
];

/**
 * Unlike {@link REQUIRED_DEFAULTS}, which only fills a key a `.env` left blank, this OVERRIDES
 * one unconditionally — the same mechanism {@link FORCED_ABSENT} uses, for a setting that is not
 * a preference this profile lets a copied `.env` express (SK-08). `GET /__test/emails` is the
 * paired e2e suite's only way to read a reset token, so a `.env` naming `smtp` must not quietly
 * empty it — `mailer.ts#resolveMailTransport` no longer knows this profile exists at all, so the
 * guarantee has to live here instead, exactly the way it forces external services off below.
 */
const FORCED_MAIL_TRANSPORT = 'outbox';

/**
 * Poll `GET /` until the server answers, the same signal the paired frontend's shard runner waits
 * on (`start-server-and-test http-get://…`). Accurate as a "ready" check specifically because
 * `createApp().start()` seeds BEFORE it starts listening — see `src/app.ts` — so a successful
 * response here means the database holds the scenario already, not just that a socket is open.
 */
const waitUntilListening = (port: string): Promise<void> => {
    const url = `http://localhost:${port}/`;
    const startedAt = Date.now();
    const poll = (): Promise<void> =>
        fetch(url).then(
            () => undefined,
            (error: unknown) => {
                if (Date.now() - startedAt > 60_000)
                    throw new Error('demo: server never started listening', { cause: error });
                return new Promise((resolve) => setTimeout(resolve, 100)).then(poll);
            }
        );
    return poll();
};

startEphemeralMongo({ startInProcess: startInProcessMongod })
    .then((mongo) => {
        // The consumers of this profile end it with a signal — the paired frontend's shard runner
        // and `start-server-and-test` both send SIGTERM. Without this, the process dies and an
        // in-memory instance's data directory stays behind under the temp dir (~200 MB per boot);
        // `stop()` is the only thing that removes it. A no-op on the external-Mongo path.
        for (const signal of ['SIGTERM', 'SIGINT'] as const)
            process.once(signal, () => {
                void mongo
                    .stop()
                    .catch((error: unknown) => {
                        // Still exits either way — a stuck data directory left behind (~200 MB) is
                        // a cleanup annoyance, not a reason to hang the shutdown a signal asked for.
                        console.error('[demo] failed to stop the ephemeral mongod:', error);
                    })
                    .then(() => process.exit(0));
            });

        for (const [key, value] of Object.entries(REQUIRED_DEFAULTS))
            process.env[key] = process.env[key]?.trim() ? process.env[key] : value;
        for (const key of FORCED_ABSENT) process.env[key] = '';
        process.env.NODE_MAIL_TRANSPORT = FORCED_MAIL_TRANSPORT;

        // Always the `demo` database, regardless of source: a stable name is what lets the
        // external-Mongo path (`NODE_TEST_MONGO_URI`) persist across restarts instead of scattering
        // across a freshly named database every boot.
        const databaseUri = new URL(mongo.uri);
        databaseUri.pathname = '/demo';
        process.env.NODE_DB_URI = databaseUri.toString();
        // Always derived, never defaulted-when-unset like the block above: a checked-in `.env`'s
        // `NODE_URL` names the SINGLE-instance developer setup (:3000), and this profile's whole
        // point is several instances on several ports (see this file's own module doc) — the
        // OAuth redirect_uri and emailed password-reset/verify links (`emails.ts`) both build off
        // `NODE_URL`, so a stale value here means those links point at the wrong instance instead
        // of this one, on every port but the default.
        process.env.NODE_URL = `http://localhost:${process.env.NODE_PORT ?? '3000'}/`;

        // The only call site in the whole codebase, on purpose: no copied `.env` can mount the
        // control surface on a host that isn't this one.
        enableDemoProfile();

        // This profile's own OAuth identity provider (SK-08) — production's registry seeds none,
        // so a Cypress spec clicking "Continue with Google" needs this profile to put one there
        // itself, the same composition `Mail::fake()` does in Laravel.
        registerOAuthProvider('fake', () => fakeOAuthProvider);

        // Import AFTER the environment is shaped. `createApp()` (SK-D2) builds the app; its own
        // `start()` seeds `shop` (via `restoreScenario`, since `enableDemoProfile()` above turned
        // the demo profile on) before it starts listening.
        const port = process.env.NODE_PORT ?? '3000';
        return import('../src/app')
            .then(({ createApp }) => createApp().start())
            .then(() => waitUntilListening(port))
            .then(() => {
                console.log(`[demo] API listening on :${port} — seeded, cache/queue disabled.`);
            });
    })
    .catch((error: unknown) => {
        console.error('[demo] failed to boot:', error);
        process.exit(1);
    });
