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
import { csv, flag, int, text } from '@infrastructure/config/fields';
import type { RateLimitBudget } from '@types';

/** Where this deployment and its paired frontend live. */
export const siteConfig = defineConfig({
    name: 'site',
    shape: {
        NODE_URL: text({
            required: { minLength: 1 },
            describe:
                'This API’s public origin. OAuth redirect URIs and security.txt are built from it.'
        }),
        NODE_FRONTEND_URL: text({
            default: 'http://localhost:8080',
            describe:
                'The paired frontend’s origin. Links in mail and the OAuth callback point here.'
        }),
        NODE_CORS_ORIGIN: csv({
            required: { minLength: 1, productionOnly: true },
            describe:
                'Origins allowed to call this API with credentials, comma-separated. Unset allows http://localhost:8080.'
        })
    }
});

/** The rate limiter's shared window and its Redis. Per-budget limits are generated from manifests. */
export const rateLimitConfig = defineConfig({
    name: 'rate-limit',
    shape: {
        NODE_RATE_LIMIT_WINDOW_MS: int({
            default: 60_000,
            min: 1,
            describe: 'The window every `shared` budget counts over.'
        }),
        NODE_RATE_LIMIT_REDIS_ENABLED: flag({
            default: true,
            describe: 'Kill switch: false counts in memory even when a Redis URL is inherited.'
        }),
        NODE_RATE_LIMIT_REDIS_URL: text({
            sensitive: true,
            describe: 'The limiter’s own Redis. Falls back to the cache’s.'
        }),
        NODE_RATE_LIMIT_REDIS_PREFIX: text({
            default: 'rate-limit',
            describe: 'Key namespace of every counter, apart from the cache’s.'
        })
    }
});

/** Upload staging and limits. */
export const uploadConfig = defineConfig({
    name: 'uploads',
    shape: {
        NODE_MAX_UPLOAD_BYTES: int({
            default: 5 * 1024 * 1024,
            min: 1,
            describe: 'Largest accepted upload, in bytes.'
        }),
        NODE_UPLOAD_STAGING_PATH: text({
            default: path.join(tmpdir(), 'node-api-uploads'),
            describe:
                'Where multer writes before the content checks. Set when temp is small or read-only.'
        }),
        NODE_PENDING_IMAGE_URL: text({
            default: '/images/system/pending.png',
            describe: 'The placeholder image shown until a digest job finishes.'
        }),
        NODE_PENDING_THUMBNAIL_URL: text({
            default: '/images/system/pending-thumb.webp',
            describe: 'The placeholder thumbnail shown until a digest job finishes.'
        })
    }
});

/** The response cache's bounds. */
export const responseCacheConfig = defineConfig({
    name: 'response-cache',
    shape: {
        NODE_REDIS_CACHE_DEV_TTL_MAX: int({
            default: 30,
            min: 0,
            describe:
                'Caps a route’s cache TTL, in seconds, on a developer machine. 0 lifts the cap.'
        }),
        NODE_REDIS_CACHE_MAX_BYTES: int({
            default: 256 * 1024,
            min: 1,
            describe: 'Largest response body the cache will store.'
        })
    }
});

/** The idempotency ledger. */
export const idempotencyConfig = defineConfig({
    name: 'idempotency',
    shape: {
        NODE_IDEMPOTENCY_RETENTION_HOURS: int({
            default: 24,
            min: 1,
            describe:
                'How long a stored idempotent response is replayable. Changing it needs `db:sync`.'
        })
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
                int({
                    default: budget.defaultMax,
                    min: 1,
                    describe: `${budget.name}: ${budget.bounds}`
                })
            ])
        )
    });
