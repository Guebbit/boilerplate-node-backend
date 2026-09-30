/**
 * @module
 * Builds a scenario with the human-challenge provider off.
 *
 * The flow runner signs in and pays over real HTTP, and a script solves no challenge: with a
 * provider on, the first login is refused and the shop never gets built. The provider is chosen by
 * `NODE_ANTIBOT_PROVIDER`, read on every request, so switching it to `none` for the length of the
 * build and putting it back afterwards is enough. A process that boots with the provider on (the
 * paired suite's antibot run) still serves it: the build happens before it listens.
 *
 * See: docs/modules/antibot.md
 */

/** The variable that picks the provider, and the value that means "no challenge". */
const PROVIDER_VARIABLE = 'NODE_ANTIBOT_PROVIDER';

/**
 * Run `work` with no human-challenge provider, then restore whatever was there.
 *
 * @param work - the build to run, e.g. driving the shop's flows
 * @returns whatever `work` resolved to; a rejection passes through after the restore
 */
export const withoutHumanChallenge = <T>(work: () => Promise<T>): Promise<T> => {
    const previous = process.env[PROVIDER_VARIABLE];
    process.env[PROVIDER_VARIABLE] = 'none';

    return work().finally(() => {
        // Assigning `undefined` to a `process.env` key stores the string "undefined", so an
        // absent variable has to be deleted rather than set back.
        if (previous === undefined)
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- the key is the one constant above; deleting is the only way to restore an unset variable
            delete process.env[PROVIDER_VARIABLE];
        else process.env[PROVIDER_VARIABLE] = previous;
    });
};
