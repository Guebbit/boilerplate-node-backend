/**
 * @module
 * `users`' configuration: the key its personal fields are encrypted under, and the two links its
 * purchase-hold mail carries into the paired frontend.
 *
 * The adapter that reads the ring is shape-only (`infrastructure/security/config.ts`); the
 * requirement that it be set is this module's, so deleting the module deletes it.
 *
 * See: docs/tools/configuration.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { text, withPresence } from '@infrastructure/config/fields';
import { frontendLink } from '@infrastructure/http/frontend-link';
import { PII_ENCRYPTION_KEY_FIELD } from '@infrastructure/security/config';

/**
 * A phone number encrypted under the shipped placeholder is recoverable by anyone who has read
 * this repository — same failure shape `NODE_TOTP_ENCRYPTION_KEY` guards against, same fix. Shared
 * with `addresses`: both are `group: foundation`, so neither is ever deployed without the other
 * and requiring it here covers both.
 */
export const usersConfig = defineConfig({
    name: 'users',
    shape: {
        NODE_PII_ENCRYPTION_KEY: withPresence(PII_ENCRYPTION_KEY_FIELD, {
            minLength: 16,
            minBytes: 32,
            placeholder: 'your-pii-encryption-key-here'
        }),
        // The frontend's own contact page, pre-filled for an account question: the way to ask a
        // person about a purchase hold (GDPR Art. 22(3)).
        NODE_FRONTEND_LINK_CONTACT: text({ default: 'contact?category=account' }),
        NODE_FRONTEND_LINK_PRIVACY: text({ default: 'privacy' })
    }
});

/**
 * A link into the paired frontend's contact page. `frontendLink` adds the origin and the locale;
 * the default template is the frontend's own route (`feedback/routes.ts`).
 *
 * @param locale - the language the mail is written in
 */
export const contactFrontendLink = (locale: string): string =>
    frontendLink(usersConfig().NODE_FRONTEND_LINK_CONTACT, locale);

/**
 * A link into the paired frontend's privacy notice.
 *
 * @param locale - the language the mail is written in
 */
export const privacyFrontendLink = (locale: string): string =>
    frontendLink(usersConfig().NODE_FRONTEND_LINK_PRIVACY, locale);
