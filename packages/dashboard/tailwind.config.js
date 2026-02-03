/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ["class"],
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                border: "hsl(var(--border) / <alpha-value>)",
                input: "hsl(var(--input) / <alpha-value>)",
                ring: "hsl(var(--ring) / <alpha-value>)",
                background: "hsl(var(--background) / <alpha-value>)",
                foreground: "hsl(var(--foreground) / <alpha-value>)",
                primary: {
                    DEFAULT: "hsl(var(--primary) / <alpha-value>)",
                    foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
                    foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted) / <alpha-value>)",
                    foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent) / <alpha-value>)",
                    foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
                },
                card: {
                    DEFAULT: "hsl(var(--card) / <alpha-value>)",
                    foreground: "hsl(var(--card-foreground) / <alpha-value>)",
                },
                diff: {
                    "add-bg": "hsl(var(--diff-add-bg) / <alpha-value>)",
                    "add-text": "hsl(var(--diff-add-text) / <alpha-value>)",
                    "add-marker": "hsl(var(--diff-add-marker) / <alpha-value>)",
                    "remove-bg": "hsl(var(--diff-remove-bg) / <alpha-value>)",
                    "remove-text": "hsl(var(--diff-remove-text) / <alpha-value>)",
                    "remove-marker": "hsl(var(--diff-remove-marker) / <alpha-value>)",
                    "context-text": "hsl(var(--diff-context-text) / <alpha-value>)",
                },
                confirm: {
                    "border": "hsl(var(--confirm-border) / <alpha-value>)",
                    "bg": "hsl(var(--confirm-bg) / <alpha-value>)",
                    "header": "hsl(var(--confirm-header) / <alpha-value>)",
                    "icon": "hsl(var(--confirm-icon) / <alpha-value>)",
                    "code-bg": "hsl(var(--confirm-code-bg) / <alpha-value>)",
                    "code-text": "hsl(var(--confirm-code-text) / <alpha-value>)",
                    "btn-primary-bg": "hsl(var(--confirm-btn-primary-bg) / <alpha-value>)",
                    "btn-primary-hover": "hsl(var(--confirm-btn-primary-hover) / <alpha-value>)",
                    "btn-secondary-bg": "hsl(var(--confirm-btn-secondary-bg) / <alpha-value>)",
                    "btn-secondary-text": "hsl(var(--confirm-btn-secondary-text) / <alpha-value>)",
                    "btn-secondary-hover": "hsl(var(--confirm-btn-secondary-hover) / <alpha-value>)",
                    "btn-deny-bg": "hsl(var(--confirm-btn-deny-bg) / <alpha-value>)",
                    "btn-deny-text": "hsl(var(--confirm-btn-deny-text) / <alpha-value>)",
                    "btn-deny-hover": "hsl(var(--confirm-btn-deny-hover) / <alpha-value>)",
                },
            },
            borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
            },
        },
    },
    plugins: [],
}
