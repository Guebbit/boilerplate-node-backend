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
    /*
     * Two URLs over a dictionary the i18n layer already holds. There is nothing here that could be
     * modelled and no business that would recognise it.
     */
    subdomain: 'generic',
    language: {
        Locale: 'A language this deployment speaks. Decided by configuration, never by a module.',
        Dictionary:
            'The flat key-to-string map for one locale. Keys are global, not namespaced per module — see the docblock above.'
    },
    basePath: '/locales',
    routes: router
} satisfies AppModule;
