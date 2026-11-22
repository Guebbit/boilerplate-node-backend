/**
 * @module
 * Two gauges read at SCRAPE time from the database, so the app serves them whatever process did the
 * work: the sweeps run in the cron container, which Prometheus does not scrape, so a counter moved
 * there would never be seen. Built for `ZammadHandoverStuck` and `ZammadHandoverFellBack`.
 *
 * @see docs/modules/zammad.md#watching-it
 */

import { Gauge } from 'prom-client';
import { metricsRegistry } from '@infrastructure/observability/metrics-registry';
import { countFallbackTombstones, oldestPendingContactAgeSeconds } from './repository';

/**
 * Age in seconds of the oldest contact message still waiting for hand-over, `0` when none waits.
 * A value past 15 minutes means the sweep is not running or Zammad has been refusing for a while.
 */
const _zammadContactsOldestPendingSeconds = new Gauge({
    name: 'zammad_contacts_oldest_pending_seconds',
    help: 'Age in seconds of the oldest contact message not yet handed to Zammad.',
    registers: [metricsRegistry],
    async collect() {
        this.set(await oldestPendingContactAgeSeconds());
    }
});

/**
 * Messages that fell back to basic mode (a to-do and a link-only mail) in the last week: the
 * tombstones that have not expired. Above zero means the hand-over gave up on a message and a
 * technician should look at Zammad.
 */
const _zammadHandoverFallbacks = new Gauge({
    name: 'zammad_handover_fallbacks',
    help: 'Contact messages that fell back to basic mode and are still within the last 7 days.',
    registers: [metricsRegistry],
    async collect() {
        this.set(await countFallbackTombstones());
    }
});
