# Task Launcher — текущий план milestone

**Статус:** базовый mock-сценарий реализован и проверен; документационный baseline создан; UX-исправления из QA-журнала еще не реализованы.

Канонические границы этапов находятся в [docs/roadmap.md](./docs/roadmap.md), действующее поведение — в [docs/product/current-scope.md](./docs/product/current-scope.md), открытые проблемы — в [docs/qa/findings.md](./docs/qa/findings.md).

## Цель текущего milestone

Довести локальный mobile-first mock-сценарий до согласованного продуктового поведения без подключения Supabase и настоящего Bitrix24.

## Уже готово

- Next.js App Router, strict TypeScript, Tailwind CSS и локальные UI-компоненты.
- Dev-only mock-вход администратора и редактора.
- Адаптивный app shell и основные маршруты.
- Server-only контракт `Bitrix24Client` и mock-адаптер.
- Создание mock-задачи, базовая idempotency, success/error/unknown состояния.
- PWA manifest и иконки.
- Vitest, Playwright и GitHub Actions.
- Каноническая продуктовая, архитектурная, QA- и roadmap-документация.

## Следующая пачка реализации

- исправить открытые UX-проблемы из `docs/qa/findings.md`;
- удалить устаревшие поля приоритета, оценки и управления учетом времени;
- добавить безопасный ручной повтор после timeout;
- добавить mock-выбор файлов и безопасные метаданные;
- добавить доменные статусы и фильтр истории;
- добавить mock `ProjectRepository` и административный CRUD проектов;
- добавить регрессионные тесты и только после них переводить QA-записи в `Fixed`.

## Не входит в текущий milestone

- Supabase Auth, Postgres и RLS;
- production-авторизация и постоянное хранение;
- live Bitrix24 webhook, загрузка файлов и синхронизация статусов;
- Vercel deployment;
- offline, push, аналитика, AI и несколько порталов.

## Проверка

После каждой пачки кода выполняются format check, lint, typecheck, unit/integration tests, Playwright E2E и production build. Документационная задача проверяется отдельно на ссылки, непротиворечивость, форматирование и чистоту diff.
