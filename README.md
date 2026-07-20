# Task Launcher

Внутреннее русскоязычное mobile-first PWA для быстрой постановки задач в облачном Bitrix24. Первый milestone реализует полностью локальный mock-сценарий: разработчику не нужны Supabase, Vercel, webhook или другие внешние ресурсы.

Канонический индекс продуктовой, архитектурной и QA-документации находится в [docs/README.md](./docs/README.md). Действующее требуемое поведение зафиксировано в [docs/product/current-scope.md](./docs/product/current-scope.md), а известные расхождения текущего интерфейса — в [docs/qa/findings.md](./docs/qa/findings.md).

## Что уже работает

- закрытый dev-only вход под mock-администратором или редактором;
- адаптивная навигация для desktop, iPhone и Android;
- создание задачи по проекту и названию, с пустым по умолчанию сроком и безопасными mock-вложениями;
- server-only контракт `Bitrix24Client` и mock-адаптер;
- сценарии успешного ответа, ошибки Bitrix24 и неизвестного статуса после timeout;
- защита от двойной отправки по idempotency key и ручной повтор после timeout с новым ключом;
- компактная история с доменными статусами и фильтром по проекту;
- административный mock CRUD проектов с серверной проверкой роли;
- mock-экраны пользователей и состояния интеграции;
- PWA manifest, иконки и инструкция по установке;
- unit/integration-тесты, Playwright E2E и GitHub Actions.

Данные mock-сценария хранятся только в памяти процесса и сбрасываются после перезапуска dev-сервера.

## Требования

- Node.js 24 LTS;
- pnpm 11.9 или новее.

## Локальный запуск

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Откройте [http://localhost:3000/login](http://localhost:3000/login) и выберите одну из mock-персон. Пароль и открытая регистрация в этом milestone не используются.

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

Не добавляйте webhook, пароли или service-role credentials в Git, browser-visible переменные, fixtures и логи. Переменные будущей live-интеграции не должны иметь префикс `NEXT_PUBLIC_`.

Mock-вход и mock-интеграция доступны только в development. Production-сборка показывает закрытый экран входа и не выполняет mock-мутации.

## Что пока не подключено

Supabase Auth/Postgres/RLS, постоянное хранение, реальный Bitrix24 REST, live-статусы, реальная загрузка файлов, Vercel deployment, service worker и офлайн-создание задач будут добавляться в следующих milestones. Актуальные границы этапов находятся в [docs/roadmap.md](./docs/roadmap.md).
