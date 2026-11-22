/**
 * @module
 * The module's services, assembled from one file per use case: the hand-over (`./handover`), the
 * profile sync (`./profile-sync`), the person's data (`./personal-data`) and the field setup
 * (`./setup`).
 *
 * @see docs/modules/zammad.md#the-hand-over
 */

import { acceptContact, settleHandovers, sweepContacts } from './handover';
import { onProfileChanged, sweepProfiles } from './profile-sync';
import { collectPersonalData, erasePersonalData } from './personal-data';
import { setupTicketFields } from './setup';

/** The module's service surface: the jobs, the port and the hooks call through this. */
export const zammadService = {
    acceptContact,
    settleHandovers,
    sweepContacts,
    onProfileChanged,
    sweepProfiles,
    collectPersonalData,
    erasePersonalData,
    setupTicketFields
};
