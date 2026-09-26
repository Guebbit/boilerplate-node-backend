/**
 * @module
 * Every env var `npm run setup` can fill: the boot gate's own list, read rather than duplicated —
 * a new module's secret is covered automatically, the same reason `assertRequiredConfig` folds
 * module-declared and app-level checks together (`kernel/required-config.ts`).
 */

import type { RequiredConfig } from '@kernel/registry';
import { enabledModules } from '../../src/modules';
import { APP_NON_MODULE_CHECKS } from '../../src/app/required-config';

/** One variable `npm run setup` may fill, and the exact placeholder it replaces. */
export interface FillableKey {
    key: string;
    placeholder: string;
}

/**
 * Every `requiredConfig` entry across the enabled modules and the app-level checks that carries a
 * `placeholder` — an entry with none (`NODE_URL`, `NODE_CORS_ORIGIN`) names no wrong value to
 * replace, only a missing one, and stays the operator's own call.
 */
export const fillableKeys = (): FillableKey[] => {
    const all: readonly RequiredConfig[] = [
        ...enabledModules.flatMap((appModule) => appModule.requiredConfig ?? []),
        ...(APP_NON_MODULE_CHECKS.required ?? [])
    ];

    return all
        .filter((entry): entry is RequiredConfig & { placeholder: string } =>
            Boolean(entry.placeholder)
        )
        .map(({ key, placeholder }) => ({ key, placeholder }));
};
