# Repository Guidelines

## Project Structure & Module Organization
`src/` holds the front-end: `main.tsx` boots React, `App.tsx` wires routing, and `App.css`/`index.css` hold shared state. Organize UI bits under `src/components`, reusable logic under `src/hooks`, integration helpers under `src/integrations`, shared utilities under `src/lib`, and the composed pages under `src/pages`. Static supply is in `public/`, and the `supabase/` directory keeps migration/seed definitions when you sync against the Lovable-managed backend.

## Build, Test, and Development Commands
- `npm install` – hydrate `node_modules` before running anything.
- `npm run dev` – launches Vite’s dev server with hot reload and the built-in Lovable proxy.
- `npm run build` – produces a production bundle for deployment.
- `npm run build:dev` – compiles with the development mode settings if you need faster builds for manual QA.
- `npm run preview` – runs `vite preview` so you can verify the production bundle locally.
- `npm run lint` – enforces the ESLint + TypeScript config used in the repo; fix violations before pushing.

## Coding Style & Naming Conventions
Sources are TypeScript/TSX with two-space indentation. Keep React components in `PascalCase`, hooks/utility functions in `camelCase`, and use the `@/*` path alias defined in `tsconfig` when referencing anything inside `src/`. Follow ESLint’s opinionated rules (see `eslint.config.js`) and re-run `npm run lint` after renaming files. Tailwind classes target the `src/components/ui` family exported through the custom shadcn UI layer.

## Testing Guidelines
There is no automated test suite yet; rely on `npm run dev` for manual verification and `npm run build` to ensure the compiler succeeds. When you add tests, place them near the units they cover (e.g., `src/pages/Dashboard.test.tsx`) and name them `*.test.tsx` or `*.test.ts`. Document your manual testing steps on the PR if the change affects visual flows.

## Commit & Pull Request Guidelines
Write descriptive, present-tense commits (e.g., `feat: add fleet chart`). Mention related Lovable issues or GitHub issue numbers in commit and PR summaries. PRs should include (1) a short description, (2) testing steps, and (3) screenshots or recording links if you touched the UI. Confirm that the preview build passes before merging so Lovable can auto-deploy without surprises.

## Configuration & Deployment Tips
Secrets live in Lovable’s dashboard, not in the repo; do not commit `.env` files. Keep any Supabase adjustments tightly scoped within `supabase/` and rerun `npm run build` after updating SQL or migration files to ensure the front-end consumes the new schema.
