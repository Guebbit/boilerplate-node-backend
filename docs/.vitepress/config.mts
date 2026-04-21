import { defineConfig } from 'vitepress';

export default defineConfig({
    title: 'Node API Boilerplate',
    description: 'Express + MongoDB + Mongoose REST API boilerplate',
    themeConfig: {
        nav: [
            { text: 'Guide', link: '/guide/getting-started' },
            { text: 'Layers', link: '/layers/database' },
            { text: 'Theory', link: '/theory/architecture' }
        ],
        sidebar: [
            {
                text: 'Guide',
                items: [
                    { text: 'Getting Started', link: '/guide/getting-started' },
                    { text: 'Project Structure', link: '/guide/project-structure' },
                    { text: 'Endpoint Lifecycle', link: '/guide/endpoint-lifecycle' },
                    { text: 'Observability', link: '/guide/observability' }
                ]
            },
            {
                text: 'Layers',
                items: [
                    { text: 'Database', link: '/layers/database' },
                    { text: 'Model', link: '/layers/model' },
                    { text: 'Repository', link: '/layers/repository' },
                    { text: 'Service', link: '/layers/service' },
                    { text: 'Controller', link: '/layers/controller' },
                    { text: 'Routes & Middlewares', link: '/layers/routes' },
                    { text: 'OpenAPI', link: '/layers/openapi' }
                ]
            },
            {
                text: 'Theory',
                items: [
                    { text: 'Architecture', link: '/theory/architecture' },
                    { text: 'Authentication', link: '/theory/authentication' },
                    { text: 'Soft Delete', link: '/theory/soft-delete' },
                    { text: 'Error Handling', link: '/theory/error-handling' },
                    { text: 'Testing', link: '/theory/testing' }
                ]
            }
        ],
        socialLinks: [
            {
                icon: 'github',
                link: 'https://github.com/Guebbit/boilerplate-node-api-mongodb-mongoose'
            }
        ]
    }
});
