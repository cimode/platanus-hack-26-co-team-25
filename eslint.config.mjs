import nextPlugin from "@next/eslint-plugin-next";
import betterTailwind from "eslint-plugin-better-tailwindcss";
import tseslint from "typescript-eslint";

/**
 * ESLint here covers ONLY what Biome cannot. Everything else -- formatting,
 * import organisation, correctness, a11y, react-hooks, noFloatingPromises --
 * lives in biome.json. If you are tempted to add a general-purpose rule here,
 * check whether Biome already has it.
 *
 * The two irreducible gaps:
 *
 *   1. @next/eslint-plugin-next -- Core Web Vitals and Next-specific checks
 *      (no-img-element, no-html-link-for-pages, no-sync-scripts). Biome has no
 *      equivalent and no plans to.
 *
 *   2. eslint-plugin-better-tailwindcss -- the design-system guardrails. This
 *      one is genuinely unreplaceable: it reads src/app/globals.css as the
 *      Tailwind v4 entry point, so it knows our actual token set and catches an
 *      agent inventing `bg-brand-500` or fat-fingering `bg-cardd`. Biome's
 *      useSortedClasses is nursery and cannot read a Tailwind config at all.
 */
export default [
  {
    ignores: [
      // Agent tooling, not app code. Workflow scripts run in a wrapped
      // async context where top-level `return` is legal, so parsing them
      // as ES modules is a guaranteed false positive.
      ".claude/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "public/**",
      "coverage/**",
      "test-results/**",
      "playwright-report/**",
      "**/*-snapshots/**",
    ],
  },

  // -- 1. Next.js Core Web Vitals -------------------------------------------
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    plugins: { "@next/next": nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },

  // -- 2. Design-system guardrails ------------------------------------------
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "better-tailwindcss": betterTailwind },
    settings: {
      "better-tailwindcss": {
        // Tailwind v4 is CSS-first, so the stylesheet IS the config. This is
        // what teaches the plugin our custom utilities (glow, glow-brand,
        // glow-sm) and theme tokens (font-narrative, bg-brand).
        entryPoint: "src/app/globals.css",
      },
    },
    rules: {
      "better-tailwindcss/enforce-consistent-class-order": "warn",
      "better-tailwindcss/enforce-consistent-variant-order": "warn",
      "better-tailwindcss/no-unknown-classes": [
        "error",
        {
          // Plain CSS classes, not Tailwind utilities, so the plugin cannot see
          // them in the entry point. Listed explicitly rather than by prefix:
          // an agent inventing `lens-family` should still get caught.
          ignore: [
            "^dark$",
            "^lens-romantic$",
            "^lens-business$",
            "^lens-friendship$",
          ],
        },
      ],
      "better-tailwindcss/no-conflicting-classes": "error",
      "better-tailwindcss/no-duplicate-classes": "warn",
      "better-tailwindcss/no-deprecated-classes": "warn",

      // NOT enabled: enforce-consistent-line-wrapping. It rewraps className
      // strings and would fight Biome's formatter.

      // Tokens are the only styling source. A raw hex means someone bypassed
      // the system -- including inside arbitrary values like `bg-[#0ff]`, since
      // that is still a string literal. Kept in ESLint rather than as a Biome
      // GritQL plugin because GritQL matches JS string literals but not JSX
      // attribute values, which is where the likely violation lives.
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\\b/]",
          message:
            "No raw hex colours. Use a design token instead (bg-card, text-primary, border-border, or var(--brand)). Tokens live in src/app/globals.css; see docs/design/design-tokens.json.",
        },
      ],
    },
  },

  // -- shadcn-owned source: Next rules still apply, ours do not --------------
  {
    files: ["src/components/ui/**"],
    rules: {
      "better-tailwindcss/enforce-consistent-class-order": "off",
      "better-tailwindcss/enforce-consistent-variant-order": "off",
      "better-tailwindcss/no-unknown-classes": "off",
      "better-tailwindcss/no-duplicate-classes": "off",
      "no-restricted-syntax": "off",
    },
  },
];
