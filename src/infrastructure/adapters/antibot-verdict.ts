/**
 * @module
 * The one verdict shape every anti-automation rung answers with: `ok` to let the caller proceed,
 * `refused` to refuse. Shared so rung 2 (`checkEmailPolicy`) and rung 3
 * (`HumanChallengeProvider.verify`) can't drift into two vocabularies for the same yes/no question.
 */

/** Whether a rung says the caller may proceed. */
export type RungVerdict = 'ok' | 'refused';
