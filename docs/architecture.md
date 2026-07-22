# Архитектурные границы

Документ фиксирует устойчивые технические решения и утвержденную целевую архитектуру Milestone 2. Детали требуемого поведения находятся в [product/current-scope.md](./product/current-scope.md), решения и их история — в [product/decisions.md](./product/decisions.md), этапы реализации — в [roadmap.md](./roadmap.md).

Текущий код реализует завершенный development-only mock первого milestone. Описание Milestone 2 ниже является границей будущей реализации, а не утверждением, что OAuth, Supabase или live directory уже подключены.

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
- Callback считает входные `code`, `domain`, `member_id` и остальные параметры недоверенными до успешного code exchange и проверки identity.
- Другой `member_id` отклоняется до создания profile, app session и credentials и не сохраняется как вторая installation. Canonical domain может обновляться только после доверенной OAuth-проверки с прежним `member_id`.
- Переключение на другой портал требует отдельного deployment и отдельной database/project configuration. Конкретная SQL-реализация singleton constraint выбирается позднее на этапе schema/migrations.
- Допускаются только `ACTIVE=true`, `USER_TYPE=employee`; extranet, email users и другие внешние типы не получают app session.
- OAuth access token, refresh token и client secret никогда не передаются браузеру.
- Supabase Custom OAuth Provider и собственный JWT не входят в Milestone 2.

## App sessions и OAuth transactions

- После успешного OAuth callback сервер выполняет session rotation и создает новую собственную app session.
- Браузер хранит только случайный непрозрачный session token в cookie с production-флагами `HttpOnly`, `Secure` и `SameSite=Lax`; token недоступен JavaScript.
- Cookie не содержит profile ID, Bitrix user ID, OAuth token или роль. Сырой session token не хранится в БД; в `app_sessions` находится только его криптографический hash.
- Logout устанавливает `revoked_at`; блокировка profile отзывает все его app sessions.
- Истекшие и отозванные сессии очищаются технической процедурой.
- OAuth `state` является криптографически случайным, одноразовым и имеет короткий TTL; в `oauth_transactions` хранится только hash.
- Callback отклоняет неизвестный, истекший, уже использованный state и небезопасный `return_path`.
- Для Milestone 2 app sessions и OAuth transactions хранятся в Postgres; Redis/KV не добавляется без подтвержденной необходимости.

## Profiles и роли

- Profile имеет внутренний UUID и уникальность `portal_installation_id + bitrix_user_id`.
- Обязательной связи с `auth.users` нет.
- Первый допустимый вход создает `editor`; локальная роль не наследуется из OAuth или Bitrix24.
- Administrator Task Launcher не обязан быть администратором портала и может повысить другого вошедшего active employee.
- Роль и `is_active` меняются только контролируемыми server-only операциями.
- При `is_active=false` отзываются все активные app sessions, использование OAuth credentials запрещается и новые Bitrix24 Identity, Directory и Task вызовы от имени profile не выполняются; история submissions и launcher projects сохраняются.
- Повторное разрешение credentials не происходит автоматически без новой проверки identity и утвержденного recovery/reactivation flow; полный recovery flow пока не проектируется.
- Транзакционная RPC запрещает понижение, блокировку или удаление последнего активного administrator.
- Первый administrator задается `BOOTSTRAP_ADMIN_BITRIX_USER_ID`, назначается после проверки `member_id`, `ACTIVE` и `USER_TYPE`, после чего фиксируется `admin_bootstrapped_at`.

## Supabase, grants и authorization

- У конечного пользователя нет Supabase JWT, поэтому `auth.uid()` не представляет пользователя Task Launcher.
- User-scoped Supabase RLS в этой архитектуре отсутствует и не должна упоминаться как реализованная модель доступа.
- Grants и RLS закрывают Data API для `anon` и `authenticated` и служат защитой от случайного публичного доступа.
- Service-role обходит RLS. Service-role client создается только внутри минимального privileged database gateway и не экспортируется в UI, features или произвольные application services.
- Права пользователя проверяют активная app session, server-only DAL, actor-aware repositories и узкие PostgreSQL RPC.
- Критические RPC самостоятельно разрешают actor через активную app session и повторно проверяют portal, profile, `is_active` и role.
- Privileged gateway не экспортирует сырой database client или универсальный query builder.
- Cross-portal связи дополнительно блокируются composite foreign keys с `portal_installation_id`.

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

Credentials не хранятся в profiles. Encryption key находится вне БД. Token refresh заменяет access и refresh token атомарно и использует `token_version` для конкурентного обновления. Состояния `disabled` и `reauth_required` имеют разный смысл: первое запрещает использование credentials, второе требует нового OAuth-входа. Блокировка profile переводит credentials в запрещенное для использования состояние без автоматического восстановления.

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
