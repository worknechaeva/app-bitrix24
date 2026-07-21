# Task Launcher development guide

## Обязательный контекст

Перед любой задачей полностью прочитать:

1. [docs/README.md](./docs/README.md);
2. [docs/product/current-scope.md](./docs/product/current-scope.md);
3. [docs/product/decisions.md](./docs/product/decisions.md);
4. [docs/architecture.md](./docs/architecture.md);
5. [docs/roadmap.md](./docs/roadmap.md);
6. все открытые записи [docs/qa/findings.md](./docs/qa/findings.md).

Приоритет внутренних источников требований:

1. последний явный запрос пользователя;
2. `docs/product/current-scope.md`;
3. решения со статусом `Active` в `docs/product/decisions.md`;
4. `docs/architecture.md`;
5. `docs/roadmap.md`;
6. исторические и закрытые QA-записи.

Решения со статусом `Superseded` не действуют.

## Правила изменений

- Не возвращать удаленные поля или функции без нового явного решения пользователя.
- При изменении поведения приложения обязательно:
  - обновить `docs/product/current-scope.md`;
  - добавить или изменить решение в `docs/product/decisions.md`, если меняется продуктовое решение;
  - обновить статус связанной записи `docs/qa/findings.md`;
  - добавить регрессионный тест;
  - обновить `docs/roadmap.md`, если меняются границы milestone.
- Перед завершением задачи проверить соответствие документации коду.
- Следовать техническим границам из [docs/architecture.md](./docs/architecture.md).
- Пользовательские тексты писать на русском языке с буквой `е` вместо `ё`.
- Не хранить секреты в документации, Git, fixtures, frontend bundle, логах и пользовательских ошибках.
- Не изменять и не переписывать старые коммиты.
- Не выполнять push, создание PR или merge без явного разрешения пользователя.

## Проверки

Перед передачей изменений выполнить применимые проверки:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```
