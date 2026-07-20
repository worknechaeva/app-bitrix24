# Task Launcher — текущий план milestone

**Статус:** первый QA-пакет завершен. QA-001–QA-018 имеют статус `Fixed`, preventive security coverage зафиксировано в QA-019; regression-набор проходит на desktop Chromium, iPhone WebKit и Android Chromium.

Канонические границы этапов находятся в [docs/roadmap.md](./docs/roadmap.md), действующее поведение — в [docs/product/current-scope.md](./docs/product/current-scope.md), полные формулировки, тесты и hash всех наблюдений — в [docs/qa/findings.md](./docs/qa/findings.md).

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
- добавлены mock-выбор нескольких файлов и сохранение только безопасных метаданных;
- добавлены доменные статусы, компактная история и фильтр по проекту;
- добавлены mock `ProjectRepository` и административный CRUD проектов;
- QA-001–QA-019 связаны с regression-тестами и коммитами исправлений в каноническом QA-журнале.

## Последние закрытые QA-наблюдения

| QA     | Наблюдение и исправление                                                                                                                                  | Regression-тест                                                                                                                                                         | Коммит    |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| QA-015 | «Кнопка отправки была доступна до завершения hydration»: основной сценарий дожидается интерактивной кнопки и success-экрана.                              | `mock user creates a task without duplicate submission`                                                                                                                 | `880b3e6` |
| QA-016 | «Длинное имя файла растягивает мобильную форму»: min-content больше не расширяет контейнер, имя сокращается внутри карточки.                              | `long file name stays contained and a multi-megabyte mock file submits`                                                                                                 | `02663aa` |
| QA-017 | «Файл больше 1 МБ ломает mock-отправку формы»: бинарное содержимое исключено из Server Action, mock передает и повторно проверяет метаданные.             | `long file name stays contained and a multi-megabyte mock file submits`; `rejects untrusted malformed metadata`                                                         | `02663aa` |
| QA-018 | «После выбора файла нет явного действия для добавления следующего»: добавлена кнопка последовательного выбора без замены файлов и состояние лимита 10.    | `user explicitly adds more files without replacing the selected ones`; `file picker explains when the ten-file limit is reached`                                        | `e6ed023` |
| QA-019 | «Нет прямого regression-покрытия серверной проверки роли редактора»: обе административные Server Actions напрямую проверены с editor/admin mock-сессиями. | `rejects direct editor calls to every project mutation without changing the repository`; `allows an administrator to create update deactivate and reactivate a project` | `afc5d64` |

## Не входит в текущий milestone

- Supabase Auth, Postgres и RLS;
- production-авторизация и постоянное хранение;
- live Bitrix24 webhook, загрузка файлов и синхронизация статусов;
- Vercel deployment;
- offline, push, аналитика, AI и несколько порталов.

## Проверка

После каждой пачки кода выполняются format check, lint, typecheck, unit/integration tests, Playwright E2E и production build. Документационная задача проверяется отдельно на ссылки, непротиворечивость, форматирование и чистоту diff.
