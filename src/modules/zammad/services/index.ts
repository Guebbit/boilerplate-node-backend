/**
 * @module
 * The module's services, assembled from one file per use case: the hand-over (`./handover`), the
 * profile sync (`./profile-sync`), the person's data (`./personal-data`, `./export-section`), the
 * erase job (`./erase-job`), the retention pass (`./retention`) and the field setup (`./setup`).
 *
 * @see docs/modules/zammad.md#the-hand-over
 */

import { acceptContact, settleHandovers, sweepContacts } from './handover';
import { onProfileChanged, sweepProfiles } from './profile-sync';
import { collectPersonalData, erasePersonalData } from './personal-data';
import { replayErasures, sweepErasures } from './erase-job';
import { reapRetention } from './retention';
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
    sweepErasures,
    replayErasures,
    reapRetention,
    setupTicketFields
};
