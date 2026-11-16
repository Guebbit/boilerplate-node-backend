/**
 * @module
 * The environment a seed runs under, applied as an import side effect.
 *
 * Why a module and not statements in `apply.ts`: ES imports are hoisted, so a statement there runs
 * AFTER every static import has loaded. `@scenarios/index` pulls in the rate-limit middleware,
 * which builds its limiters at import time from the environment as it is THEN. Imported right
 * after dotenv and before anything else, this runs first, so the limiters are built lifted. The
 * mail, broker and bank-transfer overrides live here for the same reason: anything that reads the
 * environment while it loads must see them.
 *
 * Exports:  the deployment's limits-Redis URL, saved BEFORE the overrides blank it, so `--reset`
 *           can still clear the counters a reseed leaves behind.
 */
import { currentEnvironment, installEnvironment } from '@infrastructure/config/store';
import { limitsRedisUrl } from '@infrastructure/adapters/limits-redis';
import { DEMO_BANK_TRANSFER, SCRIPTED_RATE_LIMITS } from '@scenarios/rate-limits';

/**
 * The `limits` Redis as the DEPLOYMENT configured it, read before {@link SCRIPTED_RATE_LIMITS}
 * switches the limiter to in-memory counting for this process.
 */
export const deploymentRateLimitRedisUrl = limitsRedisUrl();

/**
 * OVERRIDES `.env`: a deployment's budgets are sized for a person, and a seed makes several
 * hundred requests from one address in seconds. Safe because `apply.ts` refuses production.
 */
installEnvironment(SCRIPTED_RATE_LIMITS);

/**
 * A seed PLACES orders, and every one of them wants to email a confirmation, to addresses this
 * seed invented. Against a deployment with a mail server that is real send attempts to fictional
 * recipients. `log` renders each mail (a broken template still fails) and opens no socket.
 *
 * OVERRIDES `.env`, like the budgets: `.env` naming a real mail server is the case it protects.
 */
installEnvironment({ NODE_MAIL_TRANSPORT: 'log' });

/**
 * The broker off for this process, so an email job runs INLINE through the `log` transport above.
 * With a broker reachable the job is published instead, and a live backend's consumer would send
 * the seed's mails through its real SMTP transport, filling a live e2e run's emptied mailbox.
 */
installEnvironment({ NODE_RABBITMQ_ENABLED: '0' });

/**
 * Applied only where nothing is set, unlike the budgets: a deployment that names its own
 * beneficiary keeps it, and one that names none still gets a shop whose `order.awaitingTransfer`
 * guarantee can hold.
 */
installEnvironment(
    Object.fromEntries(
        Object.entries(DEMO_BANK_TRANSFER).filter(
            ([key]) => currentEnvironment()[key] === undefined
        )
    )
);
