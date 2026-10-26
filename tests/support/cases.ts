/**
 * @module
 * The shared-cases harness: runs a `shared/cases/<name>.cases.yaml` file against this backend.
 *
 * A cases file is input -> expected output for logic that must stay code but must answer the same
 * in both backends. The PHP twin runs the same file against its own implementation.
 *
 * See: docs/theory/shared-rules.md
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

/** The repo-root `shared/cases/` directory. */
const CASES_DIRECTORY = path.join(__dirname, '..', '..', 'shared', 'cases');

/** What every case carries: one sentence saying what it proves. */
export const caseBase = z.object({ name: z.string().min(1) });

/**
 * Registers one `it` per case of `shared/cases/<file>.cases.yaml`.
 *
 * The count is pinned, not floored: a file that loads zero cases, or loses some, fails. A suite
 * that silently reads nothing reports a clean implementation forever.
 *
 * @param file - the file's name under `shared/cases/`, without `.cases.yaml`
 * @param caseSchema - the Zod schema of one case (build it on {@link caseBase})
 * @param count - the exact number of cases the file holds today
 * @param run - asserts one case; throws (or fails an `expect`) when this backend disagrees. May
 *   return a promise, which the test awaits
 */
export const describeCases = <T extends { name: string }>(
    file: string,
    caseSchema: z.ZodType<T>,
    count: number,
    run: (one: T) => Promise<void> | void
): void => {
    const document: unknown = parse(
        readFileSync(path.join(CASES_DIRECTORY, `${file}.cases.yaml`), 'utf8')
    );
    const { cases } = z.object({ cases: z.array(caseSchema) }).parse(document);

    describe(`shared cases: ${file}`, () => {
        it('holds exactly the pinned number of cases', () => {
            expect(cases).toHaveLength(count);
        });

        it.each(cases.map((one) => [one.name, one] as const))('%s', async (_name, one) => {
            await run(one);
        });
    });
};
