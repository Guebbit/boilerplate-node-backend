/**
 * The cases the PHP twin's outbox relay must answer identically:
 * `shared/cases/outbox-backoff.cases.yaml`, run against `outboxBackoffMs`.
 */

import { z } from 'zod';
import { outboxBackoffMs } from '@kernel/outbox';
import { caseBase, describeCases } from '@tests/cases';

/** One case: how many dispatches failed, and the wait before the next. */
const backoffCase = caseBase.extend({
    failedAttempts: z.number().int().positive(),
    delayMs: z.number().int().positive()
});

describeCases('outbox-backoff', backoffCase, (one) => {
    expect(outboxBackoffMs(one.failedAttempts)).toBe(one.delayMs);
});
