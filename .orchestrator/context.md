# Контекст агенту-разработчику

## Проект

- Task Launcher – русскоязычное PWA для задач в Bitrix24. (README.md, «Task Launcher»; docs/product/current-scope.md, «Формат продукта и портал»)
- Модульный монолит: Next.js App Router, strict TypeScript, серверный слой, use case, repository/integration, БД/RPC и Bitrix24. (docs/architecture.md, «Приложение», «Направление зависимостей»)
- Один deployment – один портал; OAuth только для active employee; роли `administrator` и `editor` локальные. (docs/product/current-scope.md, «Формат продукта и портал», «Вход и роли»)
- Milestone 2: OAuth, Supabase foundation, Directory, персональные проекты готовы локально. Remote Supabase schema, persistent submissions и live task creation не подключены. (docs/roadmap.md, «Milestone 2», «Следующий интеграционный milestone»; README.md, «Что пока не подключено»)

## Обязательные правила

- Не возвращать удаленные из задачи поля «Приоритет», «Оценка в часах», «Учет времени» без нового явного решения пользователя. (AGENTS.md, «Правила изменений»; docs/product/decisions.md, DEC-006–DEC-008)
- При изменении поведения обновить scope, QA и regression test; продуктовое решение – при изменении продукта, roadmap – при смене границ milestone. (AGENTS.md, «Правила изменений»)
- Сверять документацию с кодом и соблюдать архитектуру. Пользовательские тексты писать по-русски, буква е с двумя точками заменяется на е. (AGENTS.md, «Правила изменений»)
- Не хранить секреты в документации, Git, fixtures, frontend bundle, логах и пользовательских ошибках. OAuth tokens и database credentials держать server-only. (AGENTS.md, «Правила изменений»; docs/product/current-scope.md, «Вход и роли»)
- Не менять и не переписывать старые коммиты. Не делать push, PR или merge без явного разрешения пользователя. (AGENTS.md, «Правила изменений»)
- Migrations только в `supabase/migrations/` и только для local Supabase; к remote (облачной) базе их не применять. (docs/product/current-scope.md, «Authorization и база»; docs/architecture.md, вводный абзац)
- Права и actor проверять на сервере по app session; ID из URL/формы/browser не есть identity. User-scoped RLS нет; Data API закрыт `anon`/`authenticated`; service-role только в privileged gateway. (docs/architecture.md, «Направление зависимостей», «Supabase, grants и authorization»)
- В production запрещены mock Auth/Identity/Directory и фиктивный success. Live task client, загрузка файлов и синхронизация статусов – следующий milestone. (docs/roadmap.md, «Production guards», «Следующий интеграционный milestone»)

## Карта каталогов

- `src/app/` – App Router, API handlers, PWA metadata; `src/components/` – общий UI; `src/features/` – projects, submissions, tasks. (README.md, «Структура»; src/)
- `src/integrations/bitrix24/` – контракты и клиенты; `src/lib/env/` – серверная проверка environment. (README.md, «Структура»)
- `src/server/` – auth, oauth, portal, profile, credentials, directory, database (privileged gateway), repositories, services, files; `oauth-spike/` – только dev/test диагностика. (src/server/; docs/product/current-scope.md, «Technical spikes Milestone 2»)
- `tests/unit/`, `tests/integration/`, `tests/database/` (Vitest), `tests/e2e/` (Playwright); файлы `*.test.ts(x)`, `*.spec.ts`. (README.md, «Структура»; vitest.database.config.ts; tests/)
- `supabase/migrations/` – локальные SQL migrations; `supabase/tests/database/` – pgTAP `*.test.sql`. (docs/product/current-scope.md, «Хранение Milestone 2»; docs/roadmap.md, «Profiles и роли»)
- `docs/` – продукт, решения, архитектура, roadmap и QA. (docs/README.md)

## Проверки

- Перед передачей выполнить применимые: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`. (AGENTS.md, «Проверки»; package.json, scripts)
- `format:check` – Prettier, `lint` – ESLint, `typecheck` – `tsc --noEmit`, `test` – Vitest unit/integration. (package.json, scripts)
- `pnpm test:e2e` – Playwright; перед первым запуском `pnpm exec playwright install chromium webkit`. (package.json; README.md, «Команды проверки»)
- `pnpm test:database` требует local Supabase stack и в список AGENTS.md не входит; в CI запускается отдельным job вместе с pgTAP. (package.json; vitest.database.config.ts; .github/workflows/ci.yml)

## Соглашения

- Prettier: printWidth 110, двойные кавычки, точки с запятой, trailing commas; импорт `@/*` – это `src/*`; серверные модули в `src/server/` импортируют `server-only` (кроме mock-only `auth/mock-session.ts` и `fixtures.ts`). (.prettierrc.json; tsconfig.json; src/server/oauth/; src/server/)
- Decisions `Active` действуют, `Superseded` – история; учитывать открытые QA-записи (сейчас Open нет). (AGENTS.md, «Обязательный контекст»; docs/README.md, «Статусы»)

## Без решения владельца не менять

- Продуктовые границы: один портал, OAuth Bitrix24, локальные роли, ownership проектов, отсутствие физического удаления. (docs/product/current-scope.md, «Формат продукта и портал», «Вход и роли», «Launcher projects»; docs/product/decisions.md, DEC-020, DEC-024–DEC-025)
- Не вводить Supabase Auth/Custom OAuth/JWT, несколько порталов и live task operations в Milestone 2. (docs/roadmap.md, «Не входит в Milestone 2»; docs/product/current-scope.md, «Следующий интеграционный milestone»)

## Где читать подробности

- Перед задачей полностью читать: AGENTS.md, docs/README.md, docs/product/current-scope.md, docs/product/decisions.md, docs/architecture.md, docs/roadmap.md, docs/qa/findings.md. (AGENTS.md, «Обязательный контекст»)
