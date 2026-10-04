/**
 * @module
 * Puts the test doubles into the registries the application resolves from — the one list of what
 * a dev, demo or test process fakes. Production never imports this file: it is outside `src/`.
 *
 * Who calls it:
 *   dev preload   `scenarios/support/development-doubles.ts`, before the app loads.
 *   jest          `tests/support/setup.ts`, once per test file.
 *
 * Light on purpose: this file loads nothing but the registries (`mail-transports` imports no
 * `nodemailer`, and the log double loads it on its first send). Both callers run BEFORE the
 * application — before OpenTelemetry patches express and mongoose, before a test's `jest.mock`
 * is hoisted — and a double that pulled the payments module in here would break both. The doubles
 * that need the module load it on their first call instead.
 */

import { registerMailTransport } from '@infrastructure/adapters/mail-transports';
import { logMailTransport } from './mail-log';
import { outboxMailTransport } from './mail-outbox';
import { registerPaymentDouble } from './payments/register';

/**
 * Registers every double a process may use. Safe to call more than once: a registry entry is
 * replaced, not duplicated.
 */
export const registerDoubles = (): void => {
    registerPaymentDouble();
    registerMailTransport('log', logMailTransport);
    registerMailTransport('outbox', outboxMailTransport);
};
