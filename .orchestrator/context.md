# Контекст агенту-разработчику

## Проект

- Task Launcher – русскоязычное PWA для задач в Bitrix24. (README.md, «Task Launcher»; docs/product/current-scope.md, «Формат продукта и портал»)
- Модульный монолит: Next.js App Router, strict TypeScript, серверный слой, use case, repository/integration, БД/RPC и Bitrix24. (docs/architecture.md, «Приложение», «Направление зависимостей»)
- Один deployment – один портал; OAuth только для active employee; роли `administrator` и `editor` локальные. (docs/product/current-scope.md, «Формат продукта и портал», «Вход и роли»)
- Milestone 2: OAuth, Supabase foundation, Directory, персональные проекты готовы локально. Удаленная схема, submissions и live task creation не подключены. (docs/roadmap.md, «Milestone 2», «Следующий интеграционный milestone»; README.md, «Что пока не подключено»)

## Обязательные правила

- Не возвращать удаленные поля/функции без нового явного решения пользователя. (AGENTS.md, «Правила изменений»)
- При изменении поведения обновить scope, QA и regression test; продуктовое решение – при изменении продукта, roadmap – при смене границ milestone. (AGENTS.md, «Правила изменений»)
- Сверять документацию с кодом и соблюдать архитектуру. Писать по-русски, заменяя букву е с двумя точками на е. (AGENTS.md, «Правила изменений»)
- Не хранить секреты в документации, Git, fixtures, frontend bundle, логах и пользовательских ошибках. OAuth tokens и database credentials держать server-only. (AGENTS.md, «Правила изменений»; docs/product/current-scope.md, «Вход и роли»)
- Не менять и не переписывать старые коммиты. Не делать push, PR или merge без явного разрешения пользователя. (AGENTS.md, «Правила изменений»)
- Удаленные migrations не применять; migration этапа создавать после утверждения блокирующего spike. (docs/product/current-scope.md, «Хранение Milestone 2»; docs/roadmap.md, «Четыре technical spikes»)
- Права и actor проверять на сервере по app session; ID из URL/формы/browser не есть identity. User-scoped RLS нет; Data API закрыт `anon`/`authenticated`; service-role только в privileged gateway. (docs/architecture.md, «Направление зависимостей», «Supabase, grants и authorization»)
- В production запрещены mock Auth/Identity/Directory и фиктивный success. Live task client, загрузка файлов и синхронизация статусов – следующий milestone. (docs/roadmap.md, «Production guards», «Следующий интеграционный milestone»)

## Карта каталогов

- `src/app/` – App Router, API handlers, PWA metadata. (README.md, «Структура»)
- `src/components/` – общий UI. (README.md, «Структура»)
- `src/features/` – проекты, история, задачи. (README.md, «Структура»)
- `src/integrations/bitrix24/` – контракты и клиенты. (README.md, «Структура»)
- `src/lib/env/` – серверная проверка environment. (README.md, «Структура»)
- `src/server/` – auth, repositories, use cases. (README.md, «Структура»)
- `tests/unit/` – unit-тесты. (README.md, «Структура»)
- `tests/integration/` – интеграционные тесты. (README.md, «Структура»)
- `tests/database/` – Vitest database tests. (vitest.database.config.ts, `include`)
- `tests/e2e/` – Playwright браузерные тесты. (README.md, «Структура»)
- `supabase/migrations/` – локальные SQL migrations. (docs/product/current-scope.md, «Хранение Milestone 2»)
- `supabase/tests/database/` – SQL regression tests. (docs/roadmap.md, «Profiles и роли», «QA»)
- `docs/` – продукт, решения, архитектура, roadmap и QA. (docs/README.md, «Документация Task Launcher»)

## Проверки

- `pnpm format:check` – Prettier; `pnpm lint` – ESLint; `pnpm typecheck` – `tsc --noEmit`. Короткие проверки. (package.json, scripts)
- `pnpm test` – Vitest unit/integration. (package.json, `test`)
- `pnpm test:database` – Vitest по `tests/database/`; CI запускает Supabase stack и задает test environment. (package.json, `test:database`; vitest.database.config.ts; .github/workflows/ci.yml)
- `pnpm test:e2e` – Playwright; перед первым запуском README требует `pnpm exec playwright install chromium webkit`. (package.json, `test:e2e`; README.md, «Команды проверки»)
- `pnpm build` – production build Next.js. (package.json, `build`)

## Соглашения

- Тесты: `tests/unit/`, `tests/integration/`, `tests/database/`, `tests/e2e/`; файлы `*.test.ts(x)`/`*.spec.ts`. (README.md, «Структура»; vitest.database.config.ts; tests/)
- SQL migrations – `supabase/migrations/`, SQL tests – `supabase/tests/database/`; migration этапа создавать после blocking spike. (supabase/migrations/; supabase/tests/database/; docs/product/current-scope.md, «Хранение Milestone 2»)
- Markdown проверять Prettier; текст по-русски, букву е с двумя точками заменять на е. Decisions `Active` действуют, `Superseded` – история; учитывать открытые QA. (package.json, `format:check`; AGENTS.md; docs/README.md, «Статусы»)

## Без решения владельца не менять

- Удаленные поля задачи и продуктовые границы: один портал, OAuth Bitrix24, локальные роли, ownership проектов и отсутствие физического удаления. (AGENTS.md, «Правила изменений»; docs/product/current-scope.md, «Формат продукта и портал», «Вход и роли», «Launcher projects»; docs/product/decisions.md, DEC-006–DEC-008, DEC-020, DEC-024–DEC-025)
- Не вводить Supabase Auth/Custom OAuth/JWT, несколько порталов, live task operations в Milestone 2 и изменения удаленной схемы. (docs/roadmap.md, «Не входит в Milestone 2», «Следующий интеграционный milestone»; docs/product/current-scope.md, «Хранение Milestone 2»)

## Где читать подробности

- `AGENTS.md` – порядок чтения, приоритет требований, правила и проверки. (AGENTS.md)
- `README.md` – обзор, локальный запуск и команды. (README.md)
- `docs/README.md` – индекс документации. (docs/README.md)
- `docs/product/current-scope.md` – scope. (docs/product/current-scope.md)
- `docs/product/decisions.md` – действующие решения (`Active`). (docs/product/decisions.md)
- `docs/architecture.md` – архитектурные границы. (docs/architecture.md)
- `docs/roadmap.md` – этапы проекта. (docs/roadmap.md)
- `docs/qa/findings.md` – открытые проблемы. (docs/qa/findings.md)
