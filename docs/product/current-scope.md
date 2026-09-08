# Текущий продуктовый scope

Этот документ фиксирует действующее требуемое поведение Task Launcher и утвержденные границы Milestone 2. Это не хронология обсуждений. Реализованы три server-only контракта интеграции, development/test mock создания задач, production fail-closed, persistent storage slices для `portal_installations`, `profiles`, `oauth_transactions`, `app_sessions`, зашифрованных `bitrix24_user_credentials` и персональных `launcher_projects`, законченный локальный production OAuth authentication contour, security contour administrator/profile lifecycle и production Directory adapter. Remote Supabase schema, deployment и live task creation не изменялись; persistent submissions еще не подключены.

## Формат продукта и портал

- Task Launcher является отдельным внутренним адаптивным PWA и не открывается внутри интерфейса Bitrix24.
- Интерфейс проектируется mobile-first и поддерживает desktop, iPhone и Android.
- Пользовательский интерфейс русскоязычный.
- Один deployment и одна его database обслуживают ровно один заранее настроенный portal `member_id`; допускается только одна активная portal installation.
- Пользователь не вводит и не выбирает портал на странице входа.
- Несколько порталов внутри одного deployment не поддерживаются.
- OAuth callback с другим `member_id` отклоняется до создания profile, app session и credentials; другой `member_id` не сохраняется как вторая installation.
- Canonical domain может обновляться только после доверенной OAuth-проверки при прежнем `member_id`.
- Server-only portal installation repository принимает только уже проверенную OAuth identity и обязан атомарно создать singleton installation, оставить совпадающую identity без изменений или обновить только canonical origin при прежнем `member_id`; другой `member_id` отклоняется.
- Переключение на другой портал требует отдельного deployment и отдельной database/project configuration. Singleton обеспечивается строкой с фиксированным ключом `1`, защищенным `PRIMARY KEY` и `CHECK`; reconciliation выполняется одной атомарной PostgreSQL RPC.
- Server-only переменные `BITRIX24_PORTAL_MEMBER_ID` и `BITRIX24_PORTAL_ORIGIN` принимаются только вместе; partial configuration, невалидный `member_id` и небезопасный origin отклоняются. Пустая пара означает, что persistent portal foundation еще не настроен.

## Вход и роли

- Вход и первичная регистрация выполняются через OAuth Bitrix24.
- Supabase Auth, email/password, публичная регистрация, приглашения по email, reset password и SMTP не используются.
- Войти может только пользователь связанного портала с `ACTIVE=true` и `USER_TYPE=employee`.
- Extranet, email users и другие внешние типы пользователей не допускаются.
- После первого допустимого входа создается локальный profile с ролью `editor`.
- Внутренние роли `administrator` и `editor` хранятся в Task Launcher и не наследуются из Bitrix24.
- Administrator Task Launcher может повысить любого ранее вошедшего active employee до administrator независимо от его административных прав в Bitrix24.
- Нельзя понизить, заблокировать или удалить последнего активного administrator.
- После успешного OAuth callback выполняется session rotation, и браузер получает только случайный непрозрачный session token в cookie с production-флагами `HttpOnly`, `Secure` и `SameSite=Lax`.
- Session token недоступен JavaScript. Cookie не содержит profile ID, Bitrix user ID, OAuth token или роль; сырой token не хранится в БД.
- OAuth access token, refresh token, client secret и database credentials остаются server-only и не попадают во frontend, пользовательские ошибки или логи.
- Supabase Custom OAuth Provider и собственный JWT для Supabase не входят в Milestone 2.
- Persistent OAuth transaction создается server-only из 32 случайных байтов, кодированных `base64url`; в repository и БД передается только полный lowercase SHA-256 hash. Database time задает TTL ровно 10 минут.
- `return_path` канонизируется как root-relative внутренний путь; внешние URL, protocol-relative пути, backslash, control characters и опасные percent-encoded разделители отклоняются.
- Consumption выполняется одной атомарной PostgreSQL RPC. Неизвестный, просроченный и уже использованный state возвращают отдельные outcomes без `return_path`; при конкурентных callback только один получает `consumed`.
- Production OAuth start использует persistent OAuth transaction; callback атомарно consuming state до обработки provider error/code и продолжает flow только для outcome `consumed`.
- Persistent app session foundation создает server-only token из 32 случайных байтов в `base64url`, передает в repository и БД только полный lowercase SHA-256 hash и использует database time для абсолютного TTL ровно 30 дней. Sliding expiration отсутствует, обычный resolve не изменяет expiry.
- Session создается только для текущего active profile с допустимыми Bitrix snapshots. Resolve возвращает минимальный server-side actor context с актуальной ролью из profile; unknown, expired, revoked и profile inactive не раскрывают actor identity. Отзыв одной session атомарно устанавливает `revoked_at` один раз.
- Production callback выполняет rotation текущей browser session, создает новую persistent app session и устанавливает только opaque token в `__Host-task-launcher-session` с `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, без `Domain`; expiry cookie равен database expiry session.
- Persistent credentials foundation хранит по одной credentials row на profile/portal и принимает в repository и PostgreSQL только отдельно зашифрованные access/refresh envelopes. Server-only service использует AES-256-GCM, отдельный случайный 12-byte IV для каждого token и authenticated AAD с marker, portal, profile, token kind и `token_version`.
- `BITRIX24_CREDENTIALS_ENCRYPTION_KEY` декодируется только как base64 ровно в 32 bytes, не имеет default и лениво проверяется при создании credentials service. Ключ находится вне БД; missing или invalid configuration fail closed без раскрытия значения.
- Initial create разрешен только для актуального active employee profile, создает `status=active` и `token_version=1` и не перезаписывает существующую row. Resolve возвращает encrypted fields repository только для active credentials; service расшифровывает их только в server memory.
- Refresh rotation одной PostgreSQL RPC атомарно заменяет обе encrypted token части, использует AAD следующего token version и optimistic check `expected_token_version`. Конкурентно побеждает одна целостная pair, остальные получают `version_conflict`.
- Атомарный переход в `reauth_required` также требует expected version, поэтому stale provider failure старой pair не может заблокировать уже обновленные credentials. `disabled` остается отдельным fail-closed состоянием без general-purpose enable/disable operation; recovery/reactivation flow не реализован.
- Production callback сохраняет полученную после code exchange pair через отдельный verified OAuth create/replacement flow. Replacement получает только version context без ciphertext, шифрует pair с AAD следующего `token_version` и атомарно создает или заменяет всю pair с optimistic check. `reauth_required` возвращается в `active` только этим verified flow; `disabled` автоматически не реактивируется.
- Production callback не выполняет immediate provider refresh. Automatic provider refresh orchestration остается будущей задачей.
- Live `Bitrix24IdentityClient` использует официальный token endpoint, фиксированные OAuth semantics `app`/`user_brief`, проверяет trusted `member_id`, canonical HTTPS client endpoint, current user и admission active employee до любой profile/session/credentials persistence.
- Logout отзывает текущую persistent session, всегда очищает browser cookie и возвращает на `/login`; storage failure не оставляет browser в визуально authenticated состоянии.

Первый administrator задается через необязательный server-only `BOOTSTRAP_ADMIN_BITRIX_USER_ID`. Значение лениво валидируется как канонический Bitrix user ID и не требуется для build. Роль назначается только matching profile после успешного OAuth-входа и проверки `member_id`, `ACTIVE=true` и `USER_TYPE=employee`. Portal-scoped database lock атомарно повышает profile только при отсутствии active administrator. Повторный bootstrap того же administrator идемпотентен; если active administrator уже существует, matching editor автоматически не повышается. Завершение matching bootstrap фиксируется database time в `portal_installations.admin_bootstrapped_at`, после чего переменная удаляется из environment. Аварийное восстановление будет отдельной будущей server-only процедурой; персональный Bitrix user ID не хранится в документации или Git.

## Profiles

- Profile имеет собственный внутренний UUID.
- Уникальная внешняя идентичность — `portal_installation_id + bitrix_user_id`.
- Profile не обязан быть связан с `auth.users`.
- Persistent profiles foundation реализован локально: первый проверенный active employee создается с ролью `editor` и `is_active=true` через одну атомарную PostgreSQL reconciliation RPC.
- Repository принимает только уже проверенную server-side identity ожидаемого портала с `ACTIVE=true` и `USER_TYPE=employee`. Сохраняются только Bitrix user ID, snapshots `active` и `userType` и время последней успешной проверки; email, телефоны, адрес, фотография, credentials, permissions и сырой ответ не сохраняются.
- При повторной reconciliation безопасные snapshot-поля и verification timestamp могут обновляться, но локальные `role` и `is_active` автоматически не меняются. Полностью совпадающий snapshot не изменяет `updated_at`.
- Inactive profile возвращается как отдельный типизированный результат и автоматически не реактивируется; server use case обязан отклонить создание новой app session и использование credentials.
- `is_active=false` отзывает все активные app sessions и запрещает использование OAuth credentials.
- После блокировки новые Bitrix24 Identity, Directory и Task вызовы от имени profile не выполняются; история submissions и launcher projects сохраняются.
- Использование credentials не разрешается повторно автоматически: нужны новая проверка identity и утвержденный recovery/reactivation flow. Полный recovery flow в Milestone 2 пока не проектируется.
- Bootstrap первого administrator, actor-aware изменение `editor <-> administrator`, административная блокировка и last-active-administrator guard реализованы узкими server-only PostgreSQL RPC.
- Actor admin mutation разрешается из текущей opaque app session: browser передает только target profile и требуемую роль, server-side facade разрешает actor, а database повторно проверяет session, portal, active profile и актуальную роль administrator. Actor profile ID из browser input не принимается.
- Все role/block mutations одного portal сериализуются на singleton installation row. Поэтому взаимные concurrent demote/block двух administrators не могут оставить систему без active administrator.
- Block одной транзакцией устанавливает `profiles.is_active=false`, отзывает все еще пригодные app sessions target и переводит его credentials в `disabled` без расшифровки token pair. Согласованные row-lock modes и transaction advisory serialization сохраняют invariant без deadlock при гонках с session creation, credential rotation и verified OAuth replacement.
- Unblock/recovery не реализован: schema не различает безопасно происхождение `disabled`, старые token pairs не реактивируются, а verified OAuth по-прежнему не обходит administrative block.
- Admin audit framework в этом slice не добавлен: он не нужен для correctness, а существующая data model не содержит утвержденного общего security audit contract.

## Интеграционные границы Milestone 2

UI не обращается к Bitrix24 напрямую. Используются три server-only контракта:

- `Bitrix24IdentityClient` — OAuth URL, code exchange, refresh token pair, фактические права приложения, current user, `member_id`, domain, `ACTIVE` и `USER_TYPE`;
- `Bitrix24DirectoryClient` — server-side поиск и пагинация group/project/scrum и active employee, исключение collab и extranet-enabled сущностей, проверка доступности и `create_tasks`;
- `Bitrix24TaskClient` — контракт будущего создания задач.

Identity имеет live-реализацию. Production `Bitrix24DirectoryClient` реализован локально как server-only adapter с runtime validation, bounded pagination, safe typed errors и credentials provider поверх существующего encrypted credential service. Он не принимает token, endpoint или REST method из браузера и не выполняет automatic refresh. Employee Directory использует `user.get`/`user.search` с `user_brief`: list path через `user.get` live verified, optional `user.search` path подтвержден документацией и synthetic tests. Entity Directory использует live verified `socialnetwork.api.workgroup.list`, `sonet_group.get` и `sonet_group.feature.access` с permissions `socialnetwork`/`sonet_group`. Read-only campaign подтвердила response contracts и фильтрацию без изменения portal business data. `Bitrix24TaskClient` использует `MockBitrix24TaskClient` только в development/test, а server-only composition root всегда выбирает `DisabledBitrix24TaskClient` в production.

## Главная страница

- Приветствие «Добрый день» отсутствует.
- Основное действие — кнопка создания задачи.
- Есть компактный блок последних задач.
- Ссылка «Все задачи» находится в заголовке блока последних задач и визуально согласована с заголовком.
- Недавний launcher project открывает форму создания задачи с уже выбранным проектом.
- Мобильная навигация остается доступной и не перекрывается аватаром или плавающими элементами.

## Создание задачи

Обязательные поля:

- launcher project;
- название задачи.

Необязательные поля:

- ответственный;
- срок;
- текст задачи;
- дополнительные теги;
- прикрепляемые файлы.

Поля и настройки, которых в форме быть не должно:

- приоритет;
- оценка в часах;
- управление учетом времени.

### Срок

- По умолчанию срок пустой.
- Пользователь может выбрать дату.
- Выбранную дату можно полностью очистить.
- Пустой срок не передается в интеграционный payload.

### Файлы

- Пользователь может выбрать несколько файлов одновременно или последовательно добавить новые файлы явной кнопкой, не заменяя уже выбранные.
- Допускается не более 10 файлов по 20 МБ каждый; при достижении лимита интерфейс сообщает об этом и больше не предлагает добавление.
- Длинное имя выбранного файла сокращается визуально и не создает горизонтальную прокрутку; действие удаления остается доступным.
- В Milestone 2 `task_submission_files` передает и сохраняет только безопасные метаданные: имя, MIME-тип и размер.
- Бинарное содержимое и `content_sha256` не входят в `task_submission_files`, sanitized payload, историю или логи.
- Реальная загрузка файлов в Bitrix24 отложена до следующего интеграционного milestone.

## Launcher projects

В коде и базе локальная настройка называется `launcher_projects`; в UI она может называться «Проект». Она отделена от реальной сущности Bitrix24 типа `group`, `project` или `scrum`.

- Каждый editor и administrator создает собственные launcher projects.
- Editor видит только свои launcher projects; administrator видит все.
- Владелец редактирует, архивирует и восстанавливает собственный launcher project.
- Administrator не редактирует чужие настройки и не меняет владельца.
- Administrator может архивировать и восстанавливать чужой launcher project только через узкие PostgreSQL RPC.
- Физического удаления через приложение нет.
- Один пользователь может создать несколько launcher projects для одной Bitrix-сущности с разными локальными названиями, исполнителями и обязательными тегами.
- Unique constraint только по `bitrix_entity_id` запрещен.
- Архивирование не изменяет и не удаляет сущность Bitrix24.
- Архивирование и восстановление фиксируются в append-only `launcher_project_audit_events`.
- Эти правила одинаковы в mock и live: editor управляет своими настройками, administrator также управляет своими и видит все настройки портала.
- В live-режиме сущность Bitrix24 и ответственный выбираются через server-side Directory; перед сохранением сервер повторно проверяет их доступность и сохраняет проверенные ID, type и title.
- Ошибка Directory не блокирует чтение или архивирование сохраненных настроек. При истекших credentials страница предлагает повторный OAuth-вход. Открытая форма сохраняет черновик, привязанный к текущему profile и исходному launcher project, а после OAuth восстанавливает создание или редактирование без смены операции.
- Создание launcher project использует UUID операции, связанный с владельцем и введенными значениями. Повтор той же операции возвращает ранее созданную запись, а повтор ключа с измененными значениями отклоняется. Ключ сохраняется вместе с черновиком до подтвержденного результата.
- Сетевая ошибка поиска или сохранения всегда разблокирует форму и сохраняет введенные значения. Если результат сохранения неизвестен, интерфейс просит сначала проверить список и использует прежний ключ при явном повторе.
- Подтвержденное сохранение не превращается в ошибку из-за последующего сбоя чтения. Интерфейс сообщает об успешной мутации и предлагает отдельно обновить список проектов.

Для выбора допускаются только доступные текущему OAuth-пользователю активные и незакрытые `group`, `project` и `scrum` с правом `create_tasks`. Исключаются `collab`, extranet-enabled сущности, inactive, closed, недоступные сущности и сущности без `create_tasks`. Источником истины по доступу остается Bitrix24.

## Исполнители

- Исполнителем может быть любой active employee связанного портала независимо от наличия profile или входа в Task Launcher.
- Extranet, email users и другие внешние типы не допускаются.
- Для выбора используются только Bitrix user ID, имя, фамилия, отчество при наличии, должность, подразделения, active и user type.
- Телефоны, дата рождения, адрес, фотография, email и другие персональные данные без необходимости не запрашиваются.
- При одинаковом ФИО UI добавляет должность, затем подразделение и в крайнем случае Bitrix user ID.
- Поиск выполняется server-side с фильтрацией и пагинацией: полный список использует `user.get`, запрос — `user.search`, оба пути финально проверяют `ACTIVE=true` и `USER_TYPE=employee`.

### Повторная проверка перед будущим task creation

Перед будущим вызовом live `Bitrix24TaskClient` сервер повторно проверяет связанную Bitrix-сущность: она существует, ее type остается `group`, `project` или `scrum`, она active, не closed, не collab и не extranet-enabled, а текущий OAuth-пользователь все еще имеет к ней доступ и право `create_tasks`.

Исполнитель также проверяется повторно: пользователь существует, имеет `ACTIVE=true` и `USER_TYPE=employee`.

Если любая проверка не пройдена, Task client не вызывается, попытка не получает `success`, а пользователь получает безопасную понятную ошибку. Launcher project автоматически не удаляется; его access state может быть помечен `unavailable` или `unknown` для последующей повторной проверки.

## История submissions

- Каждая явная попытка создает отдельную `task_submissions` и отдельный idempotency key.
- Editor видит только собственную историю; administrator видит общую историю.
- Безопасные error-попытки сохраняются.
- `operation_status` принимает только `pending`, `success`, `error` и `unknown`.
- Timeout дает `unknown`; автоматический retry запрещен.
- Ручной retry создает новую попытку и новый idempotency key.
- В development/test runtime cache и незавершенная операция по idempotency key привязаны к текущему actor; другой actor не получает результат чужой попытки.
- Success, `bitrix_task_id` и поля синхронизации может изменять только server-only integration layer.
- `task_submission_files` хранит только безопасные metadata без бинарного содержимого и `content_sha256`.

До появления live `Bitrix24TaskClient` production использует `DisabledBitrix24TaskClient`: mock не может записать `operation_status=success`, фиктивный `bitrix_task_id` не создается. UI может скрыть или заблокировать submit либо получить безопасный результат `task_creation_disabled`; окончательный вариант UX пока не выбран. Mock success допускается только в development/test. Persistent submissions foundation и ее ограничения могут быть реализованы и протестированы в Milestone 2 без заявления, что реальные задачи уже создаются.

Текущая UI-модель `TaskStatus` не меняется в Milestone 2: `new`, `in_progress`, `completed`, `unknown`. Nullable-поля `raw_bitrix_status_code`, `normalized_task_status`, `bitrix_changed_at`, `bitrix_status_changed_at`, `last_synced_at`, `sync_state` и `safe_sync_error_code` резервируются для следующего milestone; live-синхронизация сейчас не выполняется.

## Хранение Milestone 2

Утверждены таблицы:

1. `portal_installations`;
2. `profiles`;
3. `app_sessions`;
4. `oauth_transactions`;
5. `bitrix24_user_credentials`;
6. `launcher_projects`;
7. `launcher_project_audit_events`;
8. `task_submissions`;
9. `task_submission_files`.

Credentials хранятся отдельно от profiles. Сырой session token находится только в `HttpOnly`/`Secure`/`SameSite=Lax` cookie, недоступен JavaScript и не хранится в БД; в БД находится только его криптографический hash. OAuth state также хранится только как hash. Access и refresh token шифруются, а encryption key находится вне БД. Refresh атомарно заменяет обе части token pair с контролем `token_version`.

## Authorization и база

- Supabase Auth не используется, у конечного пользователя нет Supabase JWT, а `auth.uid()` не представляет пользователя Task Launcher.
- User-scoped Supabase RLS в выбранной архитектуре отсутствует.
- RLS и grants закрывают Data API для `anon` и `authenticated`.
- Права конечного пользователя проверяются через app session, server-only DAL, actor-aware repositories и узкие PostgreSQL RPC.
- Service-role обходит RLS и доступен только минимальному privileged database gateway.
- Actor profile ID из браузера или form data не считается доверенным.
- Критические RPC разрешают actor через активную app session и повторно проверяют portal, profile, `is_active` и role.

Для реализованных `portal_installations`, `profiles`, administrator/profile lifecycle, `oauth_transactions`, `app_sessions`, `bitrix24_user_credentials` и `launcher_projects` slices таблицы находятся в `public`, RLS включена без пользовательских policies, а все права на таблицы и RPC отозваны у `PUBLIC`, `anon` и `authenticated`. `service_role` имеет только необходимые права и вызывает узкие `SECURITY INVOKER` RPC через минимальный server-only gateway; сырой Supabase client не экспортируется. Local Supabase stack и migrations зафиксированы в репозитории, но migrations не применялись к удаленной базе.

## Technical spikes Milestone 2

Завершенный development/test spike подтвердил OAuth отдельного PWA, проверку `member_id` и portal identity, token scope `app`, фактическое application permission `user_brief` через REST-метод `scope`, active employee admission, refresh token rotation и неизменность provider identity после refresh. Проверенные provider primitives промотированы в отдельный live IdentityClient, а production routes используют persistent state, portal/profile reconciliation, encrypted credential replacement и app sessions. Spike остается отдельным development/test diagnostic harness.

В spike callback контролируемые ошибки проверки request, state, portal identity и OAuth metadata возвращают безопасный HTTP 400; admission rejection остается HTTP 403. Ошибки Bitrix24 provider и token exchange сохраняют HTTP 502, а неожиданные внутренние ошибки — HTTP 500. Response содержит только безопасный reason code и не меняет границы production OAuth.

В `APP_RUNTIME_MODE=live` защищенный UI разрешает actor только через persistent app session. Страница проектов подключена к persistent storage и Directory. Остальные business-страницы до подключения submissions и live task creation показывают безопасный placeholder и не выдают mock data. Mock auth и mock business UI остаются только development/test `mock` mode.

Directory contract analysis по официальной документации и согласованная read-only live campaign завершены. Подтверждены `user_brief`, `socialnetwork`, `sonet_group`, member binding, employee/entity response shapes и `tasks/create_tasks` capability. Проверка не создавала и не изменяла пользователей, группы, проекты, Scrum или задачи; raw OAuth tokens, codes и provider responses не сохранялись.

Supabase Custom OAuth spike не входит в Milestone 2.

## Следующий интеграционный milestone

В Milestone 2 не входят:

- live `Bitrix24TaskClient` и `tasks.task.add`;
- реальное создание задач от имени вошедшего пользователя;
- реальная загрузка файлов;
- TAGS в group, project и Scrum;
- Scrum backlog;
- live task status;
- `OnTaskUpdate`, polling и доставка Bitrix24 offline events.

PWA offline mode, офлайн-создание задач, push-уведомления, аналитика, AI и несколько порталов также не входят в текущий scope. Доставка Bitrix24 offline events является отдельным будущим механизмом server-side интеграции и не означает поддержку PWA offline mode.
