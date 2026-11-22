/**
 * @module
 * Zammad: an optional help desk behind the contact form. While `NODE_ZAMMAD_URL` is unset the
 * module is inert and basic mode (the support mailbox and the contact to-do) is the whole story;
 * set, it takes contact messages in place of the to-do, hands each to Zammad as a ticket from a
 * sweep, and falls back to basic mode when Zammad will not take one. It owns delivery, never the
 * ticket's life: replies, status and the customer's history live in Zammad.
 *
 * @see docs/modules/zammad.md#its-neighbourhood
 */

import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { registerContactDelivery } from '@modules/tasks';
import { USER_PROFILE_CHANGED } from '@modules/users';
// Registers the two gauges with the metrics registry at module load.
import './metrics';
import './audit';
import { zammadJobs } from './jobs';
import { zammadService } from './services';
import { zammadConfig, zammadEnabled } from './config';

/** This module's manifest entry: jobs, the port it installs, the profile-change listener, personal data. */
export default {
    name: 'zammad',
    config: [zammadConfig.slice],
    jobs: zammadJobs,
    personalData: [
        {
            section: 'zammad',
            collect: (subject) => zammadService.collectPersonalData(subject),
            // Inside the hard-delete transaction only, never at the reversible lock.
            erase: (subject, session) => zammadService.erasePersonalData(subject, session)
        }
    ],
    subscribe: () => {
        onDomainEvent(USER_PROFILE_CHANGED, zammadService.onProfileChanged);
    },
    /**
     * Install the port here, not at import time: only a module `registerModules` is given runs
     * this, so importing this file does not take over the contact form. The port itself answers
     * "basic mode" while the URL is unset.
     */
    onRegistered: () => {
        registerContactDelivery({
            accept: zammadService.acceptContact,
            mailboxIsHelpdesk: zammadEnabled
        });
    }
} satisfies AppModule;
