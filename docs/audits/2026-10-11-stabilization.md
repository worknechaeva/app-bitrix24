# Стабилизация после аудита — 2026-10-11

## Результат и границы

Замечания QA-027–QA-029 из [исходного аудита](./2026-10-07-project-review.md) закрыты кодом, регрессиями и проверкой применимости оставшегося dev-only advisory. Проект готов к продолжению локальной разработки на ветке `codex/project-audit`. Milestone 2 не завершен: persistent submissions еще отсутствуют. Remote schema, live task creation и deployment не выполнялись.

## Исправления

- QA-027: production OAuth callback проверяет browser-binding cookie до consumption, provider и persistence. Missing/mismatched/duplicate/malformed proof отклоняется без side effects. Совпавший callback очищает binding; новая app session cookie сохраняется. Два независимых cookie jar, rotation, denial, expiry и replay покрыты integration-тестами; DEC-039 фиксирует правило последнего start в браузере.
- QA-028: mock integration error сохраняет actor, safe message и metadata без внешнего ответа, task ID или URL. Concurrent/cached replay возвращает прежнюю ошибку без нового вызова; validation/preflight и production disabled client не создают mock history. Error виден в desktop/mobile истории. Явный повтор после error/unknown получает новый ключ; потерянный ответ без подтвержденного outcome сохраняет прежний ключ.
- QA-029: `next`/`eslint-config-next` обновлены до 16.3.8; `shadcn` 4.21.4 перенесен в devDependencies. Совместимые транзитивные patches и Vitest 4.1.11 зафиксированы в lockfile. Overrides в `pnpm-workspace.yaml` закрепляют browserslist 4.29.3, baseline-browser-mapping 2.11.28 и patch brace-expansion 5.0.12 для upstream requirement 5.0.7. Формат настроек соответствует pnpm 11.
- README, PLAN, current scope, архитектура, roadmap, QA и `.orchestrator/context.md` синхронизированы. Исторический отчет от 2026-10-07 сохранен без переписывания результатов.
- Next.js 16.3 автоматически добавляет managed agent-rules block при `next dev`. Источник проверен в `node_modules/next/dist/server/lib/generate-agent-files.js`, version-matched upgrade guide прочитан; блок сохранен в AGENTS.md для воспроизводимого чистого запуска.
- ESLint исключает генерируемые coverage/Playwright каталоги: параллельный запуск lint и E2E ранее приводил к ENOENT при пересоздании `test-results`.

## Проверки

Node 24.19.0, pnpm 11.25.0. Команды выполнялись напрямую, без оркестратора и автоматических повторов браузерных тестов.

| Проверка                   | Результат                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------- |
| Frozen lockfile install    | Pass                                                                               |
| `pnpm format:check`        | Pass                                                                               |
| `pnpm lint`                | Pass                                                                               |
| `pnpm typecheck`           | Pass                                                                               |
| `pnpm test`                | 50 файлов, 467 тестов — pass                                                       |
| `pnpm test:e2e`            | 50 pass, 1 штатный desktop skip; Chromium desktop, iPhone WebKit, Android Chromium |
| `pnpm build`               | Pass, production bundle и маршруты                                                 |
| `pnpm test:database`       | 7 файлов, 42 теста — pass                                                          |
| pgTAP                      | 7 файлов, 253 проверки — pass                                                      |
| `pnpm audit --prod --json` | 0 advisories                                                                       |
| `pnpm audit --json`        | 1 high dev-only advisory без upstream patch                                        |

Database-проверки выполнены на отдельном Supabase `task-launcher-stabilization-20261011`, API 55321 / DB 55322, с существующими миграциями. Schema и pinned Supabase packages не изменялись. Тестовые ключи не печатались, временные файлы с ними удалены. После проверок stack остановлен без `--no-backup`; работающих контейнеров не осталось, Colima остановлена. Обычный запуск базы проекта: `colima start`, затем `pnpm exec supabase start`.

### Наблюдения промежуточного прогона

До итогового холодного прогона один E2E запуск дал 49 pass / 1 failure / 1 skip: Next dev вернул `Unexpected end of JSON input` на `/login` в desktop-тесте восстановления черновика. Текущие manifests после сбоя были валидны; product assertion этого сценария затем прошел на iPhone и Android. Ошибка не доказана как дефект бизнес-логики. Dev server был остановлен, удален только генерируемый `.next/dev` cache, полный E2E повторен без автоматических retries. Это наблюдение сохраняется как ограничение dev-server проверки; если оно повторится, нужно отдельно исследовать запись/read manifests Next.js. Таблица выше относится к итоговому прогону и не скрывает предыдущий сбой.

### Остаточное dev-only advisory

Snapshots: [production audit](./2026-10-11-dependency-audit.json), [полный граф](./2026-10-11-dev-dependency-audit.json).

`braces@3.0.3` имеет [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): глубоко вложенный brace pattern может исчерпать стек, patched version на дату проверки отсутствует. Найденные dependency paths проходят через ESLint/fast-glob и shadcn/micromatch. Это dev tooling; production audit пакет не содержит. Конфигурации glob задаются доверенным репозиторием, HTTP input приложения в эти инструменты не передается. Вывод о неприменимости к текущему HTTP runtime основан на dependency graph и коде проекта; сама библиотека остается уязвимой. Не следует передавать ей недоверенные glob patterns. После upstream patch или изменения использования CLI требуется повторная оценка. Advisory не подавлен настройкой audit.

## Git и восстановимый архив

- Ветка работы: `codex/project-audit`, исходный main `f31b9d3`. Старые коммиты не переписаны. Push, PR и merge не выполнялись; main не обновлялся локальными исправлениями.
- Сохранены отдельные коммиты аудита, OAuth, mock error/retry и dependency remediation; итоговая документация фиксирует точку продолжения. Хеши доступны через `git log main..codex/project-audit`.
- Удалены 27 локальных веток, каждая полностью вошла в main и не была занята рабочей копией. Остались `main`, `codex/project-audit`, `codex/persistent-personal-projects` (последняя привязана к существующему чату).
- Архивированы и удалены пять чистых merged worktrees без привязанных чатов: `admin-profile-lifecycle`, `app-sessions`, `directory-live`, `milestone-2-oauth-portal-spikes`, `oauth-transactions`.
- Архив: `/Users/ekaterinanecaeva/Documents/GitHub/app-bitrix24-archives/2026-10-11`. В нем Git bundle всех refs до очистки, manifest с исходными HEAD/path, SHA удаленных веток и файлы рабочих копий, включая локальные конфигурации при их наличии. Генерируемые dependencies/build/test caches в архив не копировались. Архив не добавлялся в Git.
- `.state` из `8718` сохранена отдельно в `8718-state` внутри архива и оставлена в исходной рабочей копии. Другие рабочие копии связаны с существующими чатами Codex и сохранены. Всего осталось 16 зарегистрированных worktrees, включая main и текущий чат.
- `git fsck --full` завершился с exit 0, ошибок целостности нет; dangling objects не удалялись. `git bundle verify` подтвердил полный архив истории, hashes всех семи файлов `.state` совпали с копией. Устаревших регистраций в `git worktree prune --dry-run` не осталось.
- Восстановление ветки: `git fetch /Users/ekaterinanecaeva/Documents/GitHub/app-bitrix24-archives/2026-10-11/repository.bundle refs/heads/<branch>:refs/heads/<branch>`. Восстановление рабочей копии: `git worktree add --detach <path> <head>` по manifest, затем перенос нужных локальных файлов из архива. Удаленные branch refs не требуют восстановления для продолжения разработки.

## Следующая задача

Начинать с persistent `task_submissions` и `task_submission_files` по current scope: actor-aware repository, безопасная история, атомарный idempotency/replay, metadata-only files, PostgreSQL/RLS/grants и concurrency coverage. Production `Bitrix24TaskClient` остается disabled; live task creation, binary upload, tags/Scrum и синхронизация статусов относятся к следующему milestone. UI администрирования, cleanup sessions/state и automatic provider refresh требуют отдельного согласованного scope.

Рабочая точка продолжения — текущая ветка с локальными исправлениями. Перенос в main, push или PR требует отдельного явного разрешения владельца.
