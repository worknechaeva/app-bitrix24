# Roadmap

Roadmap фиксирует границы этапов, а не календарные обещания. Перенос функции между этапами требует обновления этого файла и, при изменении поведения, продуктового решения.

## Milestone 1 — устойчивый mock-сценарий завершен

- рабочий адаптивный mock-интерфейс;
- исправление найденных UX-багов;
- mock CRUD проектов с серверной проверкой роли;
- mock-выбор файлов и безопасные метаданные;
- доменная UI-модель статусов;
- фильтр истории по проекту;
- безопасный ручной повтор после timeout с новым idempotency key;
- regression-тесты для QA-001–QA-019;
- development-only mock без production success.

История реализации и закрытых наблюдений остается в [QA-журнале](./qa/findings.md). Mock-модель проектов первого milestone заменяется постоянными персональными `launcher_projects` в Milestone 2.

## Milestone 2 — OAuth, Supabase foundation и directory

### 1. Documentation synchronization

- синхронизировать current scope, decisions, architecture, roadmap, PLAN и README;
- зафиксировать Auth-вариант B, таблицы, authorization и границы milestones;
- не создавать ресурсы и не начинать spikes в документационной пачке.

### 2. Четыре technical spikes

Spikes запускаются только после отдельного подтверждения и на непроизводственных данных:

1. OAuth отдельного PWA через локальное приложение Bitrix24.
2. Проверка `member_id`, portal identity и безопасного обновления domain.
3. Directory group/project/scrum, исключение collab и extranet-enabled сущностей, проверка `create_tasks`.
4. Directory active employee, сравнение методов поиска и минимальных scopes.

Supabase Custom OAuth spike не входит в Milestone 2.

Migration каждого подсистемного этапа создается только после утверждения результата соответствующего blocking spike:

- OAuth PWA и portal identity spikes блокируют portal, profiles, sessions и credentials foundation;
- directory entity spike блокирует реализацию group/project/scrum directory;
- directory employee spike блокирует реализацию employee directory;
- после успешных OAuth PWA и portal identity spikes directory spikes не блокируют начало portal, profiles, sessions и credentials foundation.

### 3. Portal foundation

- конфигурация одного portal `member_id` на deployment;
- `portal_installations`;
- проверка OAuth callback, state, domain и portal mismatch;
- запрет выбора портала пользователем.

### 4. Profiles и роли

- profiles без обязательной зависимости от `auth.users`;
- роли `administrator/editor` внутри Task Launcher;
- первый administrator через `BOOTSTRAP_ADMIN_BITRIX_USER_ID`;
- защита последнего активного administrator;
- блокировка inactive и внешних пользователей.

### 5. Sessions и encrypted credentials

- собственные Postgres-backed `app_sessions`;
- `oauth_transactions` с hash одноразового state;
- `bitrix24_user_credentials` отдельно от profiles;
- encryption key вне БД;
- атомарная rotation access/refresh token pair с `token_version`;
- logout, revocation, cleanup и `reauth_required`.

### 6. Directory clients

- live `Bitrix24IdentityClient`;
- live `Bitrix24DirectoryClient`;
- server-side pagination и минимальные DTO;
- доступные group/project/scrum и active employee;
- повторная проверка Bitrix permissions перед сохранением справочной связи.

### 7. Персональные launcher projects

- owner для каждой локальной настройки;
- editor видит свои, administrator — все;
- owner изменяет собственные настройки;
- administrator архивирует/восстанавливает чужие только узкой RPC;
- append-only audit и отсутствие физического удаления;
- несколько локальных записей для одной Bitrix-сущности.

### 8. Authorization и PostgreSQL RPC

- app session и server-only DAL как источник actor identity;
- actor-aware repositories;
- RLS и grants закрывают Data API для `anon/authenticated`;
- service-role только в privileged database gateway;
- транзакционные RPC для ролей, sessions, archive/restore и token rotation;
- adversarial regression-тесты доступа.

### 9. Persistent submissions history

- таблицы `task_submissions` и `task_submission_files`;
- отдельная запись на каждую явную попытку;
- `pending/success/error/unknown`;
- editor видит собственную историю, administrator — общую;
- safe errors и metadata в `task_submission_files` — имя, MIME-тип и размер — без binary и `content_sha256`;
- реальная загрузка файлов в Bitrix24 остается за границами Milestone 2;
- nullable reservation полей будущей status synchronization без изменения текущего UI `TaskStatus`.

### 10. Production guards

- запрет mock Auth и mock Identity/Directory в production;
- `DisabledBitrix24TaskClient` с fail-closed поведением в production;
- запрет mock `operation_status=success` и фиктивного `bitrix_task_id` в production;
- server-only secrets и environment validation.

### 11. Vercel readiness

- разделение development/preview/production environment;
- фиксированный canonical origin и OAuth callback;
- sensitive server-only secrets;
- проверка production composition root без создания Vercel resource в документационной пачке.

### 12. QA

- format, lint, typecheck, unit/integration, E2E и production build;
- security regression для sessions, roles, portal isolation, repositories и RPC;
- проверка, что документация и реализованный scope совпадают.

## Следующий интеграционный milestone — live task operations

- live `Bitrix24TaskClient`;
- `tasks.task.add` от имени текущего OAuth-пользователя;
- реальная загрузка файлов;
- TAGS в group и project;
- TAGS и backlog в Scrum;
- live task status;
- `OnTaskUpdate`;
- polling;
- проверка доставки Bitrix24 offline events;
- contract tests на очищенных ответах test portal.

## Не входит в Milestone 2

- Supabase Auth и Supabase Custom OAuth Provider;
- внутренний JWT для Supabase;
- live task creation и status synchronization;
- несколько порталов на deployment;
- PWA offline mode, офлайн-создание задач и push-уведомления;
- аналитика, клиентский кабинет, velocity, план-факт и AI.
