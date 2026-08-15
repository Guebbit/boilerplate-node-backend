import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { router } from './routes';

/**
 * Contact requests: anyone may file one, admins read and triage them.
 *
 * A leaf in both directions. It records an email address rather than referencing a user, because
 * the form is open to people who have no account — which is also why deleting an account leaves
 * their feedback standing, and why this module needs nothing from `users`.
 */
export default {
    name: 'feedback',
    /*
     * A contact form with a triage state. Every application grows one, none of them differ, and
     * this one is a leaf in both directions — the cheapest possible thing that works is correct.
     */
    subdomain: 'generic',
    language: {
        'Contact request':
            'A message from anyone, account or not. Identified by the email on the form, never by a user reference.',
        Triage: 'The admin state of a request — read, handled, closed. The only thing about it that changes.'
    },
    basePath: '/feedback',
    routes: router,
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
