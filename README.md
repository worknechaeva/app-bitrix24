# Task Launcher

Внутреннее русскоязычное mobile-first PWA для быстрой постановки задач в облачном Bitrix24. Первый milestone реализовал полностью локальный mock-сценарий. Для Milestone 2 утверждены Bitrix24 OAuth, Supabase Postgres foundation, справочники портала и постоянное хранение, но их реализация и technical spikes еще не начинались.

Канонический индекс продуктовой, архитектурной и QA-документации находится в [docs/README.md](./docs/README.md). Действующее требуемое поведение зафиксировано в [docs/product/current-scope.md](./docs/product/current-scope.md), а известные расхождения текущего интерфейса — в [docs/qa/findings.md](./docs/qa/findings.md).

## Что уже работает

- закрытый dev-only вход под mock-администратором или редактором;
- адаптивная навигация для desktop, iPhone и Android;
- создание задачи по проекту и названию, с пустым по умолчанию сроком и безопасными mock-вложениями;
- server-only контракт `Bitrix24Client` и mock-адаптер первого milestone;
- сценарии успешного ответа, ошибки Bitrix24 и неизвестного статуса после timeout;
- защита от двойной отправки по idempotency key и ручной повтор после timeout с новым ключом;
- компактная история с доменными статусами и фильтром по проекту;
- административный mock CRUD проектов с серверной проверкой роли;
- mock-экраны пользователей и состояния интеграции;
- PWA manifest, иконки и инструкция по установке;
- unit/integration-тесты, Playwright E2E и GitHub Actions.

Данные mock-сценария хранятся только в памяти процесса и сбрасываются после перезапуска dev-сервера.

## Утвержденная архитектура Milestone 2

- Task Launcher остается отдельным PWA; один deployment обслуживает один заранее настроенный облачный portal Bitrix24.
- Вход выполняется через Bitrix24 OAuth только для active employee; пользователь не выбирает портал.
- Supabase Auth, email/password, invite, reset password, SMTP и внутренний Supabase JWT не используются.
- Браузер получает только непрозрачную app session cookie с production-флагами `HttpOnly`, `Secure` и `SameSite=Lax`; Bitrix24 tokens и database credentials остаются server-only.
- Интеграция разделяется на `Bitrix24IdentityClient`, `Bitrix24DirectoryClient` и `Bitrix24TaskClient`.
- Identity и Directory входят в Milestone 2. Live Task client, создание задач, реальная загрузка файлов в Bitrix24, TAGS, Scrum backlog и status synchronization относятся к следующему milestone.
- Постоянная модель использует персональные `launcher_projects`, profiles, sessions, encrypted credentials и persistent submissions history.
- User-scoped Supabase RLS отсутствует: права проверяют app session, server-only DAL, repositories и узкие PostgreSQL RPC; Data API закрывается grants и RLS от `anon/authenticated`.

Полный scope находится в [docs/product/current-scope.md](./docs/product/current-scope.md), а порядок этапов и четыре обязательных spike — в [docs/roadmap.md](./docs/roadmap.md).

## Требования

- Node.js 24 LTS;
- pnpm 11.9 или новее.

## Локальный запуск

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Откройте [http://localhost:3000/login](http://localhost:3000/login) и выберите одну из mock-персон. Это development-only сценарий реализованного первого milestone; production OAuth Milestone 2 еще не подключен.

В форме новой задачи доступны фиктивные проекты «Технарост» и «Форма». Раскройте блок «Дополнительные параметры», чтобы выбрать проверочный сценарий:

- успешное создание возвращает mock-ID и безопасную ссылку;
- ошибка показывает нормализованное сообщение без внешнего ответа;
- timeout оставляет статус неизвестным, запрещает автоматический повтор и предлагает новую ручную попытку после проверки портала.

Вложения в mock-режиме реально не загружаются: сервер проверяет тип и лимит 20 МБ, а в операции сохраняются только имя, размер и MIME type. Изменения проектов и история новых операций находятся в памяти процесса и сбрасываются после перезапуска.

## Команды проверки

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

Перед первым E2E-запуском установите проектные браузеры:

```bash
pnpm exec playwright install chromium webkit
```

Playwright проверяет основной сценарий и manifest в desktop Chromium, iPhone WebKit и Android Chromium.

## Структура

```text
src/
  app/                         маршруты App Router и PWA metadata
  components/                  app shell и локальные UI-компоненты
  features/                    проекты, история и task form
  integrations/bitrix24/       контракт, DTO и mock-адаптер
  lib/env/                     server-side валидация environment
  server/                      fixtures, auth guard, repositories, file boundary и use cases
tests/
  unit/                        схемы и mock-клиент
  integration/                 task use case и idempotency
  e2e/                         desktop/iPhone/Android smoke flows
```

Краткий план milestone описан в [PLAN.md](./PLAN.md), устойчивые технические границы — в [docs/architecture.md](./docs/architecture.md), правила работы с репозиторием — в [AGENTS.md](./AGENTS.md).

## Environment и секреты

`.env.example` содержит только названия переменных и пустые/фиктивные значения. Для текущего milestone достаточно:

```dotenv
APP_RUNTIME_MODE=mock
BITRIX24_MODE=mock
```

Не добавляйте OAuth tokens, client secret, encryption key или service-role credentials в Git, browser-visible переменные, fixtures и логи. Переменные будущей live-интеграции не должны иметь префикс `NEXT_PUBLIC_`.

Mock-вход и mock-интеграция доступны только в development. Production-сборка показывает закрытый экран входа и не выполняет mock-мутации.

## Что пока не подключено

Bitrix24 OAuth, Supabase Postgres, app sessions, encrypted credentials, постоянное хранение, live Identity/Directory и Vercel deployment еще не реализованы. Supabase Auth не планируется. Live task creation, реальная загрузка файлов и status synchronization отложены до следующего интеграционного milestone. Актуальные границы этапов находятся в [docs/roadmap.md](./docs/roadmap.md).
