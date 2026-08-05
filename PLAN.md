# Task Launcher — план Milestone 2

**Статус:** архитектура Milestone 2 утверждена. Реализованы server-only границы `Bitrix24IdentityClient`, `Bitrix24DirectoryClient` и `Bitrix24TaskClient`, development/test mock и production fail-closed для создания задач, а также локальная server-only конфигурация identity единственного портала. Development/test spikes OAuth отдельного PWA и portal identity завершены; локальное test Bitrix24 API-only приложение использовалось только как непроизводственный spike resource, production authentication, `portal_installations` и Bitrix24 application/resources не реализованы, Supabase и Vercel resources не созданы, persistent storage и миграции не реализованы.

Канонический scope находится в [docs/product/current-scope.md](./docs/product/current-scope.md), решения — в [docs/product/decisions.md](./docs/product/decisions.md), архитектурные границы — в [docs/architecture.md](./docs/architecture.md), полный порядок этапов — в [docs/roadmap.md](./docs/roadmap.md). Завершенный mock и QA-001–QA-019 сохраняются как результат Milestone 1 в [docs/qa/findings.md](./docs/qa/findings.md).

## Цель Milestone 2

Подготовить production foundation для одного облачного портала Bitrix24:

- app-owned Bitrix24 OAuth и собственные server-side sessions;
- profiles и внутренние роли без Supabase Auth;
- безопасное зашифрованное хранение user-scoped OAuth credentials;
- live Identity и Directory;
- персональные `launcher_projects`;
- server-side authorization, repositories и узкие PostgreSQL RPC;
- постоянная история submissions;
- production guards, Vercel readiness и полный QA.

Live task creation, реальная загрузка файлов в Bitrix24, TAGS, Scrum backlog и status synchronization относятся к следующему интеграционному milestone.

## Утвержденные границы

- Один deployment обслуживает один заранее настроенный portal `member_id`.
- Вход выполняется только через Bitrix24 OAuth для active employee.
- Supabase Auth, email/password, invite, reset password, SMTP, Custom OAuth Provider и внутренний JWT не используются.
- Браузер получает только непрозрачную HttpOnly session cookie.
- User-scoped Supabase RLS отсутствует; `auth.uid()` не является identity Task Launcher.
- RLS и grants закрывают Data API для `anon/authenticated`; права проверяют app session, DAL, repositories и RPC.
- Service-role client доступен только privileged database gateway.
- `Bitrix24TaskClient` остается mock в development/test и disabled/fail-closed в production.

## Таблицы

1. `portal_installations`;
2. `profiles`;
3. `app_sessions`;
4. `oauth_transactions`;
5. `bitrix24_user_credentials`;
6. `launcher_projects`;
7. `launcher_project_audit_events`;
8. `task_submissions`;
9. `task_submission_files`.

Migration каждого подсистемного этапа создается только после утверждения результата соответствующего blocking spike. OAuth PWA и portal identity spikes завершены в development/test и больше не блокируют portal, profiles, sessions и credentials foundation. Directory entity spike блокирует реализацию group/project/scrum directory, а directory employee spike — employee directory.

## Четыре technical spikes

1. OAuth отдельного PWA — завершен в development/test.
2. `member_id` и portal identity — завершен в development/test.
3. Directory group/project/scrum, collab, extranet-enabled сущности и `create_tasks`.
4. Directory active employee и минимальные scopes.

Оставшиеся directory spikes не запускаются без отдельного подтверждения и выделенных test resources.

## Порядок работы

1. **Documentation synchronization** — синхронизировать существующие документы без кода и ресурсов.
2. **Оставшиеся directory spikes** — отдельно проверить group/project/scrum directory и employee directory и остановиться после каждого результата для review.
3. **Portal foundation** — server-only конфигурация identity одного портала реализована локально; `portal_installations` и ее migration остаются следующим отдельным storage slice.
4. **Profiles и роли** — после того же spike добавить editor по умолчанию, bootstrap первого administrator и last-admin guard.
5. **Sessions и credentials** — после того же spike добавить `app_sessions`, `oauth_transactions`, encryption и token rotation; directory spikes для начала этого этапа не требуются.
6. **Directory clients** — после утверждения directory entity spike реализовать group/project/scrum directory, а после directory employee spike — employee directory и завершить live Identity/Directory.
7. **Launcher projects** — добавить ownership, archive/restore и append-only audit.
8. **Authorization и RPC** — закрыть Data API, изолировать privileged gateway и проверить матрицу доступа.
9. **Persistent submissions** — сохранять попытки, safe errors и file metadata.
10. **Production guards и Vercel readiness** — fail-closed composition и server-only environment.
11. **Полный QA** — применимые format/lint/typecheck/test/E2E/build и security regression.

Каждый этап имеет ручную точку остановки. Следующий этап не начинается автоматически.

## Первый следующий технический этап

OAuth и portal identity spike больше не блокируют portal foundation. Следующая техническая задача выбирается отдельно между portal foundation и одним из оставшихся directory spikes с учетом их зависимостей и необходимых подтверждений. Для следующей live OAuth campaign потребуются отдельное подтверждение, непроизводственный portal, local application, синтетические пользователи и временный HTTPS callback URL; production portal и реальные данные использовать запрещено.

## Проверка документационной пачки

- Markdown formatting существующими project scripts, если зависимости уже доступны;
- проверка ссылок и терминологии;
- поиск устаревших Auth/RLS/milestone-утверждений;
- `git diff` только по разрешенным документам;
- `git status` без commit.
