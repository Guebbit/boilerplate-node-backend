/**
 * @module
 * The seeder's and the demo's own variables, as config slices: the `NODE_SEED_*` variables, each
 * with its committed, public fallback, and the demo webhook sink's address.
 *
 * Not part of the app's boot gate — the seeder is a script, not the app, and production has none of
 * these — but read through the same layer, so a blank value means "unset" here as everywhere.
 *
 * See: docs/tools/demo-profile.md#the-named-accounts
 */

import { defineConfig } from '@infrastructure/config/define';
import { text } from '@infrastructure/config/fields';

/**
 * One seed credential's field. The fallback is a real demo value, not a placeholder: it is public
 * on purpose, and `scenario:apply` refuses to run outside development/test, which is what stops it
 * reaching a database anyone but a developer or CI can see.
 *
 * @param fallback - the committed value used when the variable is unset
 */
const seedPassword = (fallback: string) => text({ default: fallback, sensitive: true });

/** The seed accounts' passwords. */
export const seedPasswordsConfig = defineConfig({
    name: 'scenario-seeds',
    shape: {
        NODE_SEED_ADMIN_PASSWORD: seedPassword('Demo-Admin1!'),
        NODE_SEED_USER_PASSWORD: seedPassword('Demo-User1!'),
        NODE_SEED_EDITOR_PASSWORD: seedPassword('Demo-Editor1!'),
        NODE_SEED_MODERATOR_PASSWORD: seedPassword('Demo-Moderator1!'),
        NODE_SEED_UNVERIFIED_PASSWORD: seedPassword('Demo-Unverified1!'),
        NODE_SEED_TWO_FACTOR_PASSWORD: seedPassword('Demo-TwoFactor1!'),
        NODE_SEED_PENDING_EMAIL_PASSWORD: seedPassword('Demo-PendingEmail1!'),
        NODE_SEED_BANNED_PASSWORD: seedPassword('Demo-Banned1!'),
        NODE_SEED_SECOND_SHOPPER_PASSWORD: seedPassword('Demo-SecondShopper1!'),
        NODE_SEED_MANAGER_PASSWORD: seedPassword('Demo-Manager1!'),
        NODE_SEED_WAREHOUSE_PASSWORD: seedPassword('Demo-Warehouse1!'),
        NODE_SEED_SUPPORT_PASSWORD: seedPassword('Demo-Support1!'),
        NODE_SEED_OPERATOR_PASSWORD: seedPassword('Demo-Operator1!'),
        // Every staff account carries an authenticator app, or its role grants nothing. One shared
        // secret, since a demo fixture gains nothing from seven. Base32, 160 bits.
        NODE_SEED_STAFF_TOTP_SECRET: seedPassword('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP')
    }
});

/**
 * Where the demo's webhook sink listens. Read by the seeder (the subscription it writes points
 * here) and by the dev preload (which exempts this origin from the SSRF address check, since the
 * sink is on loopback or a private compose address) — never by production code.
 */
export const demoSinkConfig = defineConfig({
    name: 'scenario-webhook-sink',
    shape: {
        NODE_WEBHOOK_DEMO_SINK_URL: text()
    }
});
