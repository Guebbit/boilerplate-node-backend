/**
 * @module
 * The seed accounts' passwords, as a config slice: the thirteen `NODE_SEED_*_PASSWORD` variables, each
 * with its committed, public fallback.
 *
 * Not part of the app's boot gate — the seeder is a script, not the app — but read through the
 * same layer, so the variable list on `docs/tools/configuration.md` is complete and a blank value
 * means "unset" here as everywhere.
 *
 * See: docs/tools/demo-profile.md#the-named-accounts
 */

import { defineConfig } from '@infrastructure/config/define';
import { text } from '@infrastructure/config/fields';

/**
 * One seed password's field. The fallback is a real demo value, not a placeholder: this repo
 * commits its `.env` in the clear, and `scenario:apply` refuses to run outside development/test,
 * which is what stops it reaching a database anyone but a developer or CI can see.
 *
 * @param account - which account, for the description
 * @param fallback - the committed password used when the variable is unset
 */
const seedPassword = (account: string, fallback: string) =>
    text({
        default: fallback,
        sensitive: true,
        describe: `The ${account} seed account's password. Keep it identical to the paired frontend's own \`.env\`.`
    });

/** The seed accounts' passwords. */
export const seedPasswordsConfig = defineConfig({
    name: 'scenario-seeds',
    shape: {
        NODE_SEED_ADMIN_PASSWORD: seedPassword('owner (`admin`)', 'Demo-Admin1!'),
        NODE_SEED_USER_PASSWORD: seedPassword('customer', 'Demo-User1!'),
        NODE_SEED_EDITOR_PASSWORD: seedPassword('editor', 'Demo-Editor1!'),
        NODE_SEED_MODERATOR_PASSWORD: seedPassword('moderator', 'Demo-Moderator1!'),
        NODE_SEED_UNVERIFIED_PASSWORD: seedPassword('unverified persona', 'Demo-Unverified1!'),
        NODE_SEED_TWO_FACTOR_PASSWORD: seedPassword('two-factor persona', 'Demo-TwoFactor1!'),
        NODE_SEED_PENDING_EMAIL_PASSWORD: seedPassword(
            'pending-email persona',
            'Demo-PendingEmail1!'
        ),
        NODE_SEED_BANNED_PASSWORD: seedPassword('banned persona', 'Demo-Banned1!'),
        NODE_SEED_SECOND_SHOPPER_PASSWORD: seedPassword(
            'second-shopper persona',
            'Demo-SecondShopper1!'
        ),
        NODE_SEED_MANAGER_PASSWORD: seedPassword('manager', 'Demo-Manager1!'),
        NODE_SEED_WAREHOUSE_PASSWORD: seedPassword('warehouse', 'Demo-Warehouse1!'),
        NODE_SEED_SUPPORT_PASSWORD: seedPassword('support', 'Demo-Support1!'),
        NODE_SEED_OPERATOR_PASSWORD: seedPassword('platform operator', 'Demo-Operator1!')
    }
});
