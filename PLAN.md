# Task Launcher — план Milestone 2

**Статус:** локально реализованы production OAuth authentication contour, persistent portal/profile/session/credentials foundation, administrator/profile lifecycle, production Directory и персональные `launcher_projects`. Remote Supabase schema и deployment не изменялись.

Канонический scope находится в [docs/product/current-scope.md](./docs/product/current-scope.md), решения — в [docs/product/decisions.md](./docs/product/decisions.md), архитектурные границы — в [docs/architecture.md](./docs/architecture.md), этапы — в [docs/roadmap.md](./docs/roadmap.md).

## Завершено локально

- app-owned Bitrix24 OAuth и собственные hash-only app sessions;
- singleton portal installation, profiles, внутренние роли и блокировка profile;
- зашифрованные user-scoped OAuth credentials;
- live Identity и Directory по read-only verified контрактам;
- персональные persistent `launcher_projects`, ownership, archive/restore и append-only audit;
- live-страница проектов и единые правила mock/live;
- идемпотентное создание проектов и отдельное восстановление списка после подтвержденной мутации;
- RLS, закрытые browser grants и узкие actor-aware PostgreSQL RPC.

## Следующие задачи Milestone 2

1. Persistent `task_submissions` и `task_submission_files` с безопасной историей попыток.
2. Финальная проверка production guards и Vercel readiness без создания remote resources.
3. Полный QA и синхронизация документации.

## Следующий интеграционный milestone

Live `Bitrix24TaskClient`, `tasks.task.add`, загрузка файлов, TAGS, Scrum backlog и синхронизация статусов выполняются отдельно. Automatic token refresh, recovery заблокированного profile, deployment, push, PR и merge не входят в текущую пачку.
