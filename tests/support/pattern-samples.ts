/**
 * @module
 * Known-good strings for `pattern`s the contract declares but a generator cannot build a value
 * for on its own. One table for every generator that walks the contract, so a tricky pattern is
 * registered once rather than once per generator — and a generator that finds no entry fails
 * loudly instead of emitting a value the contract forbids.
 *
 * See: docs/tools/contract-request-data.md, docs/tools/fuzz-testing.md
 */

/**
 * Sample values, keyed on the regex SOURCE exactly as `openapi.yaml` writes it — which is also
 * what `RegExp.source` yields on the generated zod schema, so both generators find the same entry
 * from their own half of the contract.
 */
const PATTERN_SAMPLES: Record<string, string> = {
    // Locale — BCP 47 language tag.
    '^[a-z]{2}(-[A-Za-z0-9]+)*$': 'it',
    // PasswordNew — all four character classes, in any order. Lookahead, so nothing can generate
    // it; this is the shortest value that satisfies the rule.
    '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^\\dA-Za-z]).{8,}$': 'Aa1!aaaa'
};

/**
 * Whether a pattern uses lookaround, which `fast-check`'s `stringMatching` cannot build a string
 * against — it throws `Assertions of kind Lookahead not implemented yet!`. Read from the source
 * rather than caught from that message, which is one library upgrade away from changing.
 * @param source the regex source, as the contract writes it
 * @returns true when the pattern contains `(?=`, `(?!`, `(?<=` or `(?<!`
 */
export const usesLookaround = (source: string): boolean => /\(\?<?[!=]/.test(source);

/**
 * The registered sample for a pattern.
 * @param source the regex source, as the contract writes it
 * @returns the sample, or `undefined` when the pattern has no entry
 */
export const sampleForPattern = (source: string): string | undefined => PATTERN_SAMPLES[source];
