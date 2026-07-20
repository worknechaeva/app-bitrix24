# Task Launcher development guide

## Product scope

Task Launcher is a Russian-language, mobile-first PWA for quickly creating tasks in a single cloud Bitrix24 portal. Keep the first milestone self-contained and runnable without Supabase, Vercel, or a real Bitrix24 webhook.

## Engineering rules

- Use Next.js App Router, React, strict TypeScript, Tailwind CSS, and shadcn/ui-style local components.
- Keep Bitrix24 access server-only behind `src/integrations/bitrix24/Bitrix24Client`.
- Never commit credentials or expose webhook values through `NEXT_PUBLIC_*`, UI errors, fixtures, logs, or documentation.
- Keep mock authentication and mock Bitrix24 behavior unavailable in production.
- Write all user-facing copy in Russian and use `е` instead of `ё`.
- Prefer Server Components; add Client Components only for interactive UI.
- Validate external and form inputs with Zod.
- Keep touch targets at least 44 px and preserve keyboard and screen-reader accessibility.
- Do not add offline task submission, analytics, imports, AI features, or multi-portal support in this milestone.

## Required checks

Run before handoff:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```
