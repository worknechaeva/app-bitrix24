# Независимый аудит Task Launcher — 2026-10-07

## Вывод

Репозиторий целостен; результаты оркестратора включены в main. У приложения есть работающий локальный mock и большая часть server-side Milestone 2, но milestone не завершен и production readiness не подтверждена. Обнаружены три открытых замечания: browser binding OAuth (QA-027), потеря error-попыток (QA-028), dependency advisories (QA-029).

Аудит выполнен в отдельном чате напрямую по коду, Git и повторным проверкам. Отчеты оркестратора не принимались как единственное доказательство. Это исторический снимок; требования по-прежнему задают current-scope и Active decisions.

## Объем и ограничения

- Прочитаны обязательные scope/decisions/architecture/roadmap, QA, README, PLAN и `.orchestrator/context.md`.
- Проверены Git refs, все зарегистрированные worktrees, PR/CI через GitHub, auth/session boundaries, task use case, project ownership, gateway и regression coverage.
- Установлены зависимости из frozen lockfile. Проверки выполнены на Node 24.19.0 / pnpm 11.19.0.
- PostgreSQL-проверки выполнены на отдельном Supabase `task-launcher-audit-20261007`, API 55321 / DB 55322, с committed migrations. Remote Supabase и данные владельца не изменялись.
- Live OAuth/Directory на реальном портале и deployment не выполнялись. Это ревью ключевых границ и полного автоматического gate, а не построчный формальный аудит каждого компонента или всей Git-истории на секреты.

## Git и результаты испытаний оркестратора

Начальная точка — `66cae16`: текущий worktree был чистым detached HEAD, совпадал с main и origin/main. Read-only `git ls-remote --heads origin` подтвердил удаленные refs. Во время работы другой чат добавил `f31b9d3` — правило остановки Docker/Colima; локальные main и origin/main обновились. Ветка аудита `codex/project-audit` переведена на этот новый main, локальные правки сохранены.

На момент итоговой проверки:

- 30 локальных веток, включая созданную ветку аудита; 21 удаленная business/task ветка на начало read-only сверки, затем добавлена `codex/docker-colima-rule` (origin/HEAD не является отдельной веткой).
- Все локальные ветки и HEAD существующих worktrees находятся в истории main. `git log --all --not main` пуст; среди refs не найдены потерянные неприсоединенные коммиты. Это не исключает отдельную работу в untracked файлах.
- `git fsck --full` завершился с exit 0: только 11 dangling objects, ошибок целостности нет. Они не удалялись; reflogs не чистились.
- 18 PR из истории GitHub имеют статус MERGED; открытых PR на момент read-only запроса нет. После запроса другой чат мог выполнять свои GitHub-операции.
- [CI исходного main 66cae16](https://github.com/worknechaeva/app-bitrix24/actions/runs/37491912673) завершился успешно. Локальный gate повторен независимо; статусы этого отчета не выведены из commit messages.

После merge PR #18 в main находятся:

| Коммиты / ветки                                  | Результат в main                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------- |
| `8cf7dd0`, `codex/result-55f8c8f4db8945ee`       | Actor-scoped mock history и общий process store между server bundles      |
| `24432e8`, `c6be262`, две ветки `codex/result-*` | Дополнительные прямые regression-тесты production mock guard              |
| `4f04029`                                        | Уточнение development-only environment template                           |
| `fee6e1e`, `integration/orchestrator-2026-09-29` | Integration branch оркестратора; результат уже в main                     |
| `30e353f`, `f7fdc97`, `64f6a9e`                  | Создание и уточнение `.orchestrator/context.md`                           |
| `83b40a2`, `codex/profile-lifecycle-diagnostics` | Изоляция database fixtures и безопасная классификация storage failures    |
| `a65174c`, `codex/block-profile-timestamp-fix`   | Migration и regression для гонки timestamps при блокировке profile        |
| `66cae16`, `codex/result-2cb2af13e21a432b`       | Документационное подтверждение QA-026, не отдельная функция приложения    |
| `f31b9d3`, `codex/docker-colima-rule`            | Добавлен параллельно аудиту; учтен новый порядок остановки локальной базы |

Генерические названия коммитов затрудняют чтение истории, но сами изменения не потеряны. Старые коммиты не переписывались.

## Worktrees и безопасная очистка

Изначально зарегистрированы 23 worktree. Один — `/private/tmp/codex-milestone-2-production-auth-flow` — уже отсутствовал физически. Dry-run подтвердил только эту stale registration; `git worktree prune --verbose` удалил ее. Осталось 22 регистрации.

| Группа                                         | Состояние и действие                                                                                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Основная папка `Documents/GitHub/app-bitrix24` | В начале была незакоммиченная правка AGENTS.md; другой чат затем закоммитил ее в main. Владелец и параллельная работа не изменялись                   |
| `a940/app-bitrix24`                            | Текущий чат; отдельная `codex/project-audit`, документация и CI остаются локальными изменениями                                                       |
| `8718/app-bitrix24`                            | Есть untracked `.state/briefs` и `.state/proposals`, включая Python-тесты оркестратора. Это не содержимое приложения и не было перенесено или удалено |
| Остальные 19 существующих checkout             | При read-only сверке чистые, их HEAD входят в main. Часть связана с прежними milestone-чатами; не удалены                                             |

Ветки milestone и старые `codex/result-*` являются кандидатами на последующую очистку, а не признаком незавершенного merge. Сначала нужно проверить привязку worktree к чатам в Codex и сохранить нужные ignored/untracked материалы. Удаление всех старых каталогов по одному признаку «merged branch» небезопасно. Публикации, PR, merge и удаления удаленных веток в этом чате не выполнялись.

## Карта фактической готовности

| Часть                      | Реализация                                                                                          | Что остается                                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Milestone 1, mock UI       | Работает локально: задачи, files metadata, проекты, история, mobile PWA                             | QA-028: error-попытки теряются                                                                                                        |
| Portal / profiles          | Singleton, reconciliation, admission, локальные роли, grants/RLS                                    | Remote schema не проверялась                                                                                                          |
| OAuth / sessions           | Live client, persistent state hash, encrypted credentials, rotation, secure cookie, logout          | QA-027: browser binding; cleanup state/sessions отсутствует                                                                           |
| Credentials                | AES-256-GCM, version-safe replacement/rotation, block/reauth states                                 | Automatic provider refresh и controlled recovery отсутствуют                                                                          |
| Administrator lifecycle    | Bootstrap, role change, block, last-admin guards и races проверены                                  | Live `/settings/users` остается placeholder; entrypoints не образуют рабочий административный экран                                   |
| Directory                  | Production adapter, bounded pagination, минимальные DTO, documented/read-only verified contracts    | В этом аудите live calls не повторялись; provider refresh отсутствует                                                                 |
| Launcher projects          | Persistent ownership, save/revalidate, archive/restore audit, idempotent create, live page и drafts | Remote deployment не проверялся                                                                                                       |
| Persistent submissions     | Требования и модель утверждены                                                                      | Нет migrations/repository/UI integration для `task_submissions` и `task_submission_files`; runtime Map не является persistent storage |
| Production task operations | Disabled client и guards работают                                                                   | Live task creation, binary upload, tags/Scrum/status относятся к следующему milestone                                                 |
| Vercel readiness           | Lazy secrets, canonical callback, fail-closed build/runtime                                         | QA-027/029; инфраструктурные access logs, environment и реальный deployment не подтверждены                                           |

PWA manifest и install flow реализованы. Offline mode и push не относятся к текущему scope. UI не использует Supabase Auth, frontend service-role key или собственный Supabase JWT.

## Замечания ревью

### P1 / QA-027: callback принимает вход из другого браузера

`handleProductionOAuthStart` выдает random state, сохраняет его hash и отправляет redirect без cookie привязки. `handleProductionOAuthCallback` принимает любой еще действующий state из общей БД, не сверяя инициировавший browser context. Существующая app session cookie читается только позже, для revoke/rotation. Successful bootstrap integration test получает 302 и новую session на Request без Cookie.

Это допускает login CSRF: callback пользователя A может выдать сессию A браузеру B. Вывод сделан из request flow и integration evidence; live exploit не проводился. Одноразовое consumption защищает от replay, но не от переноса первой попытки между браузерами. Основание — [RFC 6749 §10.12](https://www.rfc-editor.org/rfc/rfc6749#section-10.12).

Исправление: browser-bound nonce/state proof, проверяемый до provider work и side effects, плюс регрессии для двух cookie jar, отсутствующего/неверного binding, replay и нормального OAuth. Не ограничиваться сравнением state с общей database row.

### P2 / QA-028: error-попытка не сохраняется

`executeCreate` сохраняет runtime record только при success и timeout. Ошибка интеграции возвращает message без записи в Map; cached outcome также рассчитан только на success/unknown. Требование сохранения safe error attempts в current-scope не выполнено. Regression проверяет сообщение, но не историю и replay.

Исправление должно включать error record, actor isolation, правильный cached error outcome и проверку одного client invocation. Persistent submissions остается отдельной задачей и не считается выполненной этой mock-моделью.

### P1 / QA-029: актуальные security advisories зависимостей

`pnpm audit --prod --json` выявил 75 уязвимых вхождений dependency graph: 4 critical, 31 high, 36 moderate, 4 low. Нормализованные package/version/path/URL данные сохранены в [dependency-audit.json](./2026-10-07-dependency-audit.json); значения environment и секреты в него не включены.

Применимый пример: `next@16.2.10` + App Router + Server Actions соответствуют условиям [upstream DoS advisory](https://github.com/vercel/next.js/security/advisories/GHSA-m99w-x7hq-7vfj). Патч именно этого advisory начинается с 16.2.11, но другие advisories имеют иные patched ranges. Выбирать версию нужно по полному актуальному набору, затем повторять gate.

Critical findings включают Windows hosting, AVIF image optimization, `next/og` и `proxy-addr`. Windows deployment, `next/og`, `next/image`, custom server и rewrites в source не обнаружены; отсутствие этих вызовов не является универсальным доказательством неприменимости. Exploitability каждого finding требует отдельного триажа. `shadcn` — CLI — находится в dependencies и приводит MCP/Express graph в production install; перенос в devDependencies сократит ненужную runtime поверхность. Версии и lockfile в этой пачке не менялись.

### P2: зеленый CI не запускал обязательный format gate

В verify job отсутствовал `pnpm format:check`, хотя AGENTS.md требует его. Добавлен шаг перед lint. Database job проверяет все storage slices, а не только portal installation; добавлен поясняющий комментарий. Его ID сохранен, чтобы не менять существующие required status checks.

### Документационные расхождения исправлены

- DEC-031 больше не относит реализованный administrator lifecycle к будущим задачам.
- DEC-035 больше не описывает проекты и Directory как еще не подключенные.
- Architecture различает будущий cleanup и реализованные session operations; расположение RPC в `public` описано без ложного утверждения, что они вне Data API schema.
- Roadmap явно показывает незавершенный Milestone 2, отсутствие submissions и незавершенную readiness; directory spikes больше не названы текущими блокерами.
- README, PLAN и scope содержат карту текущих пробелов и ссылку на этот аудит.
- QA сохраняет историю закрытых findings и добавляет три Open записи; `.orchestrator/context.md` больше не фиксирует устаревающее «Open нет».

Продуктовые границы не менялись, удаленные функции не возвращались. Новых migrations, live calls и app behavior changes в этой пачке нет.

## Независимо выполненные проверки

| Проверка                                           | Результат                                                                                                |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                   | Pass, lockfile не изменен                                                                                |
| `pnpm format:check`                                | Pass на исходном проекте; повторен после документационных правок                                         |
| `pnpm lint`                                        | Pass                                                                                                     |
| `pnpm typecheck`                                   | Pass                                                                                                     |
| `pnpm test`                                        | 50 файлов, 460 тестов — pass                                                                             |
| `pnpm test:e2e`                                    | 47 pass, 1 штатный skip (desktop для проверки mobile viewport); Chromium desktop/Android и iPhone WebKit |
| `pnpm build`                                       | Pass, production build без runtime secrets                                                               |
| `supabase test db --local supabase/tests/database` | 7 файлов, 253 pgTAP assertions — pass                                                                    |
| `pnpm test:database`                               | 7 файлов, 42 PostgreSQL tests — pass                                                                     |
| `pnpm audit --prod --json`                         | Findings, exit 1; QA-029 остается Open                                                                   |
| `git fsck --full`                                  | Exit 0, ошибок целостности нет                                                                           |

Turbopack build в sandbox завис; после остановки он успешно выполнен вне sandbox. Первый Supabase startup в `/tmp` не прошел из-за недоступного Colima bind mount ключевого файла; перенос только временной конфигурации в ignored `node_modules/.cache` устранил инфраструктурную проблему. Это не ошибка migrations. Schema и concurrency проверки выполнены на успешно запущенном изолированном стеке.

Локальные API keys не выводились в чат и не сохранялись в tracked файлах. Временный Supabase остановлен без `--no-backup`. После пустого `docker ps` Colima остановлена по AGENTS.md. Для следующей сессии: `colima start`, затем `pnpm exec supabase start` для нужного локального проекта. Reset базы владельца не выполнялся.

## Очередность дальнейшей работы

1. Закрыть QA-027 и QA-029 с regression/security checks до deployment.
2. Исправить QA-028 и отдельно выполнить persistent submissions slice, включая actor authorization, idempotency, safe errors и metadata-only files.
3. Завершить Milestone 2 readiness: сверить environment, инфраструктурные access logs без OAuth query secrets, production guards и полный QA. Только после этого объявлять milestone завершенным.
4. Отдельно определить scope live административного UI, cleanup и refresh/recovery; наличие server contracts не означает готовность пользовательского сценария.
5. По привязкам Codex архивировать ненужные worktrees, сохранив материалы `.state`, затем убрать merged local/remote branches. Remote deletion требует отдельного разрешения владельца.
6. Live Task client, реальные files, tags/Scrum/status оставлять в следующем интеграционном milestone.
