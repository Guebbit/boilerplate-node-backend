/**
 * The cases the PHP twin's budget keys must answer identically:
 * `shared/cases/normalize-email.cases.yaml`, run against `canonicalMailbox`.
 */

import { z } from 'zod';
import { canonicalMailbox } from '@infrastructure/persistence/normalize-email';
import { caseBase, describeCases } from '@tests/cases';

/** One case: an address as submitted, and the mailbox it delivers to. */
const mailboxCase = caseBase.extend({ email: z.string(), mailbox: z.string() });

describeCases('normalize-email', mailboxCase, 16, (one) => {
    expect(canonicalMailbox(one.email)).toBe(one.mailbox);
});
