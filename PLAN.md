# Task Launcher — текущий план milestone

**Статус:** устойчивый mock-сценарий и UX-исправления QA-001–014 реализованы; regression-набор подготовлен для desktop Chromium, iPhone WebKit и Android Chromium.

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

## Результат текущей пачки

- исправлены мобильная навигация, главная страница и выбор недавнего проекта;
- удалены устаревшие поля приоритета, оценки и управления учетом времени;
- срок пуст по умолчанию, очищается и не передается при пустом значении;
- добавлены безопасный ручной повтор после timeout и новый idempotency key;
- добавлены mock-выбор файлов и сохранение только безопасных метаданных;
- добавлены доменные статусы, компактная история и фильтр по проекту;
- добавлены mock `ProjectRepository` и административный CRUD проектов;
- QA-001–014 связаны с regression-тестами и коммитом исправления.

## Не входит в текущий milestone

- Supabase Auth, Postgres и RLS;
- production-авторизация и постоянное хранение;
- live Bitrix24 webhook, загрузка файлов и синхронизация статусов;
- Vercel deployment;
- offline, push, аналитика, AI и несколько порталов.

## Проверка

После каждой пачки кода выполняются format check, lint, typecheck, unit/integration tests, Playwright E2E и production build. Документационная задача проверяется отдельно на ссылки, непротиворечивость, форматирование и чистоту diff.
