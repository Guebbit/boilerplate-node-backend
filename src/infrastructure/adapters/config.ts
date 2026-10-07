/**
 * @module
 * The adapters' configuration: mail, the broker, Redis, images, PDF rendering, templates and the
 * anti-abuse ladder. One slice per adapter, so a bad value names the adapter it belongs to.
 *
 * Selector variables (`NODE_ANTIBOT_PROVIDER`) are plain text here: the set of valid names lives
 * in the provider registry, which imports this file. The registry's own resolver refuses an
 * unknown name, and the app tier probes it at boot (`app/config.ts`).
 *
 * See: docs/tools/configuration.md
 */

import path from 'node:path';
import { defineConfig } from '@infrastructure/config/define';
import { choice, csv, flag, int, text } from '@infrastructure/config/fields';

/**
 * SMTP hosts a live e2e run may dial: this machine, or the compose `mailpit` service.
 * Anything else is a real mail server.
 */
const E2E_LOCAL_SMTP_HOSTS: readonly string[] = ['localhost', '127.0.0.1', '::1', 'mailpit'];

/** The mailer's companions to `NODE_SMTP_HOST` — what a transport cannot authenticate without. */
const SMTP_COMPANIONS = ['NODE_SMTP_USER', 'NODE_SMTP_PASS', 'NODE_SMTP_SENDER'] as const;

/** Mail: which transport, and the SMTP account behind the `smtp` one. */
export const mailConfig = defineConfig({
    name: 'mail',
    shape: {
        NODE_MAIL_TRANSPORT: text({ default: 'smtp', case: 'lower' }),
        NODE_SMTP_HOST: text(),
        NODE_SMTP_PORT: int({ default: 587, min: 1, max: 65_535 }),
        NODE_SMTP_NAME: text(),
        NODE_SMTP_USER: text(),
        NODE_SMTP_PASS: text({ sensitive: true }),
        NODE_SMTP_SENDER: text(),
        NODE_E2E_RUN: flag({ default: false })
    },
    check: (config) => [
        // Selecting an SMTP host without its credentials builds a transport that only fails when
        // the first user asks for a reset link.
        ...(config.NODE_SMTP_HOST ? SMTP_COMPANIONS.filter((key) => !config[key]) : []),
        ...(config.NODE_E2E_RUN &&
        config.NODE_MAIL_TRANSPORT === 'smtp' &&
        !E2E_LOCAL_SMTP_HOSTS.includes(config.NODE_SMTP_HOST ?? '')
            ? [
                  `NODE_SMTP_HOST=${config.NODE_SMTP_HOST ?? '(unset)'} is not a local mail sink; an e2e run allows only ${E2E_LOCAL_SMTP_HOSTS.join(', ')} (or NODE_MAIL_TRANSPORT=log)`
              ]
            : [])
    ]
});

/** Where a spooled attachment waits. */
export const mailFilesConfig = defineConfig({
    name: 'mail-files',
    shape: {
        NODE_MAIL_SPOOL_PATH: text({ default: path.join('tmp', 'storage', 'mail-spool') }),
        NODE_MAIL_SPOOL_RETENTION_HOURS: int({ default: 1, min: 1 })
    }
});

/** RabbitMQ: the connection, and the retry policy every queue inherits. */
export const queueConfig = defineConfig({
    name: 'queue',
    shape: {
        NODE_RABBITMQ_URL: text({ sensitive: true }),
        NODE_RABBITMQ_HOST: text({ default: '127.0.0.1' }),
        NODE_RABBITMQ_PORT: int({ min: 1, max: 65_535 }),
        NODE_RABBITMQ_USER: text({ default: 'guest' }),
        NODE_RABBITMQ_PASSWORD: text({ default: 'guest', sensitive: true }),
        NODE_RABBITMQ_ENABLED: flag({ default: true }),
        NODE_QUEUE_MAX_ATTEMPTS: int({ default: 5, min: 1 }),
        NODE_QUEUE_RETRY_DELAY_SECONDS: int({ default: 30, min: 1 })
    }
});

/** Redis: the connection shared by the cache and the rate limiter, and the cache's own switches. */
export const redisConfig = defineConfig({
    name: 'redis',
    shape: {
        NODE_REDIS_URL: text({ sensitive: true }),
        NODE_REDIS_PASSWORD: text({ sensitive: true }),
        NODE_REDIS_HOST: text({ default: '127.0.0.1' }),
        NODE_REDIS_PORT: int({ min: 1, max: 65_535 }),
        NODE_REDIS_CACHE_PREFIX: text({ default: 'boilerplate-node-backend' }),
        NODE_REDIS_CACHE_ENABLED: flag({ default: true })
    }
});

/** Image processing limits and where uploads land. */
export const imageConfig = defineConfig({
    name: 'images',
    shape: {
        NODE_IMAGE_MAX_INPUT_PIXELS: int({ default: 50_000_000, min: 1 }),
        NODE_IMAGE_MAX_DIMENSION: int({ default: 2048, min: 1 }),
        NODE_IMAGE_THUMBNAIL_DIMENSION: int({ default: 320, min: 1 }),
        NODE_PUBLIC_PATH: text({ default: 'public' }),
        NODE_QUARANTINE_RETENTION_HOURS: int({ default: 24, min: 1 }),
        NODE_QUARANTINE_PATH: text({ default: path.join('tmp', 'quarantine') })
    }
});

/** Outbound requests this server makes on a caller-supplied URL (webhooks, remote images). */
export const outboundConfig = defineConfig({
    name: 'outbound',
    shape: {
        NODE_OUTBOUND_ALLOWED_PORTS: csv()
    },
    check: (config) =>
        config.NODE_OUTBOUND_ALLOWED_PORTS.filter(
            (port) => !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65_535
        ).map((port) => `NODE_OUTBOUND_ALLOWED_PORTS has ${port}, which is not a port number`)
});

/** PDF rendering. */
export const pdfConfig = defineConfig({
    name: 'pdf',
    shape: {
        PUPPETEER_EXECUTABLE_PATH: text({ default: '/usr/bin/chromium-browser' }),
        NODE_DOCUMENT_STORE_PATH: text({ default: path.join('tmp', 'storage', 'documents') })
    }
});

/** The private store a built personal-data export is kept in until it is downloaded or expires. */
export const exportStoreConfig = defineConfig({
    name: 'exportStore',
    shape: {
        NODE_ACCOUNT_EXPORT_STORE_PATH: text({ default: path.join('tmp', 'storage', 'exports') })
    }
});

/** The shortest HMAC secret an ALTCHA challenge may be signed with, in characters. */
export const ALTCHA_SECRET_MIN_LENGTH = 16;

/** The anti-abuse ladder: email policy, and the human-challenge provider with its credentials. */
export const antibotConfig = defineConfig({
    name: 'antibot',
    shape: {
        NODE_ANTIBOT_PROVIDER: text({ default: 'none', case: 'lower' }),
        NODE_ANTIBOT_EMAIL_POLICY: choice(['off', 'disposable', 'mx'], { default: 'off' }),
        NODE_ANTIBOT_EMAIL_ALLOWLIST: csv({ case: 'lower' }),
        NODE_ANTIBOT_EMAIL_DENYLIST_EXTRA: csv({ case: 'lower' }),
        NODE_ANTIBOT_ALTCHA_SECRET: text({ sensitive: true }),
        NODE_ANTIBOT_ALTCHA_COST: int({ default: 100_000, min: 1 }),
        NODE_ANTIBOT_TURNSTILE_SITE_KEY: text(),
        NODE_ANTIBOT_TURNSTILE_SECRET: text({ sensitive: true })
    },
    check: (config) => {
        // Selecting a provider is a choice; selecting one without its secret is not. It would
        // throw on the first guarded request — a signup outage that reads as a bug.
        if (config.NODE_ANTIBOT_PROVIDER === 'altcha')
            return (config.NODE_ANTIBOT_ALTCHA_SECRET ?? '').length < ALTCHA_SECRET_MIN_LENGTH
                ? ['NODE_ANTIBOT_ALTCHA_SECRET']
                : [];
        if (config.NODE_ANTIBOT_PROVIDER === 'turnstile')
            return [
                ...(config.NODE_ANTIBOT_TURNSTILE_SITE_KEY
                    ? []
                    : ['NODE_ANTIBOT_TURNSTILE_SITE_KEY']),
                ...(config.NODE_ANTIBOT_TURNSTILE_SECRET ? [] : ['NODE_ANTIBOT_TURNSTILE_SECRET'])
            ];
        return [];
    }
});
