/**
 * Mermaid settings shared by every diagram on the site; `MermaidDiagram.vue` adds the theme name
 * (light or dark) and the security level on top.
 * https://mermaid.js.org/config/schema-docs/config.html
 */
export const mermaidOptions = {
    useMaxWidth: true,
    htmlLabels: true,
    flowchart: {
        nodeSpacing: 45,
        rankSpacing: 70,
        padding: 15
    },
    themeVariables: {
        primaryColor: '#f5f3ff',
        primaryBorderColor: '#7c3aed',
        primaryTextColor: '#111827',
        secondaryColor: '#eff6ff',
        secondaryBorderColor: '#2563eb',
        tertiaryColor: '#ecfeff',
        tertiaryBorderColor: '#0891b2',
        clusterBkg: '#f8fafc',
        clusterBorder: '#cbd5e1',
        lineColor: '#64748b'
    }
};
