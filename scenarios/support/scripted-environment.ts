/**
 * @module
 * The environment a seed runs under, applied as an import side effect.
 *
 * Why a module and not statements in `apply.ts`: ES imports are hoisted, so a statement there runs
 * AFTER every static import has loaded. `@scenarios/index` pulls in the rate-limit middleware,
 * which builds its limiters at import time from the environment as it is THEN. Imported right
 * after dotenv and before anything else, this runs first, so the limiters are built lifted.
 *
 * Exports:  the deployment's limits-Redis URL, saved BEFORE the overrides blank it, so `--reset`
 *           can still clear the counters a reseed leaves behind.
 */
import { installEnvironment } from '@infrastructure/config/store';
import { limitsRedisUrl } from '@infrastructure/adapters/limits-redis';
import { SCRIPTED_RATE_LIMITS } from '@scenarios/rate-limits';

/**
 * The `limits` Redis as the DEPLOYMENT configured it, read before {@link SCRIPTED_RATE_LIMITS}
 * switches the limiter to in-memory counting for this process.
 */
export const deploymentRateLimitRedisUrl = limitsRedisUrl();

/*
 * OVERRIDES `.env`: a deployment's budgets are sized for a person, and a seed makes several
 * hundred requests from one address in seconds. Safe because `apply.ts` refuses production.
 */
installEnvironment(SCRIPTED_RATE_LIMITS);
