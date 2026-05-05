import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

export default withMermaid(
    defineConfig({
        title: 'Boilerplate Node Backend',
        description: 'ADHD-friendly docs for the Express + MongoDB + Mongoose REST boilerplate',
        themeConfig: {
            nav: [
                { text: 'Home', link: '/' },
                { text: 'Theory', link: '/theory/' },
                { text: 'Tools', link: '/tools/' },
                { text: 'API', link: '/api/' }
            ],
            sidebar: {
                '/theory/': [
                    {
                        text: 'Theory',
                        items: [
                            { text: 'Overview', link: '/theory/' },
                            { text: 'Architecture', link: '/theory/architecture' },
                            { text: 'Request Flow', link: '/theory/request-flow' }
                        ]
                    }
                ],
                '/tools/': [
                    {
                        text: 'Tools',
                        items: [
                            { text: 'Overview', link: '/tools/' },
                            {
                                text: 'Runtime & Security',
                                link: '/tools/runtime-and-security'
                            },
                            {
                                text: 'Observability & Quality',
                                link: '/tools/observability-and-quality'
                            }
                        ]
                    }
                ],
                '/api/': [
                    {
                        text: 'API',
                        items: [
                            { text: 'Overview', link: '/api/' },
                            { text: 'OpenAPI Workflow', link: '/api/openapi-workflow' },
                            { text: 'REST Style', link: '/api/rest-style' }
                        ]
                    }
                ]
            },
            socialLinks: [
                {
                    icon: 'github',
                    link: 'https://github.com/Guebbit/boilerplate-node-backend'
                }
            ]
        },
        mermaid: {
            theme: 'neutral',
            flowchart: {
                useMaxWidth: true,
                htmlLabels: true
            },
            themeVariables: {
                primaryColor: '#ede9fe',
                primaryBorderColor: '#7c3aed',
                primaryTextColor: '#111827',
                secondaryColor: '#dbeafe',
                tertiaryColor: '#f8fafc',
                lineColor: '#64748b'
            }
        }
    })
);
