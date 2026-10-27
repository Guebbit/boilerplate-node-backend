/**
 * The cases the PHP twin's logger must answer identically: `shared/cases/log-redaction.cases.yaml`,
 * run against this repository's own redaction walk. The lists themselves are
 * `shared/rules/log-redaction.yaml`, read by that same code.
 */

import { z } from 'zod';
import { redactSensitiveFields } from '@infrastructure/adapters/logger';
import { caseBase, describeCases } from '@tests/cases';

/** One case: a key, and whether its value is replaced. */
const redactionCase = caseBase.extend({
    key: z.string().min(1),
    expect: z.enum(['redact', 'keep'])
});

describeCases('log-redaction', redactionCase, 14, (one) => {
    const result = redactSensitiveFields({ [one.key]: 'value' }) as Record<string, unknown>;

    expect(result[one.key] === 'value' ? 'keep' : 'redact').toBe(one.expect);
});
