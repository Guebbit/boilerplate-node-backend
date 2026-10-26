/**
 * The cases the PHP twin's boolean parsing must answer identically:
 * `shared/cases/env-booleans.cases.yaml`, run against `parseBooleanWord`.
 */

import { z } from 'zod';
import { parseBooleanWord } from '@infrastructure/config/fields';
import { caseBase, describeCases } from '@tests/cases';

/** One case: a word, and whether it reads as on, off or not a boolean. */
const wordCase = caseBase.extend({
    word: z.string(),
    expect: z.union([z.boolean(), z.literal('invalid')])
});

describeCases('env-booleans', wordCase, 25, (one) => {
    expect(parseBooleanWord(one.word) ?? 'invalid').toBe(one.expect);
});
