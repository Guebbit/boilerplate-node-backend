/**
 * @module
 * What a scheduled job gets installed before it runs: the one step `run-job.ts` and the tests that
 * drive a job through the runner's own path share.
 */
import { bootI18n } from '@infrastructure/i18n';
import { registerModules, type JobDeclaration } from '@kernel/registry';
import { enabledModules, enabledModuleDirectories } from '../../src/modules';

/**
 * Install what the job declared it needs: every module's event subscriptions (a sweep that works
 * by emitting an event is unheard without them) and the translations (a sweep that renders mail).
 *
 * @param job - the job about to run
 */
export const prepareJob = (job: JobDeclaration): Promise<unknown> => {
    if (job.needs?.subscriptions) registerModules(enabledModules);
    return job.needs?.i18n ? bootI18n(enabledModuleDirectories('locales')) : Promise.resolve();
};
