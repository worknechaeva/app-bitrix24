# Task Launcher — coding milestone 1

**Status:** implemented and verified locally on 2026-07-20.

## Goal

Deliver a runnable, adaptive PWA prototype with a development-only mock login and a complete mock task-creation flow. No external account or secret is required.

## Deliverables

- Next.js App Router project with strict TypeScript, Tailwind CSS, local UI primitives, ESLint, Prettier, Vitest, and Playwright.
- Routes: `/login`, `/`, `/tasks/new`, `/submissions`, `/projects`, `/settings/bitrix24`, `/settings/users`, and `/install`.
- Mobile-first application shell and Russian UI.
- Server-only `Bitrix24Client` contract and deterministic mock implementation.
- Task form with required project/title fields, optional parameters, idempotency protection, success, error, and unknown-timeout states.
- PWA manifest, application icons, environment validation, fixtures, tests, CI, and setup documentation.

## Out of scope

- Real Supabase sessions, database migrations, RLS, and user provisioning.
- Real Bitrix24 webhook calls and persistence across server restarts.
- Vercel deployment, custom domain, offline task creation, push notifications, and later product stages.

## Acceptance checks

- A developer can run the project using only the documented local commands.
- Mock admin and editor personas can enter the protected interface in development.
- A valid task is created once per idempotency key and returns a confirmation with a mock Bitrix24 ID.
- Error and timeout fixtures produce safe, understandable messages.
- Desktop, iPhone, and Android Playwright smoke flows pass.
- Lint, typecheck, unit tests, E2E tests, and production build pass.

## Verification record

- ESLint and strict TypeScript pass without warnings or errors.
- Vitest covers schema validation, the mock adapter, default mapping, errors, timeout, and duplicate idempotency keys.
- Playwright passes in desktop Chromium, iPhone WebKit, and Android Chromium.
- Next.js production build completes with all milestone routes and the generated manifest.
