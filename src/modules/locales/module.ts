import type { AppModule } from '@kernel/registry';
import { router } from './routes';

/**
 * Locale discovery: which languages this deployment speaks, and the dictionary for one of them.
 *
 * A leaf, and unusually thin — no model, no repository, no service. It owns two URLs over what
 * `infrastructure/i18n` already has in memory, which is the "owns a URL" half of what makes something a module.
 *
 * The locale JSONs themselves are central, and their keys are flat
 * (`products-list-page.page-title`). Namespacing them per module is a whole-codebase rename:
 * doing one domain at a time would leave one namespaced and the rest flat inside the same files,
 * which is worse than either end state.
 *
 * No `index.ts` — nothing imports this module. Callers reach `@infrastructure/i18n` for the runtime.
 */
export default {
    name: 'locales',
    basePath: '/locales',
    routes: router
} satisfies AppModule;
