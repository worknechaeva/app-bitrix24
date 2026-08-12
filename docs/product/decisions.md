# Журнал продуктовых решений

Действующими являются только записи со статусом `Active`. Записи `Superseded` сохраняются как история и не должны возвращаться в продукт без нового явного решения пользователя.

## DEC-001 — Формат приложения

- **Дата:** 2026-07-20
- **Статус:** Active
- **Контекст:** Нужен один интерфейс для desktop, iPhone и Android без поддержки трех отдельных приложений.
- **Решение:** Разрабатывать Task Launcher как адаптивное mobile-first PWA, а не нативное приложение.
- **Последствия:** Одна кодовая база; установка через браузер; iOS использует ручной сценарий установки.
- **Связанные QA-записи:** QA-001.
- **Заменяет:** —

## DEC-002 — Серверная граница Bitrix24

- **Дата:** 2026-07-20
- **Статус:** Superseded
- **Контекст:** Webhook и REST-ответы нельзя раскрывать браузеру.
- **Решение:** Bitrix24 доступен только через server-only интеграционный слой `Bitrix24Client`; UI использует внутренние DTO.
- **Последствия:** Общая server-only граница сохраняется, но единый контракт заменен разделением Identity, Directory и Task.
- **Связанные QA-записи:** —
- **Заменено:** DEC-022.

## DEC-003 — Интеграция первого milestone

- **Дата:** 2026-07-20
- **Статус:** Active
- **Контекст:** Внешние credentials еще не предоставлены.
- **Решение:** Первый milestone работает через development-only mock.
- **Последствия:** Сценарий полностью проверяется локально; mock недоступен в production.
- **Связанные QA-записи:** QA-013.
- **Заменяет:** —

## DEC-004 — Выбор недавнего проекта

- **Дата:** 2026-07-20
- **Статус:** Active
- **Контекст:** Переход с главной должен сокращать число действий.
- **Решение:** Нажатие на недавний проект открывает форму задачи с выбранным проектом.
- **Последствия:** Маршрут или состояние формы обязаны передавать и валидировать ID активного проекта.
- **Связанные QA-записи:** QA-003.
- **Заменяет:** —

## DEC-005 — Поведение срока

- **Дата:** 2026-07-20
- **Статус:** Active
- **Контекст:** Срок не обязателен и не должен появляться без действия пользователя.
- **Решение:** Срок пустой по умолчанию, выбирается явно, полностью очищается и не передается при пустом значении.
- **Последствия:** Поведение проверяется отдельно в Safari; mapper не создает deadline из пустой строки.
- **Связанные QA-записи:** QA-006.
- **Заменяет:** —

## DEC-006 — Удаление лишних полей задачи

- **Дата:** 2026-07-20
- **Статус:** Active
- **Контекст:** Приоритет, оценка и ручное управление учетом времени не соответствуют процессу портала.
- **Решение:** Удалить поля «Приоритет», «Оценка в часах» и «Учет времени» из пользовательского и проектного интерфейса.
- **Последствия:** Эти значения не входят в форму, project defaults, внутренний create DTO и mapper.
- **Связанные QA-записи:** QA-005, QA-011, QA-012.
- **Заменяет:** DEC-015, DEC-016, DEC-018.

## DEC-007 — Учет времени на стороне Bitrix24

- **Дата:** 2026-07-20
- **Статус:** Active
- **Контекст:** В портале уже существует автоматизация учета времени.
- **Решение:** Task Launcher не управляет учетом времени; его включает существующая автоматизация Bitrix24.
- **Последствия:** UI и интеграционный payload не отправляют управляющий флаг учета времени.
- **Связанные QA-записи:** QA-011.
- **Заменяет:** DEC-016.

## DEC-008 — Состав дополнительных параметров

- **Дата:** 2026-07-20
- **Статус:** Active
- **Контекст:** Пользователю нужен минимальный, но достаточный набор уточнений.
- **Решение:** В дополнительных параметрах остаются ответственный, срок, текст задачи, дополнительные теги и файлы.
- **Последствия:** Приоритет, оценка и управление учетом времени отсутствуют.
- **Связанные QA-записи:** QA-005, QA-011, QA-012, QA-014.
- **Заменяет:** DEC-018.

## DEC-009 — Файлы в mock-режиме

- **Дата:** 2026-07-20
- **Статус:** Active
- **Контекст:** UI выбора файлов нужен до подключения реального портала.
- **Решение:** В первом milestone выбор файлов работает в mock-режиме и сохраняет только безопасные метаданные; реальная загрузка файлов в Bitrix24 добавляется позднее.
- **Последствия:** Бинарные данные не логируются и не входят в sanitized payload.
- **Связанные QA-записи:** QA-014, QA-016, QA-017, QA-018.
- **Заменяет:** —

## DEC-010 — Доменный статус истории

- **Дата:** 2026-07-20
- **Статус:** Active
- **Контекст:** Жесткая подпись «Создано» не отражает жизненный цикл задачи.
- **Решение:** История использует внутренние статусы `new`, `in_progress`, `completed` и `unknown`.
- **Последствия:** UI отображает локализованные подписи из доменной модели, а не REST-значения напрямую.
- **Связанные QA-записи:** QA-008.
- **Заменяет:** DEC-017.

## DEC-011 — Live-синхронизация статусов

- **Дата:** 2026-07-20
- **Статус:** Active
- **Контекст:** Mock не может предоставлять актуальное состояние портала.
- **Решение:** Получение актуального статуса и синхронизация истории с Bitrix24 выполняются в интеграционном milestone.
- **Последствия:** До интеграционного milestone доменная модель проверяется на fixtures и mock-данных.
- **Связанные QA-записи:** QA-008.
- **Заменяет:** —

## DEC-012 — Управление проектами

- **Дата:** 2026-07-20
- **Статус:** Superseded
- **Контекст:** Изменение интеграционных настроек проекта является административной операцией.
- **Решение:** Создавать, редактировать, включать и выключать проекты может только администратор.
- **Последствия:** Это правило остается историей mock-модели первого milestone; постоянная модель использует персональные `launcher_projects`.
- **Связанные QA-записи:** QA-010, QA-019.
- **Заменено:** DEC-025.

## DEC-013 — Ручной повтор после timeout

- **Дата:** 2026-07-20
- **Статус:** Active
- **Контекст:** Bitrix24 не гарантирует внешнюю idempotency, поэтому автоматический повтор опасен, но форма не должна оставаться заблокированной.
- **Решение:** После timeout автоматического повтора нет; пользователь проверяет портал и запускает новую ручную попытку с новым idempotency key.
- **Последствия:** Статус исходной попытки остается `unknown`; повтор является отдельной операцией.
- **Связанные QA-записи:** QA-013.
- **Заменяет:** DEC-019.

## DEC-014 — Границы текущей пачки

- **Дата:** 2026-07-20
- **Статус:** Superseded
- **Контекст:** Сначала нужно стабилизировать mock UX и документацию.
- **Решение:** Supabase и настоящий Bitrix24 не подключаются в текущей пачке изменений.
- **Последствия:** Решение описывает завершенную пачку первого milestone; новые границы определены для Milestone 2.
- **Связанные QA-записи:** QA-008, QA-010, QA-014.
- **Заменено:** DEC-028.

## DEC-015 — Приоритет как project default

- **Дата:** 2026-07-20
- **Статус:** Superseded
- **Контекст:** В исходном milestone проект хранил `defaultPriority`, а форма позволяла переопределить приоритет.
- **Решение:** Передавать приоритет из project defaults или формы.
- **Последствия:** Больше не действует; поле должно быть удалено из UI, модели и DTO.
- **Связанные QA-записи:** QA-005.
- **Заменено:** DEC-006.

## DEC-016 — Оценка и управление учетом времени

- **Дата:** 2026-07-20
- **Статус:** Superseded
- **Контекст:** Исходная форма содержала оценку в часах и флаг учета времени проекта.
- **Решение:** Переводить оценку в секунды и отправлять `allowTimeTracking`.
- **Последствия:** Больше не действует; учет времени остается автоматизацией портала.
- **Связанные QA-записи:** QA-011, QA-012.
- **Заменено:** DEC-006 и DEC-007.

## DEC-017 — История только по результату отправки

- **Дата:** 2026-07-20
- **Статус:** Superseded
- **Контекст:** Первый mock показывал успешную отправку как статичный статус «Создана».
- **Решение:** Использовать технические состояния `success`, `error` и `unknown` как отображаемые статусы истории.
- **Последствия:** Больше не действует для доменного статуса задачи; технический результат операции может храниться отдельно.
- **Связанные QA-записи:** QA-008.
- **Заменено:** DEC-010 и DEC-011.

## DEC-018 — Дополнительные параметры без файлов

- **Дата:** 2026-07-20
- **Статус:** Superseded
- **Контекст:** Первый mock включал описание, приоритет, оценку и теги, но не включал файлы.
- **Решение:** Использовать этот набор как расширенную форму первого milestone.
- **Последствия:** Больше не действует; актуальный набор определен в DEC-008 и DEC-009.
- **Связанные QA-записи:** QA-005, QA-012, QA-014.
- **Заменено:** DEC-006, DEC-008 и DEC-009.

## DEC-019 — Timeout сохраняет исходный ключ без новой попытки

- **Дата:** 2026-07-20
- **Статус:** Superseded
- **Контекст:** Первая реализация сохраняла `unknown` по idempotency key и при повторной отправке возвращала ту же запись.
- **Решение:** Не давать форме создать новую попытку после timeout.
- **Последствия:** Больше не действует; автоматический повтор все еще запрещен, но ручная попытка должна получить новый ключ.
- **Связанные QA-записи:** QA-013.
- **Заменено:** DEC-013.

## DEC-020 — Bitrix24 OAuth и один портал на deployment

- **Дата:** 2026-07-22
- **Статус:** Active
- **Контекст:** Task Launcher является отдельным PWA для одного заранее настроенного облачного портала и должен создавать будущие задачи от имени вошедшего пользователя.
- **Решение:** Приложение самостоятельно выполняет Bitrix24 OAuth. Один deployment и одна его database обслуживают ровно один portal `member_id`, допускается только одна активная portal installation; пользователь не выбирает портал. Войти могут только `ACTIVE=true`, `USER_TYPE=employee` связанного портала.
- **Последствия:** Callback с другим `member_id` отклоняется до создания profile, app session и credentials и не сохраняет вторую installation. Canonical domain обновляется только после доверенной OAuth-проверки при прежнем `member_id`. Другой портал требует отдельного deployment и отдельной database/project configuration; конкретная SQL-реализация singleton constraint зафиксирована в DEC-030. Supabase Auth, email/password, публичная регистрация, invite, reset password, SMTP, Supabase Custom OAuth Provider и внутренний JWT не используются в Milestone 2.
- **Связанные QA-записи:** —
- **Заменяет:** —

## DEC-021 — Собственная app session

- **Дата:** 2026-07-22
- **Статус:** Active
- **Контекст:** У пользователя нет Supabase Auth session или JWT, а Bitrix24 OAuth credentials нельзя передавать браузеру.
- **Решение:** После успешного OAuth callback сервер выполняет session rotation и создает собственную сессию. Браузер получает только случайный непрозрачный token в cookie с production-флагами `HttpOnly`, `Secure` и `SameSite=Lax`; в `app_sessions` хранится только hash. OAuth state одноразово хранится как hash в `oauth_transactions`.
- **Последствия:** Session token недоступен JavaScript, сырой token не хранится в БД, а cookie не содержит profile ID, Bitrix user ID, OAuth token или роль. Logout и блокировка profile отзывают серверные сессии; истекшие и отозванные записи очищаются технической процедурой. Return path разрешается только из безопасного набора внутренних маршрутов.
- **Связанные QA-записи:** —
- **Заменяет:** —

## DEC-022 — Разделение Bitrix24-контрактов

- **Дата:** 2026-07-22
- **Статус:** Active
- **Контекст:** Identity, справочные данные и создание задач имеют разные сроки подключения, права и риски.
- **Решение:** Использовать отдельные server-only контракты `Bitrix24IdentityClient`, `Bitrix24DirectoryClient` и `Bitrix24TaskClient`.
- **Последствия:** Identity отвечает за OAuth и current user; Directory — за group/project/scrum и active employee; Task — за будущие операции с задачами. В Milestone 2 Task остается mock только в development/test, а production использует `DisabledBitrix24TaskClient`: mock не может записать `operation_status=success`, фиктивный `bitrix_task_id` не создается, а UI может скрыть или заблокировать submit либо получить безопасный результат `task_creation_disabled`.
- **Связанные QA-записи:** —
- **Заменяет:** DEC-002.

## DEC-023 — Server-side authorization без user-scoped RLS

- **Дата:** 2026-07-22
- **Статус:** Active
- **Контекст:** Выбранная Auth-модель не выпускает конечному пользователю Supabase JWT.
- **Решение:** `auth.uid()` не представляет пользователя Task Launcher, user-scoped Supabase RLS отсутствует. RLS и grants закрывают Data API для `anon` и `authenticated`; права проверяются через app session, server-only DAL, actor-aware repositories и узкие PostgreSQL RPC.
- **Последствия:** Service-role обходит RLS и доступен только privileged database gateway. Actor profile ID из браузера не считается доверенным. Критические RPC разрешают actor через активную app session и повторно проверяют portal, profile, `is_active` и role.
- **Связанные QA-записи:** —
- **Заменяет:** —

## DEC-024 — Profiles, внутренние роли и первый administrator

- **Дата:** 2026-07-22
- **Статус:** Active
- **Контекст:** Локальные полномочия не должны зависеть от роли пользователя в Bitrix24 или Supabase Auth.
- **Решение:** Profile имеет внутренний UUID и уникальность `portal_installation_id + bitrix_user_id`, не обязан быть связан с `auth.users` и при первом допустимом входе получает `editor`. Роли `administrator/editor` хранятся в Task Launcher.
- **Последствия:** Administrator Task Launcher может повысить вошедшего employee независимо от прав в портале. Последнего активного administrator нельзя понизить, заблокировать или удалить. При `is_active=false` отзываются все app sessions, запрещается использование OAuth credentials и прекращаются новые Identity, Directory и Task вызовы от имени profile; история и launcher projects сохраняются. Credentials не разрешаются повторно автоматически без новой проверки identity и утвержденного recovery/reactivation flow. Первый administrator задается через server-only `BOOTSTRAP_ADMIN_BITRIX_USER_ID`, назначается после OAuth-проверок один раз и фиксируется в `admin_bootstrapped_at`; персональный ID не попадает в Git.
- **Связанные QA-записи:** —
- **Заменяет:** —

## DEC-025 — Персональные launcher projects

- **Дата:** 2026-07-22
- **Статус:** Active
- **Контекст:** Локальная настройка быстрого создания задачи не является самой группой, проектом или Scrum Bitrix24.
- **Решение:** Использовать сущность `launcher_projects` с owner. Каждый editor и administrator создает и редактирует собственные записи; editor видит свои, administrator видит все, но не редактирует чужие настройки и не меняет owner.
- **Последствия:** Administrator архивирует и восстанавливает чужие записи только узкими RPC. Физического удаления нет. Несколько записей одного owner могут ссылаться на один `bitrix_entity_id`; unique только по нему запрещен. Восстановление фиксируется append-only audit event. Перед будущим вызовом live Task client сервер повторно проверяет, что связанная entity существует, остается `group`/`project`/`scrum`, active, не closed, не collab и не extranet-enabled, а OAuth-пользователь все еще имеет доступ и `create_tasks`; исполнитель должен существовать и оставаться `ACTIVE=true`, `USER_TYPE=employee`. При отказе Task client не вызывается, success не записывается, возвращается безопасная ошибка, а launcher project сохраняется и может получить access state `unavailable` или `unknown`.
- **Связанные QA-записи:** QA-010, QA-019 как история прежней mock-модели.
- **Заменяет:** DEC-012.

## DEC-026 — Directory сотрудников и минимизация данных

- **Дата:** 2026-07-22
- **Статус:** Active
- **Контекст:** Исполнителем может быть сотрудник, который никогда не входил в Task Launcher, но внешние типы пользователей должны быть исключены.
- **Решение:** Выбирать можно любого active employee связанного портала независимо от наличия profile. Поиск выполняется server-side с пагинацией и финальной проверкой `ACTIVE` и `USER_TYPE`.
- **Последствия:** Без необходимости не запрашиваются email, телефоны, дата рождения, адрес, фотография и другие персональные данные. Основной метод будет выбран directory spike между `user.search + user.get` и `humanresources.employee.search + user.get`.
- **Связанные QA-записи:** —
- **Заменяет:** —

## DEC-027 — Постоянное хранение Milestone 2

- **Дата:** 2026-07-22
- **Статус:** Active
- **Контекст:** Milestone 2 должен заменить in-memory repositories и подготовить безопасное хранение OAuth credentials и истории без live task creation.
- **Решение:** Использовать таблицы `portal_installations`, `profiles`, `app_sessions`, `oauth_transactions`, `bitrix24_user_credentials`, `launcher_projects`, `launcher_project_audit_events`, `task_submissions` и `task_submission_files`.
- **Последствия:** Credentials отделены от profiles, access/refresh tokens зашифрованы, encryption key находится вне БД, refresh атомарно заменяет token pair с `token_version`. `task_submission_files` сохраняет только metadata — имя, MIME-тип и размер — без binary и `content_sha256`; реальная загрузка файлов в Bitrix24 относится к следующему integration milestone. `operation_status` ограничен `pending/success/error/unknown`; текущий UI `TaskStatus` не меняется.
- **Связанные QA-записи:** QA-008, QA-013, QA-014, QA-017.
- **Заменяет:** —

## DEC-028 — Границы Milestone 2 и integration milestone

- **Дата:** 2026-07-22
- **Статус:** Active
- **Контекст:** Identity и directory нужны раньше реального создания задач, а недокументированные task-сценарии требуют отдельного этапа.
- **Решение:** Milestone 2 включает документацию, четыре spikes, portal foundation, profiles/roles, sessions, encrypted credentials, directory clients, launcher projects, authorization/RPC, persistent submissions, production guards, Vercel readiness и QA.
- **Последствия:** В Milestone 2 остаются spikes OAuth PWA, portal identity, directory сущностей и directory active employee. `tasks.task.add`, реальная загрузка файлов в Bitrix24, TAGS, Scrum backlog, live status, `OnTaskUpdate`, polling и доставка Bitrix24 offline events переносятся в следующий интеграционный milestone. PWA offline mode и офлайн-создание задач не входят в Milestone 2 и не следуют из механизма Bitrix24 offline event delivery. Supabase Custom OAuth spike исключен.
- **Связанные QA-записи:** —
- **Заменяет:** DEC-014.

## DEC-029 — Результат development/test OAuth и portal identity spike

- **Дата:** 2026-08-04
- **Статус:** Active
- **Контекст:** Завершенный непроизводственный spike устранил неопределенность OAuth отдельного PWA, portal identity и admission, но production authentication и persistent storage еще не реализованы.
- **Решение:** Для development/test подтверждены локальное API-only приложение, installation callback с portal metadata без сохранения installer credentials, code exchange, OAuth token scope `app`, отдельная проверка application permission методом `scope`, достаточность `user_brief` для active employee admission, проверки `member_id` и portal origin, refresh token rotation, неизменность provider identity после refresh, `user.current` и fail-closed admission.
- **Последствия:** `app` является OAuth token scope, а `user_brief` — application permission и не ожидается в token response. Результат не означает готовность production OAuth flow, persistent или encrypted credentials storage, opaque app sessions, profiles/roles, Supabase gateway, migrations, production deployment или live task creation; production task client остается disabled и fail closed. Callback query parameters исключены из штатных development incoming-request access logs, но это не означает готовность production OAuth. Контролируемые callback validation errors возвращают HTTP 400, потому что callback request не может быть принят как согласованный OAuth request; admission rejection остается HTTP 403, настоящие provider/token exchange failures — HTTP 502, неожиданные внутренние ошибки — HTTP 500.
- **Связанные QA-записи:** —
- **Заменяет:** —

## DEC-030 — Persistent singleton для portal installation

- **Дата:** 2026-08-05
- **Статус:** Active
- **Контекст:** Storage-independent reconciliation contract требует конкретной PostgreSQL schema, защиты от конкурентного создания второго портала и воспроизводимой проверки без удаленного Supabase project.
- **Решение:** `portal_installations` содержит единственную строку с фиксированным ключом `1`, защищенным `PRIMARY KEY` и `CHECK`, уникальный стабильный `member_id`, canonical portal origin и timestamps. Одна `SECURITY INVOKER` PostgreSQL RPC атомарно создает installation, возвращает no-op, обновляет только origin прежнего `member_id` или возвращает mismatch. RLS включена без policies; права таблицы и RPC отозваны у `PUBLIC`, `anon` и `authenticated`, а `service_role` обращается к RPC только через server-only privileged gateway. Migration и database/concurrency tests запускаются в зафиксированном local Supabase stack и CI.
- **Последствия:** `updated_at` меняется только при фактическом изменении origin; singleton invariant и гонки защищены PostgreSQL, а не предварительным application-level `SELECT`. Slice подключен к локальному production OAuth callback по DEC-035, но не применен к удаленной schema и не означает готовый deployment.
- **Связанные QA-записи:** —
- **Заменяет:** —

## DEC-031 — Persistent profiles reconciliation

- **Дата:** 2026-08-05
- **Статус:** Active
- **Контекст:** После доверенной проверки portal identity и active employee admission локальная identity должна создаваться конкурентно-безопасно, не позволяя повторному OAuth-входу изменить локальные полномочия или реактивировать заблокированный profile.
- **Решение:** `profiles` использует внутренний UUID, внешний unique key `portal_installation_id + bitrix_user_id`, text role с `CHECK` для `editor/administrator`, `is_active` и минимальные snapshots `bitrix_active/bitrix_user_type`. Одна `SECURITY INVOKER` PostgreSQL RPC принимает только уже проверенный active employee, атомарно создает `editor`, обновляет только snapshots и verification timestamp и возвращает отдельный результат `inactive` без изменения role или `is_active`.
- **Последствия:** Конкурентные вызовы для одной identity создают ровно одну строку; полностью совпадающий snapshot не изменяет `updated_at`. RLS включена без policies, права `PUBLIC`, `anon` и `authenticated` отозваны, а server-only adapter использует существующий privileged gateway и нормализует ошибки. Production OAuth callback integration реализована локально по DEC-035; bootstrap administrator, role management, last-admin guard и административная блокировка остаются будущими. Удаленная Supabase schema не изменялась.
- **Связанные QA-записи:** —
- **Заменяет:** —

## DEC-032 — Persistent OAuth transactions foundation

- **Дата:** 2026-08-10
- **Статус:** Active
- **Контекст:** Будущий production OAuth flow требует одноразовый state, который переживает server process и не раскрывает raw value через persistent boundary.
- **Решение:** Server-only сервис генерирует 32 случайных байта в `base64url`, вычисляет полный lowercase SHA-256 hash и передает repository только hash с каноническим внутренним `return_path`. `oauth_transactions` использует database time и TTL ровно 10 минут; одна `SECURITY INVOKER` PostgreSQL RPC с row lock атомарно возвращает `consumed`, `unknown`, `expired` или `already_consumed`.
- **Последствия:** Raw state не хранится, не логируется и не входит в storage errors. Только первый допустимый consumer получает `return_path`; external и protocol-relative redirects, backslash, control characters и опасные percent-encoded разделители запрещены application и database checks. RLS включена без policies, доступ `PUBLIC`/`anon`/`authenticated` закрыт, а `service_role` имеет только select/insert/update и execute узкой RPC. Slice подключен к локальным production OAuth routes по DEC-035 и не применен к удаленной Supabase schema.
- **Связанные QA-записи:** —
- **Заменяет:** —

## DEC-033 — Persistent app sessions foundation

- **Дата:** 2026-08-10
- **Статус:** Active
- **Контекст:** Будущий production OAuth flow требует собственной server-side identity без Supabase Auth/JWT и без передачи profile, role или OAuth credentials браузеру.
- **Решение:** Server-only session service генерирует 32 случайных байта в `base64url`, вычисляет полный lowercase SHA-256 hash и передает repository и PostgreSQL только hash. `app_sessions` связывает session с profile и portal composite foreign key; узкие `SECURITY INVOKER` RPC создают session только для текущего active employee profile, разрешают hash в минимальный actor context с актуальной ролью из `profiles` и атомарно устанавливают `revoked_at`. Database time задает абсолютный TTL ровно 30 дней; sliding expiration отсутствует, caller не выбирает TTL, обычный resolve не продлевает expiry.
- **Последствия:** Raw token не хранится, не логируется и не входит в storage errors. Unknown, expired, revoked и profile inactive outcomes не раскрывают actor identity; inactive profile и недопустимые Bitrix snapshots fail closed. RLS включена без policies, доступ `PUBLIC`/`anon`/`authenticated` закрыт, а `service_role` имеет только select/insert/update и execute трех session RPC. Foundation хранится в Postgres без Redis/KV и подключен к локальным callback/session rotation/cookie/logout по DEC-035; удаленная schema и deployment не изменялись.
- **Связанные QA-записи:** —
- **Заменяет:** —

## DEC-034 — Persistent encrypted Bitrix24 credentials foundation

- **Дата:** 2026-08-11
- **Статус:** Active
- **Контекст:** Будущим server-only Bitrix24 Identity, Directory и Task operations нужна persistent user-scoped token pair без plaintext в profiles, repository, gateway или БД и с корректным поведением конкурентного refresh.
- **Решение:** `bitrix24_user_credentials` хранится отдельно от profiles и содержит отдельно зашифрованные AES-256-GCM access/refresh envelopes формата version 1. Ключ — ровно 32 bytes в server-only base64 environment вне БД; каждый token получает отдельный random 12-byte IV, а authenticated AAD связывает marker, portal, profile, token kind и `token_version`. Initial create устанавливает `active` и `token_version=1`; атомарная RPC заменяет pair только при совпадении expected version. Отдельный optimistic transition в `reauth_required` защищает новую pair от stale refresh failure, а `disabled` остается отдельным запрещающим состоянием без automatic enable.
- **Последствия:** Plaintext token pair существует только в server memory credential service и не пересекает persistence boundary; tampering или AAD mismatch fail closed. Inactive profile и `disabled` не разрешают credentials; `reauth_required` возвращается в active только verified OAuth replacement по DEC-035. RLS и grants закрывают browser/Data API, service-role вызывает шесть узких `SECURITY INVOKER` RPC. Production OAuth callback подключен локально; реальный provider refresh и recovery administration не подключены, удаленная Supabase schema не изменена.
- **Связанные QA-записи:** —
- **Заменяет:** —

## DEC-035 — Production OAuth authentication flow

- **Дата:** 2026-08-11
- **Статус:** Active
- **Контекст:** Persistent portal, profile, OAuth transaction, encrypted credentials и app session foundations были изолированными slices и не образовывали production authentication contour. Повторный verified OAuth login не мог безопасно заменить существующую encrypted pair.
- **Решение:** Production OAuth использует отдельную live configuration и live `Bitrix24IdentityClient`, persistent hash-only state, trusted provider verification `member_id`/`app`/`user_brief`/current active employee, portal и profile reconciliation, узкий version-safe verified OAuth credentials create/replacement, rotation browser session и cookie `__Host-task-launcher-session` с `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, без `Domain`. Actor разрешается только через persistent app session; logout отзывает session и всегда очищает cookie. Mock auth остается development/test-only.
- **Последствия:** `reauth_required` может вернуться в `active` только после нового verified OAuth login; `disabled` автоматически не реактивируется. Production callback не выполняет immediate provider refresh. Пока persistent launcher projects, Directory и submissions не подключены, live authenticated UI показывает безопасный placeholder и не выдает mock business data. Remote Supabase, deployment и test portal не изменялись, поэтому решение не означает завершенный production deployment.
- **Связанные QA-записи:** —
- **Заменяет:** —

## DEC-036 — Administrator и profile lifecycle security contour

- **Дата:** 2026-08-13
- **Статус:** Active
- **Контекст:** Persistent profiles, app sessions и encrypted credentials уже запрещали использование inactive identity, но не существовало законченных операций первого administrator, role management и атомарной административной блокировки с защитой от concurrent last-admin races.
- **Решение:** Matching verified active employee может один раз выполнить first-admin bootstrap через необязательный server-only `BOOTSTRAP_ADMIN_BITRIX_USER_ID`. Узкие `SECURITY INVOKER` RPC изменяют роль и блокируют profile только по hash текущей active administrator app session. Portal singleton row сериализует admin mutations и last-active-administrator guard. Block одной транзакцией деактивирует profile, отзывает его пригодные sessions и переводит credentials в `disabled` без расшифровки.
- **Последствия:** Browser не передает actor identity; authorization повторяется database-side. OAuth reconciliation не меняет role и не реактивирует blocked profile, stale session/credential operations не могут оставить usable authority после block. Unblock отложен до controlled recovery с безопасной provenance состояния `disabled`; verified OAuth не активирует старую pair. Generic audit framework не добавляется, потому что он не требуется для correctness этого slice.
- **Связанные QA-записи:** —
- **Заменяет:** —
