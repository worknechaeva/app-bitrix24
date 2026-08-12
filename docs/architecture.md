# Архитектурные границы

Документ фиксирует устойчивые технические решения и утвержденную целевую архитектуру Milestone 2. Детали требуемого поведения находятся в [product/current-scope.md](./product/current-scope.md), решения и их история — в [product/decisions.md](./product/decisions.md), этапы реализации — в [roadmap.md](./roadmap.md).

Текущий код реализует завершенный development-only mock первого milestone, development/test harness завершенного OAuth и portal identity spike, live production-safe IdentityClient, локальный production OAuth authentication contour и administrator/profile lifecycle поверх persistent `portal_installations`/`profiles`/`oauth_transactions`/`app_sessions`/`bitrix24_user_credentials` slices. Remote Supabase schema и deployment не изменялись; live directory и persistent business data не подключены.

## Приложение

- Модульный монолит на Next.js App Router.
- TypeScript работает в strict-режиме.
- UI строится как отдельный mobile-first PWA для desktop, iPhone и Android и не встраивается в интерфейс Bitrix24.
- Один deployment и одна его database обслуживают ровно один заранее настроенный portal `member_id`; допускается только одна активная portal installation.
- Server Components используются по умолчанию; Client Components добавляются только для интерактивности.
- Входные данные форм, environment и внешние ответы валидируются Zod-схемами.

## Направление зависимостей

```text
UI
  -> Server Action / Route Handler
  -> app session и server-only DAL
  -> use case
  -> repository или integration interface
  -> database gateway / PostgreSQL RPC / Bitrix24 adapter
```

- UI не импортирует credentials, database client и REST-поля Bitrix24.
- Route Handlers и Server Actions считаются внешними входными точками и повторно проверяют app session и authorization.
- Внешние ответы преобразуются во внутренние DTO и нормализованные безопасные ошибки.
- Actor profile ID из URL, form data или browser payload не считается identity.

## Auth и portal identity

- Task Launcher самостоятельно выполняет Bitrix24 OAuth; Supabase Auth не используется.
- Пользователь не выбирает портал. Server-side configuration содержит ожидаемый `member_id` и bootstrap origin.
- Ожидаемый `member_id` и canonical portal origin задаются только вместе. До подключения persistent portal installation обе переменные могут отсутствовать; partial или небезопасная конфигурация завершается fail closed.
- Callback считает входные `code`, `domain`, `member_id` и остальные параметры недоверенными до успешного code exchange и проверки identity.
- Другой `member_id` отклоняется до создания profile, app session и credentials и не сохраняется как вторая installation. Canonical domain может обновляться только после доверенной OAuth-проверки с прежним `member_id`.
- `PortalInstallationRepository` принимает уже проверенную OAuth identity через узкую атомарную reconciliation-операцию: создает singleton installation, сохраняет совпадающую identity или обновляет только canonical origin при прежнем `member_id`. Supabase adapter использует существующий контракт и не экспортирует database client.
- Переключение на другой портал требует отдельного deployment и отдельной database/project configuration. Таблица физически допускает только ключ `singleton_key = 1`, защищенный `PRIMARY KEY` и `CHECK`; одна PostgreSQL RPC использует конфликт по этому ключу и row lock, поэтому reconciliation не зависит от предварительного application-level `SELECT`.
- Допускаются только `ACTIVE=true`, `USER_TYPE=employee`; extranet, email users и другие внешние типы не получают app session.
- OAuth access token, refresh token и client secret никогда не передаются браузеру.
- Supabase Custom OAuth Provider и собственный JWT не входят в Milestone 2.

## App sessions и OAuth transactions

- После успешного OAuth callback сервер выполняет session rotation и создает новую собственную app session.
- Браузер хранит только случайный непрозрачный session token в cookie с production-флагами `HttpOnly`, `Secure` и `SameSite=Lax`; token недоступен JavaScript.
- Cookie не содержит profile ID, Bitrix user ID, OAuth token или роль. Сырой session token не хранится в БД; в `app_sessions` находится только его криптографический hash.
- App session service генерирует 32 случайных байта через Node.js crypto и кодирует их в `base64url` без padding. За repository boundary передается только полный lowercase SHA-256 hash.
- `app_sessions` имеет абсолютный database-time TTL ровно 30 дней. Caller не передает TTL, sliding expiration отсутствует, resolve не изменяет `created_at` или `expires_at`.
- Атомарная create RPC блокирует связанный profile и выдает session только при `is_active=true`, `bitrix_active=true`, `bitrix_user_type='employee'`. Composite foreign key `(profile_id, portal_installation_id)` блокирует cross-portal identity.
- Resolve возвращает только session/profile/portal IDs, актуальную роль из `profiles` и expiry для active session. Unknown, expired, revoked и profile inactive не раскрывают actor identity; роль не хранится snapshot в session.
- Revoke использует row lock и database time: только первый конкурентный вызов устанавливает `revoked_at`, повторные вызовы не меняют timestamp, expired session не получает новую state transition.
- Logout устанавливает `revoked_at`; блокировка profile отзывает все его app sessions.
- Истекшие и отозванные сессии очищаются технической процедурой.
- Persistent OAuth `state` создается server-only из 32 криптографически случайных байтов в `base64url`; repository принимает только полный lowercase SHA-256 hash, а raw state не хранится, не логируется и не входит в ошибки.
- `oauth_transactions` использует database time и TTL ровно 10 минут. Узкая `SECURITY INVOKER` RPC блокирует строку и атомарно возвращает `consumed`, `unknown`, `expired` или `already_consumed`; только `consumed` содержит безопасный `return_path`.
- `return_path` проходит application canonicalization относительно фиксированного sentinel origin и database constraint; внешние URL, protocol-relative пути, backslash, control characters и опасные percent-encoded разделители запрещены.
- Production OAuth start/callback использует persistent OAuth transaction; state consumed до provider error/code. Callback выполняет credential persistence, revoke предыдущей browser session и issuance новой session, затем устанавливает `__Host-task-launcher-session` с `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, без `Domain`.
- Live actor facade разрешает profile/portal/role только из `AppSessionService.resolve`. Неактивные, unknown, expired и revoked sessions считаются unauthenticated. Logout идемпотентно отзывает session и всегда очищает cookie.
- Development/test spike продолжает использовать отдельный ephemeral state store только при явном spike flag; production runtime не импортирует spike state/runtime.
- Для Milestone 2 app sessions и OAuth transactions хранятся в Postgres; Redis/KV не добавляется без подтвержденной необходимости.

## Profiles и роли

- Profile имеет внутренний UUID и уникальность `portal_installation_id + bitrix_user_id`.
- Обязательной связи с `auth.users` нет.
- Первый допустимый вход создает `editor`; локальная роль не наследуется из OAuth или Bitrix24.
- Реализованная атомарная reconciliation RPC принимает только уже проверенный `ACTIVE=true`, `USER_TYPE=employee`, создает profile с `is_active=true`, обновляет только snapshots `active/userType` и verification timestamp и не выполняет предварительный application-level `SELECT`.
- `role` и `is_active` reconciliation не обновляет. Inactive profile возвращается типизированным outcome без автоматической реактивации; полностью совпадающий snapshot сохраняет прежний `updated_at`.
- Administrator Task Launcher не обязан быть администратором портала и может повысить другого вошедшего active employee.
- Роль и `is_active` меняются только контролируемыми server-only lifecycle operations. Browser передает target и желаемую роль, но не actor identity; server-side application-session facade разрешает actor и передает в repository только hash opaque session token.
- При `is_active=false` отзываются все активные app sessions, использование OAuth credentials запрещается и новые Bitrix24 Identity, Directory и Task вызовы от имени profile не выполняются; история submissions и launcher projects сохраняются.
- Повторное разрешение credentials не происходит автоматически без новой проверки identity и утвержденного recovery/reactivation flow; полный recovery flow пока не проектируется.
- Транзакционные `change_profile_role` и `block_profile` RPC повторно разрешают active administrator из app session и запрещают понижение или блокировку последнего active administrator. Portal singleton row является portal-scoped serialization lock для всех bootstrap/role/block mutations, поэтому adversarial mutual demote/block race сохраняет минимум одного active administrator.
- `block_profile` сохраняет общий порядок locks с credentials operations: блокирует credential row до target profile, повторно проверяет возможную concurrent insert и одной транзакцией устанавливает `is_active=false`, отзывает пригодные app sessions и переводит credentials в `disabled`. Session creation, прошедшая первой, затем отзывается; более поздняя creation видит inactive profile. Credential rotation, прошедшая первой, затем отключается; более поздняя видит inactive/disabled state.
- Первый administrator задается необязательным `BOOTSTRAP_ADMIN_BITRIX_USER_ID`, лениво валидируется и назначается matching profile только после проверки `member_id`, `ACTIVE` и `USER_TYPE`. Bootstrap сериализуется на portal row, выполняется только при отсутствии active administrator и фиксируется в `admin_bootstrapped_at`; наличие другого administrator завершает bootstrap без автоматического повышения matching editor.
- Unblock отсутствует: текущая schema не хранит provenance причины `disabled`, поэтому old credentials никогда не включаются автоматически и recovery требует отдельного утвержденного flow.

## Encrypted Bitrix24 credentials

- `bitrix24_user_credentials` отделена от `profiles` и хранит не более одной row для composite profile/portal identity. Оба foreign key используют `RESTRICT`, а composite FK физически блокирует cross-portal credentials.
- Plaintext access/refresh token pair существует только внутри server-only credential service. Storage-independent repository, Supabase adapter, privileged gateway и PostgreSQL принимают только ciphertext, IV, auth tag и несекретную metadata.
- Каждый token независимо шифруется встроенным `node:crypto` через AES-256-GCM с новым 12-byte random IV и 16-byte authentication tag. Base64url без padding используется для binary fields; access и refresh IV обязаны отличаться.
- AAD версии 1 канонически связывает ciphertext с marker `task-launcher:bitrix24-credentials:v1`, portal installation, profile, видом `access/refresh` и `token_version`. Подмена ciphertext, tag, token kind, identity или version завершается безопасной нормализованной crypto error.
- `BITRIX24_CREDENTIALS_ENCRYPTION_KEY` является server-only base64 representation ровно 32 random bytes, находится вне БД, не имеет development default и лениво валидируется при обращении к subsystem. Build без вызова credentials service не требует secret.
- Initial create блокирует profile, повторно проверяет active employee snapshots, устанавливает `active` и `token_version=1` database-side и не выполняет upsert существующей row.
- Resolve repository возвращает encrypted envelopes только для актуального active profile и credentials status `active`; service расшифровывает pair только в server memory. `profile_inactive`, `reauth_required` и `disabled` не раскрывают encrypted fields и fail closed.
- Rotation блокирует credentials row и profile и одной RPC заменяет всю encrypted pair, endpoint и expiry только при совпадении `expected_token_version`; новый ciphertext использует AAD следующей версии. Version conflict ничего не изменяет.
- `mark_bitrix24_credentials_reauth_required` требует ту же optimistic version. Stale refresh failure старой версии после успешной rotation получает `version_conflict` и не блокирует новую pair. `disabled` не реактивируется; general-purpose disable/enable и re-auth recovery отсутствуют.
- Production callback использует отдельные inspection/replacement RPC для verified OAuth login. Inspection возвращает только current/next version context; replacement атомарно создает version 1 или заменяет полную encrypted pair на `N+1`, включая переход `reauth_required -> active`. `disabled` не реактивируется. Provider refresh orchestration и удаленная Supabase schema не изменены.

## Supabase, grants и authorization

- У конечного пользователя нет Supabase JWT, поэтому `auth.uid()` не представляет пользователя Task Launcher.
- User-scoped Supabase RLS в этой архитектуре отсутствует и не должна упоминаться как реализованная модель доступа.
- Grants и RLS закрывают Data API для `anon` и `authenticated` и служат защитой от случайного публичного доступа.
- Service-role обходит RLS. Service-role client создается только внутри минимального privileged database gateway и не экспортируется в UI, features или произвольные application services.
- Права пользователя проверяют активная app session, server-only DAL, actor-aware repositories и узкие PostgreSQL RPC.
- Критические RPC самостоятельно разрешают actor через активную app session и повторно проверяют portal, profile, `is_active` и role.
- Privileged gateway не экспортирует сырой database client или универсальный query builder.
- Cross-portal связи дополнительно блокируются composite foreign keys с `portal_installation_id`.

Privileged gateway реализован для узких операций `portal_installations`, `profiles`, administrator/profile lifecycle, `oauth_transactions`, `app_sessions` и `bitrix24_user_credentials`: он создает `@supabase/supabase-js` client только внутри server-only модуля с `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` и отключенной browser session persistence. В local Supabase config GoTrue включен только для выдачи стандартных test API keys; приложение не создает Supabase Auth sessions и не использует Auth. Таблицы имеют RLS без policies. `PUBLIC`, `anon` и `authenticated` не имеют прав на таблицы и RPC; `service_role` имеет только необходимые table privileges и `EXECUTE` на `SECURITY INVOKER` RPC с пустым `search_path`.

Live authentication configuration (`TASK_LAUNCHER_APP_ORIGIN`, OAuth client credentials, portal identity, credentials encryption key и Supabase privileged configuration) разрешается лениво только на runtime boundaries. Callback URI вычисляется из app origin, OAuth token endpoint не переопределяется environment. Production build не требует runtime secrets; фактический live request без valid configuration завершается fail closed.

### Server repositories

Обычные repositories выполняют только операции с явной предметной областью и обязательным verified session context:

- чтение launcher projects, видимых actor;
- создание и изменение только собственного launcher project;
- чтение доступной истории submissions;
- создание собственной submission;
- чтение безопасных справочных snapshots.

Универсальные `listAll`, произвольный patch и передача actor ID из browser payload запрещены. Запросы всегда ограничиваются portal и owner/actor predicates и выбирают явный список колонок.

### Узкие PostgreSQL RPC

RPC используются для транзакционных переходов:

- bootstrap и изменение ролей;
- защита последнего активного administrator;
- блокировка profile и отзыв его sessions;
- archive/restore launcher project, включая узкую операцию administrator над чужой записью;
- append-only audit event;
- одноразовое consumption OAuth transaction;
- атомарная rotation OAuth token pair с optimistic locking.

RPC размещаются вне публичной API-поверхности; право выполнения у `PUBLIC`, `anon` и `authenticated` отзывается. Если функции требуют повышенных прав, они имеют фиксированный `search_path` и не доверяют actor ID из параметров браузера.

## Bitrix24-контракты

### `Bitrix24IdentityClient`

- формирует OAuth URL;
- обменивает authorization code;
- атомарно обновляет access/refresh token pair;
- получает доступные приложению права отдельным server-only вызовом;
- получает current user;
- возвращает проверенные `member_id`, domain, user ID, `ACTIVE` и `USER_TYPE`.

### `Bitrix24DirectoryClient`

- ищет доступные текущему OAuth-пользователю group/project/scrum;
- исключает collab, extranet-enabled, inactive, closed и недоступные сущности;
- проверяет право `create_tasks`;
- ищет active employee;
- выполняет server-side фильтрацию и пагинацию и возвращает минимальные DTO.

Основной метод поиска сотрудников выбирается directory spike между `user.search + user.get` и `humanresources.employee.search + user.get`. `user.get` остается финальной проверкой active/employee.

### `Bitrix24TaskClient`

- остается mock только в development/test;
- production использует `DisabledBitrix24TaskClient` с fail-closed поведением;
- production не записывает `operation_status=success` на основании mock и не создает фиктивный `bitrix_task_id`;
- UI может скрыть или заблокировать submit либо получить безопасный результат `task_creation_disabled`; окончательный production UX пока не выбран;
- live-реализация создается в следующем интеграционном milestone.

Перед будущим вызовом live Task client server-only integration layer повторно проверяет связанную entity: она существует, ее type остается `group`, `project` или `scrum`, она active, не closed, не collab и не extranet-enabled, а текущий OAuth-пользователь все еще имеет доступ и право `create_tasks`. Исполнитель должен существовать и иметь `ACTIVE=true`, `USER_TYPE=employee`.

Если любая проверка не пройдена, Task client не вызывается, попытка не получает `success`, а пользователь получает безопасную понятную ошибку. Launcher project автоматически не удаляется; его access state может быть помечен `unavailable` или `unknown` для последующей повторной проверки.

## Хранение Milestone 2

Утверждены таблицы:

1. `portal_installations` — portal `member_id`, проверенный domain и состояние bootstrap;
2. `profiles` — локальная identity, snapshots, role и `is_active`;
3. `app_sessions` — hash непрозрачной session, expiry и revocation;
4. `oauth_transactions` — hash OAuth state, безопасный return path и одноразовое consumption;
5. `bitrix24_user_credentials` — зашифрованные user-scoped access/refresh tokens и rotation metadata;
6. `launcher_projects` — персональные локальные настройки создания задач;
7. `launcher_project_audit_events` — append-only archive/restore audit;
8. `task_submissions` — постоянная история явных попыток;
9. `task_submission_files` — безопасные file metadata.

Credentials не хранятся в profiles. Encryption key находится вне БД. Реализованный token refresh storage transition заменяет access и refresh token атомарно и использует `token_version` для конкурентного обновления; реальный provider refresh пока не вызывается. Состояния `disabled` и `reauth_required` имеют разный смысл: первое запрещает использование credentials, второе требует нового OAuth-входа. Реализованная блокировка profile переводит credentials в `disabled` без расшифровки и без автоматического восстановления.

## Launcher projects

- `launcher_projects` отделены от Bitrix-сущностей `group`, `project`, `scrum`.
- Owner создает, редактирует, архивирует и восстанавливает свои записи.
- Editor видит только свои; administrator видит все.
- Administrator не редактирует чужие настройки и не меняет owner, но может архивировать или восстановить чужую запись узкой RPC.
- Физического удаления нет.
- Unique только по `bitrix_entity_id` запрещен; один owner может иметь несколько локальных настроек одной Bitrix-сущности.
- Архивирование не изменяет Bitrix; восстановление фиксируется append-only audit event.

## Submissions, статусы и файлы

- Каждая явная попытка создает отдельную `task_submissions` и новый idempotency key.
- `operation_status` принимает `pending`, `success`, `error`, `unknown`.
- Timeout дает `unknown`; автоматический retry запрещен; ручной retry является новой попыткой.
- Editor читает собственную историю, administrator — общую.
- Success, `bitrix_task_id` и sync fields изменяет только server-only integration layer.
- UI-модель `TaskStatus` остается `new`, `in_progress`, `completed`, `unknown`.
- Поля будущей status synchronization резервируются nullable и не используются для live-синхронизации в Milestone 2.
- `task_submission_files` хранит только metadata: имя, MIME-тип и размер. Binary и `content_sha256` отсутствуют; реальная загрузка файлов в Bitrix24 относится к следующему integration milestone.
- Persistent submissions foundation и ее ограничения могут быть реализованы и протестированы в Milestone 2 без заявления, что реальные задачи уже создаются.

## Production guards

- Mock Auth и mock Identity/Directory запрещены в production.
- Mock success допускается только в development/test; production composition root связывает Task-контракт с `DisabledBitrix24TaskClient`.
- Production не показывает и не сохраняет фиктивный success и не создает фиктивный Bitrix task ID.
- Environment проходит server-side validation; секретные переменные не имеют префикса `NEXT_PUBLIC_`.
- Секреты не попадают во frontend bundle, документацию, fixtures, пользовательские ошибки и логи.

## Статусы следующего milestone

Live task creation, реальная загрузка файлов в Bitrix24, TAGS, Scrum backlog, live task status, `OnTaskUpdate`, polling и доставка Bitrix24 offline events реализуются вместе с live `Bitrix24TaskClient` в следующем интеграционном milestone. PWA offline mode и офлайн-создание задач являются отдельными возможностями и не входят в Milestone 2.

## Учет времени

- UI и внутренний create DTO не управляют учетом времени Bitrix24.
- Учет времени включает существующая автоматизация портала.
- Поля оценки и управляющий флаг учета времени не должны возвращаться без нового активного продуктового решения.
