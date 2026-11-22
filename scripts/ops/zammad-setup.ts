/**
 * @module
 * Create or update the ticket fields our hand-over writes into Zammad, and set the Zammad setting
 * the retention clock rests on — `npm run zammad:setup`.
 *
 * Why: Zammad drops a field it does not know, so without `shop_category`, `order_number`,
 * `request_ref`, `shop_sender_verified` and `shop_account` the hand-over would store nothing of them.
 * What: the fields are built from the bundled `TaskCategory` enum. Idempotent: a second run updates
 * what exists and creates nothing. Creating a field makes Zammad restart itself once.
 *
 * Needs `ZAMMAD_ADMIN_TOKEN`, an Admin user's token used for this run only. It is deliberately not
 * a `NODE_` variable: the app never reads it, and the runtime token has no `admin.object`.
 * The setting is `ticket_last_contact_behaviour = based_on_customer_reaction`, written only when
 * Zammad holds another value, and reported in `settingsChanged`.
 * Not scheduled: run once when the module is turned on, and again when a category is added.
 *
 * @see docs/modules/zammad.md#setup
 */
import '@infrastructure/config/dotenv';
import { logger } from '@infrastructure/adapters/logger';
import { zammadService } from '../../src/modules/zammad';
import { runScript } from '../run-script';

/** Set the fields up and say what changed. */
const main = (): Promise<void> => {
    const adminToken = process.env.ZAMMAD_ADMIN_TOKEN;
    if (!adminToken) return Promise.reject(new Error('ZAMMAD_ADMIN_TOKEN is not set.'));

    return zammadService.setupTicketFields(adminToken).then((report) => {
        logger.info({
            message: 'Zammad ticket fields and settings are set up.',
            created: report.created,
            updated: report.updated,
            settingsChanged: report.settingsChanged,
            restartNeeded: report.created.length > 0
        });
    });
};

// `undefined`: run by hand, never on a schedule. Nothing was opened, nothing to close.
// eslint-disable-next-line @typescript-eslint/no-floating-promises -- runScript never rejects (failure is reported via process.exitCode)
void runScript(undefined, main, () => Promise.resolve());
