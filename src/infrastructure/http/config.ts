/**
 * @module
 * The HTTP layer's configuration: this deployment's own addresses, the rate limiter's store, upload
 * limits, the response cache's bounds and the idempotency ledger's retention.
 *
 * See: docs/tools/configuration.md
 */

import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig } from '@infrastructure/config/define';
import { csv, int, text } from '@infrastructure/config/fields';
import type { RateLimitBudget } from '@types';

/** Where this deployment and its paired frontend live. */
export const siteConfig = defineConfig({
    name: 'site',
    shape: {
        NODE_URL: text({
            default: 'http://localhost:3000',
            required: { minLength: 1 }
        }),
        NODE_FRONTEND_URL: text({
            default: 'http://localhost:8080',
            // Required in a deployment, though the default stays for a developer: unset, every
            // reset, verify, delete and email-change link, and the OAuth landing page, would point
            // at `localhost` and the app's own flows would break. The check reads the raw
            // variable, so the default does not satisfy it.
            required: { minLength: 1, productionOnly: true }
        }),
        NODE_CORS_ORIGIN: csv({
            default: ['http://localhost:8080'],
            required: { minLength: 1, productionOnly: true }
        })
    }
});

/**
 * The rate limiter's shared window and the `limits` Redis it counts in. Per-budget limits are
 * generated from manifests.
 */
export const rateLimitConfig = defineConfig({
    name: 'rate-limit',
    shape: {
        NODE_RATE_LIMIT_WINDOW_MS: int({ default: 60_000, min: 1 }),
        NODE_RATE_LIMIT_REDIS_URL: text({ sensitive: true }),
        NODE_RATE_LIMIT_REDIS_PASSWORD: text({ sensitive: true }),
        NODE_RATE_LIMIT_REDIS_PREFIX: text({ default: 'rate-limit' })
    }
});

/** Upload staging and limits. */
export const uploadConfig = defineConfig({
    name: 'uploads',
    shape: {
        NODE_MAX_UPLOAD_BYTES: int({ default: 5 * 1024 * 1024, min: 1 }),
        NODE_UPLOAD_STAGING_PATH: text({ default: path.join(tmpdir(), 'node-api-uploads') }),
        NODE_PENDING_IMAGE_URL: text({ default: '/images/system/pending.png' }),
        NODE_PENDING_THUMBNAIL_URL: text({ default: '/images/system/pending-thumb.webp' })
    }
});

/** The response cache's bounds. */
export const responseCacheConfig = defineConfig({
    name: 'response-cache',
    shape: {
        NODE_REDIS_CACHE_DEV_TTL_MAX: int({ default: 30, min: 0 }),
        NODE_REDIS_CACHE_MAX_BYTES: int({ default: 256 * 1024, min: 1 })
    }
});

/** The idempotency ledger. */
export const idempotencyConfig = defineConfig({
    name: 'idempotency',
    shape: {
        NODE_IDEMPOTENCY_RETENTION_HOURS: int({ default: 24, min: 1 })
    }
});

/**
 * A slice of rate-limit budgets: one integer per budget, keyed by the variable it declares. The
 * data lives on the manifest (`AppModule.rateLimits`) or in `INFRASTRUCTURE_RATE_LIMITS`; this only
 * turns it into the same typed, validated shape everything else is.
 *
 * @param name - the slice's name, e.g. `orders-rate-limits`
 * @param budgets - the budgets to read
 */
export const rateLimitBudgetConfig = (name: string, budgets: readonly RateLimitBudget[]) =>
    defineConfig({
        name,
        shape: Object.fromEntries(
            budgets.map((budget) => [
                budget.environmentVariable,
                int({ default: budget.defaultMax, min: 1 })
            ])
        )
    });
