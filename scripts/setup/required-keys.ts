/**
 * @module
 * Every env var `npm run setup` can fill: the boot gate's own list, read rather than duplicated —
 * a new module's secret is covered automatically, the same reason `assertModuleConfig` folds
 * module-declared and app-level slices together (`kernel/module-config.ts`).
 */

import { allConfigSlices } from '../../src/app/config';
import { enabledModules } from '../../src/modules';

/** One variable `npm run setup` may fill, and the exact placeholder it replaces. */
export interface FillableKey {
    key: string;
    placeholder: string;
}

/**
 * Every field across the app tier and the enabled modules whose presence rule names a
 * `placeholder` — a field with none (`NODE_URL`, `NODE_CORS_ORIGIN`) names no wrong value to
 * replace, only a missing one, and stays the operator's own call.
 */
export const fillableKeys = (): FillableKey[] => {
    const seen = new Map<string, string>();
    for (const slice of allConfigSlices(enabledModules))
        for (const { name, presence } of slice.fields)
            if (presence?.placeholder) seen.set(name, presence.placeholder);

    return [...seen].map(([key, placeholder]) => ({ key, placeholder }));
};
