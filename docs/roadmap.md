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

Завершены на непроизводственных данных:

1. OAuth отдельного PWA через локальное API-only приложение Bitrix24.
2. Проверка `member_id`, portal identity и безопасного обновления domain.

Directory contracts проанализированы по официальной REST-документации, production adapter и synthetic contract coverage реализованы локально. Employee methods с `user_brief` и entity methods с `socialnetwork`/`sonet_group` прошли согласованную read-only live verification без portal business mutations.

Supabase Custom OAuth spike не входит в Milestone 2.

Migration каждого подсистемного этапа создается только после утверждения результата соответствующего blocking spike:

- завершенные OAuth PWA и portal identity spikes больше не блокируют portal, profiles, sessions и credentials foundation;
- directory entity spike блокирует реализацию group/project/scrum directory;
- directory employee spike блокирует реализацию employee directory;
- после успешных OAuth PWA и portal identity spikes directory spikes не блокируют начало portal, profiles, sessions и credentials foundation.

### 3. Portal foundation

- server-only конфигурация одного portal `member_id` и canonical origin на deployment — реализована локально;
- storage-independent контракт и политика reconciliation одной portal installation — реализованы;
- `portal_installations`, singleton migration, атомарная PostgreSQL RPC и server-only Supabase adapter — реализованы и подключены к локальному production OAuth callback без изменения удаленной schema;
- проверка OAuth callback, state, domain и portal mismatch;
- запрет выбора портала пользователем.

### 4. Profiles и роли

- profiles без обязательной зависимости от `auth.users`, UUID и unique portal/user identity — foundation реализован локально;
- атомарная reconciliation проверенного active employee с ролью нового profile `editor`, безопасными snapshots и сохранением `role`/`is_active` — реализована локально;
- RLS, grants, pgTAP, database integration и concurrency coverage для profiles — реализованы и подключены к локальному production OAuth callback без изменения удаленной schema;
- первый administrator через lazy server-only `BOOTSTRAP_ADMIN_BITRIX_USER_ID` и database-time `admin_bootstrapped_at` — реализован локально;
- actor-aware управление ролями, concurrency-safe защита последнего active administrator и административная блокировка — реализованы локально;
- атомарные revoke-all пригодных sessions и disable credentials для blocked profile — реализованы локально;
- recovery/reactivation и unblock остаются будущими задачами и не активируют старые `disabled` credentials.

### 5. Sessions и encrypted credentials

- собственные Postgres-backed `app_sessions` с hash-only opaque token, database-time absolute TTL 30 дней, create/resolve/revoke RPC, актуальным actor context, RLS/grants и concurrency coverage — подключены к локальному production OAuth callback, secure cookie, actor facade и logout без изменения удаленной schema;
- `oauth_transactions` с hash одноразового state, database-time TTL 10 минут, safe `return_path`, атомарным consumption, RLS/grants и server-only adapter — подключены к локальным production OAuth routes без изменения удаленной schema;
- `bitrix24_user_credentials` отдельно от profiles, encrypted-only repository boundary и server-only AES-256-GCM service — foundation реализован локально;
- 32-byte base64 environment encryption key вне БД, отдельные random IV и authenticated AAD identity/kind/version — реализованы без production secret;
- initial create, active resolve, атомарная rotation access/refresh token pair с `token_version`, отдельные `reauth_required`/`disabled` outcomes и защита stale refresh failure — реализованы локально с pgTAP и PostgreSQL concurrency coverage;
- credentials foundation подключен к production OAuth callback через отдельные version-safe verified OAuth inspection/replacement RPC; реальный automatic provider refresh и удаленная schema не подключены;
- live `Bitrix24IdentityClient`, production OAuth start/callback/install receipt, проверка `app`/`user_brief`, portal/profile reconciliation, session rotation и secure cookie — реализованы локально;
- live protected runtime открывает persistent launcher projects/Directory; остальные business-страницы до submissions и live task creation показывают fail-closed placeholder и не отображают mock data;
- revocation одной session, browser logout и транзакционный revoke-all при блокировке profile реализованы; cleanup и recovery/reactivation credentials остаются будущими задачами.

### 6. Directory clients

- live `Bitrix24IdentityClient`;
- production `Bitrix24DirectoryClient` по documented и read-only live verified contracts — реализован локально;
- server-side bounded pagination, duplicate/cursor guards, runtime validation и минимальные DTO — реализованы;
- active employee через `user.get`/`user.search` с `user_brief` — реализован и покрыт synthetic contract tests; `user.get` list path live verified, optional `user.search` live не требовался;
- group/project/scrum, collab/extranet/status exclusion и `create_tasks` capability — реализованы fail closed, покрыты synthetic contract tests и read-only live verified с `socialnetwork`/`sonet_group`;
- повторная проверка Bitrix entity capability и active employee перед сохранением launcher project реализована.

### 7. Персональные launcher projects

- реализованы локально: owner для каждой настройки, editor видит свои, administrator — все;
- owner изменяет собственные настройки; administrator архивирует/восстанавливает чужие узкой RPC;
- append-only audit, отсутствие физического удаления и несколько настроек одной Bitrix-сущности;
- live UI использует persistent repository и server-side Directory; mock следует тем же правилам владения.
- создание защищено owner-scoped UUID операции от дублей при потерянном ответе; измененный payload с тем же ключом отклоняется;
- подтвержденная мутация и обновление списка имеют независимые результаты, а сетевые ошибки не оставляют форму заблокированной.

### 8. Authorization и PostgreSQL RPC

- app session и server-only DAL как источник actor identity;
- actor-aware repositories, включая `launcher_projects`;
- RLS и grants закрывают Data API для `anon/authenticated`; реализовано для `portal_installations`, `profiles`, `oauth_transactions`, `app_sessions`, `bitrix24_user_credentials`, `launcher_projects` и их audit events;
- service-role только в privileged database gateway; узкие операции gateway реализованы для `portal_installations`, `profiles`, `oauth_transactions`, `app_sessions` и `bitrix24_user_credentials`;
- транзакционные RPC для bootstrap/ролей/profile block, sessions и archive/restore проектов реализованы; token rotation реализован;
- adversarial regression-тесты actor authorization, last-admin и block/session/credential races реализованы для profile lifecycle.

### 9. Persistent submissions history

- development/test mock-контур чтения истории завершен: seeded/runtime попытки имеют автора, editor видит свои записи, administrator — общую историю, а обе страницы используют actor из server-side session;
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
