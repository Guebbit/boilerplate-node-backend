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
import { personas } from './personas-schema';
import type { PersonaName } from './personas-schema';

/** The 13 accounts' committed passwords, from `shared/scenarios/personas.yaml`. */
const { accounts } = personas;

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
        NODE_SEED_ADMIN_PASSWORD: seedPassword(accounts.admin.defaultPassword),
        NODE_SEED_USER_PASSWORD: seedPassword(accounts.user.defaultPassword),
        NODE_SEED_EDITOR_PASSWORD: seedPassword(accounts.editor.defaultPassword),
        NODE_SEED_MODERATOR_PASSWORD: seedPassword(accounts.moderator.defaultPassword),
        NODE_SEED_UNVERIFIED_PASSWORD: seedPassword(accounts.unverified.defaultPassword),
        NODE_SEED_TWO_FACTOR_PASSWORD: seedPassword(accounts.twoFactor.defaultPassword),
        NODE_SEED_PENDING_EMAIL_PASSWORD: seedPassword(accounts.pendingEmail.defaultPassword),
        NODE_SEED_BANNED_PASSWORD: seedPassword(accounts.banned.defaultPassword),
        NODE_SEED_SECOND_SHOPPER_PASSWORD: seedPassword(accounts.secondShopper.defaultPassword),
        NODE_SEED_MANAGER_PASSWORD: seedPassword(accounts.manager.defaultPassword),
        NODE_SEED_WAREHOUSE_PASSWORD: seedPassword(accounts.warehouse.defaultPassword),
        NODE_SEED_SUPPORT_PASSWORD: seedPassword(accounts.support.defaultPassword),
        NODE_SEED_OPERATOR_PASSWORD: seedPassword(accounts.operator.defaultPassword),
        // The one authenticator secret every armed account shares (`personas.yaml`).
        NODE_SEED_STAFF_TOTP_SECRET: seedPassword(personas.staffTotpSecret)
    }
});

/**
 * Each account's password, by the name a journey asks for: the env override, else the committed
 * default. Spelled out because the variable names are the stable, documented part.
 */
export const seedPasswords = (): Record<PersonaName, string> => {
    const config = seedPasswordsConfig();
    return {
        admin: config.NODE_SEED_ADMIN_PASSWORD,
        user: config.NODE_SEED_USER_PASSWORD,
        editor: config.NODE_SEED_EDITOR_PASSWORD,
        moderator: config.NODE_SEED_MODERATOR_PASSWORD,
        unverified: config.NODE_SEED_UNVERIFIED_PASSWORD,
        twoFactor: config.NODE_SEED_TWO_FACTOR_PASSWORD,
        pendingEmail: config.NODE_SEED_PENDING_EMAIL_PASSWORD,
        banned: config.NODE_SEED_BANNED_PASSWORD,
        secondShopper: config.NODE_SEED_SECOND_SHOPPER_PASSWORD,
        manager: config.NODE_SEED_MANAGER_PASSWORD,
        warehouse: config.NODE_SEED_WAREHOUSE_PASSWORD,
        support: config.NODE_SEED_SUPPORT_PASSWORD,
        operator: config.NODE_SEED_OPERATOR_PASSWORD
    };
};

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
