# Текущий продуктовый scope

Этот документ фиксирует действующее требуемое поведение Task Launcher и утвержденные границы Milestone 2. Это не хронология обсуждений. Первый implementation slice Milestone 2 реализует три server-only контракта интеграции, development/test mock создания задач и production fail-closed. Остальная описанная ниже production-интеграция остается целевым scope и еще не реализована.

## Формат продукта и портал

- Task Launcher является отдельным внутренним адаптивным PWA и не открывается внутри интерфейса Bitrix24.
- Интерфейс проектируется mobile-first и поддерживает desktop, iPhone и Android.
- Пользовательский интерфейс русскоязычный.
- Один deployment и одна его database обслуживают ровно один заранее настроенный portal `member_id`; допускается только одна активная portal installation.
- Пользователь не вводит и не выбирает портал на странице входа.
- Несколько порталов внутри одного deployment не поддерживаются.
- OAuth callback с другим `member_id` отклоняется до создания profile, app session и credentials; другой `member_id` не сохраняется как вторая installation.
- Canonical domain может обновляться только после доверенной OAuth-проверки при прежнем `member_id`.
- Переключение на другой портал требует отдельного deployment и отдельной database/project configuration. Конкретная SQL-реализация singleton constraint определяется позднее на этапе schema/migrations.

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

Первый administrator задается через server-only `BOOTSTRAP_ADMIN_BITRIX_USER_ID`. Роль назначается только после успешного OAuth-входа и проверки `member_id`, `ACTIVE=true` и `USER_TYPE=employee`. Bootstrap выполняется один раз, фиксируется в `admin_bootstrapped_at`, после проверки переменная удаляется из environment. Аварийное восстановление будет отдельной будущей server-only процедурой; персональный Bitrix user ID не хранится в документации или Git.

## Profiles

- Profile имеет собственный внутренний UUID.
- Уникальная внешняя идентичность — `portal_installation_id + bitrix_user_id`.
- Profile не обязан быть связан с `auth.users`.
- При каждом входе повторно проверяются portal identity, активность и тип пользователя; безопасные snapshot-поля могут обновляться, а локальная роль автоматически не меняется.
- `is_active=false` отзывает все активные app sessions и запрещает использование OAuth credentials.
- После блокировки новые Bitrix24 Identity, Directory и Task вызовы от имени profile не выполняются; история submissions и launcher projects сохраняются.
- Использование credentials не разрешается повторно автоматически: нужны новая проверка identity и утвержденный recovery/reactivation flow. Полный recovery flow в Milestone 2 пока не проектируется.

## Интеграционные границы Milestone 2

UI не обращается к Bitrix24 напрямую. Используются три server-only контракта:

- `Bitrix24IdentityClient` — OAuth URL, code exchange, refresh token pair, current user, `member_id`, domain, `ACTIVE` и `USER_TYPE`;
- `Bitrix24DirectoryClient` — server-side поиск и пагинация group/project/scrum и active employee, исключение collab и extranet-enabled сущностей, проверка доступности и `create_tasks`;
- `Bitrix24TaskClient` — контракт будущего создания задач.

Identity и Directory получают live-реализации в Milestone 2 после успешных соответствующих technical spikes; сейчас существуют только их server-only контракты. `Bitrix24TaskClient` уже использует `MockBitrix24TaskClient` только в development/test, а server-only composition root всегда выбирает `DisabledBitrix24TaskClient` в production. Режим не принимается из браузера или form data.

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

Для выбора допускаются только доступные текущему OAuth-пользователю активные и незакрытые `group`, `project` и `scrum` с правом `create_tasks`. Исключаются `collab`, extranet-enabled сущности, inactive, closed, недоступные сущности и сущности без `create_tasks`. Источником истины по доступу остается Bitrix24.

## Исполнители

- Исполнителем может быть любой active employee связанного портала независимо от наличия profile или входа в Task Launcher.
- Extranet, email users и другие внешние типы не допускаются.
- Для выбора используются только Bitrix user ID, имя, фамилия, отчество при наличии, должность, подразделения, active и user type.
- Телефоны, дата рождения, адрес, фотография, email и другие персональные данные без необходимости не запрашиваются.
- При одинаковом ФИО UI добавляет должность, затем подразделение и в крайнем случае Bitrix user ID.
- Поиск выполняется server-side с фильтрацией и пагинацией. Окончательный основной метод будет выбран directory spike между `user.search + user.get` и `humanresources.employee.search + user.get`; второй вариант не отменяет финальную проверку через `user.get`.

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

## Technical spikes Milestone 2

До соответствующей реализации и только после отдельного подтверждения выполняются четыре spike:

1. OAuth отдельного PWA.
2. Проверка `member_id` и portal identity.
3. Directory group/project/scrum, collab, extranet-enabled сущностей и `create_tasks`.
4. Directory active employee и минимальных scopes.

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
