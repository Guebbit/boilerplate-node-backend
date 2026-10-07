#!/usr/bin/env tsx
/**
 * The demo profile: the real API, self-contained and disposable — `npm run demo`.
 *
 * Boots the actual application against an in-memory MongoDB, seeds it from the `shop` scenario
 * (`@scenarios/index`'s registry), and serves on `NODE_PORT`. No Docker, no Redis, no broker —
 * cache and queue run `disabled`, which is a supported deployment shape.
 *
 * This is what the paired frontend's dev server and e2e suite run against instead of a hand-written
 * mock. Hands `createApp` an extension (`./support/demo`) that additionally mounts the control
 * surface and builds the first scenario before listening — no environment variable can do that on
 * its own, and nothing under `src/` knows it exists.
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
// Before any model loads: Mongoose defaults are read at schema build.
import '@infrastructure/runtime/mongoose-boot';
import { currentEnvironment, installEnvironment } from '@infrastructure/config/store';
import { installDemoClock, registerDemoClock } from './support/demo-clock';
import { startEphemeralMongo } from './support/ephemeral-mongo';
import { startInProcessMongod } from './support/ephemeral-mongod';
import { DEMO_BANK_TRANSFER, SCRIPTED_RATE_LIMITS } from './rate-limits';

/**
 * `.env` read in isolation — never `import 'dotenv/config'` here: that would load every key, and
 * `.env`'s real rate limits and token secrets are exactly what `REQUIRED_DEFAULTS`/
 * `SCRIPTED_RATE_LIMITS` below exist to override for this throwaway profile. `dotenv.parse` only
 * reads the file into a plain object, with no `process.env` write.
 * https://github.com/motdotla/dotenv#parse
 * @returns the file's keys, or an empty object when `.env` is missing
 */
const dotenvValues = (): Partial<Record<string, string>> => {
    const environmentPath = path.join(process.cwd(), '.env');
    try {
        return parseDotenv(readFileSync(environmentPath, 'utf8'));
    } catch {
        // No `.env` in this checkout — REQUIRED_DEFAULTS' own fallback below covers it.
        return {};
    }
};

/**
 * A variable the SHELL set, as opposed to one `.env` supplied.
 *
 * `development-doubles` has already loaded `.env` into `process.env`, so a `.env` copied from
 * `.env-example` (every budget at its human default, a placeholder webhook secret) looks like a
 * shell choice. A value equal to the file's own is that copy and does not count; a different one
 * was set by the caller (the antibot run pins a small login budget on purpose) and does.
 * @param key - the variable
 * @returns the shell's value, or `undefined` when it set none
 */
const shellValue = (key: string): string | undefined => {
    const current = process.env[key]?.trim();
    return current && current !== dotenvValues()[key] ? current : undefined;
};

/**
 * Environment values this profile sets when the shell and `.env` give none: enough for a bare
 * checkout (every CI runner) to boot. Throwaway secrets, loopback host, known demo keys.
 */
const REQUIRED_DEFAULTS: Record<string, string> = {
    NODE_ENV: 'development',
    // Loopback only: this profile's tokens are signed with a public, hard-coded secret, and its
    // control surface wipes the database on request — every interface would hand both to anyone
    // on the LAN. `NODE_HOST=0.0.0.0 npm run demo` overrides it, the same way as `NODE_PORT`
    // above, for the rare case of reaching it from another device.
    NODE_HOST: '127.0.0.1',
    // Real secrets guard real tokens; a demo signs throwaway tokens for a throwaway database.
    // Public, throwaway, 32-byte hex: the boot check refuses anything shorter or not hex/base64.
    NODE_TOKEN_ACCESS: '644fdac9f3bfa73cb8631497e4db1ebded912c7145e4a3ac63d79a46009c7dc1',
    NODE_TOKEN_REFRESH: 'be6d19cc08ee1fd32e2edb158e250e51b70dd1cc1ba3e5e4c7e3350e33f8299f',
    // Same for the at-rest encryption keys: the seed writes address-book PII, and a key ring with
    // no key cannot encrypt it — a checkout with no `.env` (every CI runner) died seeding.
    NODE_PII_ENCRYPTION_KEY: '0de7cfab8ea0f3676609c67a34b42cee6355e7e72c8a51e30d66633e60529dc9',
    NODE_TOTP_ENCRYPTION_KEY: '371235f9725b90a6a87b6b9877e29313e804682717b699e1264bd816973f5769',
    NODE_WEBHOOK_SECRET_ENCRYPTION_KEY:
        'f0affe382aa45708b641b8274977884f2b6e0041de1f7c639cdfcd8ab77a1444',
    // Known, so the paired e2e suite can sign a payment-provider delivery (`POST /payments/webhook`)
    // itself; the frontend's `paymentWebhookSecret` carries the same value.
    NODE_PAYMENT_WEBHOOK_SECRET: 'demo-payment-webhook-secret',
    // The mailbox a contact request is notified to falls back to the sender; with none, the
    // operator's mail is never queued and the e2e that reads it can only fail.
    NODE_SMTP_SENDER: 'Demo Shop <noreply@example.com>',
    // `orders`' and `products`' own boot-time requirements — `assertModuleConfig` gates this
    // profile too, so it satisfies the gate the ordinary way, with the same values `.env-example`
    // ships for a plain developer checkout.
    NODE_SHOP_COUNTRY: 'IT',
    NODE_SHOP_LEGAL_NAME: 'Guebbit Demo Shop Srl',
    NODE_SHOP_STREET: 'Via Roma 1',
    NODE_SHOP_CITY: 'Milano',
    NODE_SHOP_ZIP: '20100',
    NODE_SHOP_EMAIL: 'shop@example.com',
    NODE_SHOP_PHONE: '+39 02 1234567',
    NODE_VAT_RATE_DEFAULT: '0.22',
    NODE_VAT_RATE_REDUCED: '0.10',
    // `.env`'s own value when it sets one — a lane pointed at non-default frontend ports (to
    // avoid clashing with another lane's live e2e) is respected instead of silently overridden.
    // Falls back to both standard local frontend ports: the dev server (8080) and the e2e preview
    // (8085). Without the second, a browser on the preview is refused by CORS while every
    // Node-side call passes.
    NODE_CORS_ORIGIN:
        dotenvValues().NODE_CORS_ORIGIN ?? 'http://localhost:8080,http://localhost:8085',
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
 * a preference this profile lets a copied `.env` express. `GET /__test/emails` is the
 * paired e2e suite's only way to read a reset token, so a `.env` naming `smtp` must not quietly
 * empty it — `mail-transports.ts#resolveMailTransport` does not know this profile exists at all, so the
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

/** Boot sequence: an ephemeral Mongo first, then the app on top of it. */
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

        // The shell's own value wins, read off the real `process.env` on purpose (a `.env` is not
        // loaded yet, so this is the shell and nothing else). Written to the config store, which
        // reads `process.env` once and would never see a later write.
        installEnvironment({
            ...Object.fromEntries(
                Object.entries(REQUIRED_DEFAULTS).map(([key, value]) => [
                    key,
                    shellValue(key) ?? value
                ])
            ),
            ...Object.fromEntries(FORCED_ABSENT.map((key) => [key, ''])),
            // The e2e suite is not a person browsing, and neither is the seeder behind it — see
            // `./rate-limits`; only a value the shell itself set survives.
            ...Object.fromEntries(
                Object.entries(SCRIPTED_RATE_LIMITS).map(([key, value]) => [
                    key,
                    shellValue(key) ?? value
                ])
            ),
            NODE_MAIL_TRANSPORT: FORCED_MAIL_TRANSPORT
        });

        // Always the `demo` database, regardless of source: a stable name is what lets the
        // external-Mongo path (`NODE_TEST_MONGO_URI`) persist across restarts instead of scattering
        // across a freshly named database every boot.
        const databaseUri = new URL(mongo.uri);
        databaseUri.pathname = '/demo';
        installEnvironment({ NODE_DB_URI: databaseUri.href });
        // Always derived, never defaulted-when-unset like the block above: a checked-in `.env`'s
        // `NODE_URL` names the SINGLE-instance developer setup (:3000), and this profile's whole
        // point is several instances on several ports (see this file's own module doc) — the
        // OAuth redirect_uri and emailed password-reset/verify links (`emails.ts`) both build off
        // `NODE_URL`, so a stale value here means those links point at the wrong instance instead
        // of this one, on every port but the default.
        installEnvironment({
            NODE_URL: `http://localhost:${currentEnvironment().NODE_PORT ?? '3000'}/`
        });

        // The movable clock behind `/__test/clock`. Installed before the app is imported, so every
        // module sees the fake `Date` from its first read; a time journey moves it, and the next
        // restore puts it back. See `scenarios/support/demo-clock.ts`.
        registerDemoClock(installDemoClock());

        // Import AFTER the environment is shaped: both load every module, and a model reads some
        // of it at import. `createApp()` builds the app with the demo extension; its own `start()`
        // seeds `shop` (the extension's `afterBoot`) before it starts listening.
        const port = currentEnvironment().NODE_PORT ?? '3000';
        return Promise.all([import('../src/app'), import('./support/demo')])
            .then(([{ createApp }, { installDemo, restoreScenario }]) =>
                createApp({
                    extension: { install: installDemo, afterBoot: () => restoreScenario() }
                }).start()
            )
            .then(() => waitUntilListening(port))
            .then(() => {
                console.log(`[demo] API listening on :${port} — seeded, cache/queue disabled.`);
            });
    })
    .catch((error: unknown) => {
        console.error('[demo] failed to boot:', error);
        process.exit(1);
    });
