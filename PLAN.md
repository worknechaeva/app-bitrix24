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
- RLS, закрытые browser grants и узкие actor-aware PostgreSQL RPC;
- browser binding production OAuth, безопасная error-история/replay в mock и обновление зависимостей (QA-027–QA-029).

## Следующие задачи Milestone 2

1. Persistent `task_submissions` и `task_submission_files` с безопасной историей попыток.
2. Финальная проверка production guards и Vercel readiness без создания remote resources.
3. Повторный полный QA и синхронизация документации.

[Аудит от 2026-10-07](./docs/audits/2026-10-07-project-review.md) сохраняет исходный снимок. [Стабилизация от 2026-10-11](./docs/audits/2026-10-11-stabilization.md) содержит закрытие замечаний, проверки и результат очистки Git/worktrees. Live UI управления пользователями, cleanup sessions/state и provider refresh пока отсутствуют; для их реализации нужен отдельный scope.

## Следующий интеграционный milestone

Live `Bitrix24TaskClient`, `tasks.task.add`, загрузка файлов, TAGS, Scrum backlog и синхронизация статусов выполняются отдельно. Automatic token refresh, recovery заблокированного profile, deployment, push, PR и merge не входят в текущую пачку.
