# OAuth и portal identity: локальный spike harness

Этот временный harness подготавливает будущую test campaign Bitrix24 OAuth для отдельного PWA. Он доступен только в development/test, не подключен к production application flow и не означает, что OAuth PWA или portal identity spikes завершены.

Live campaign выполняется только после отдельного подтверждения пользователя и предоставления непроизводственного портала, local application, синтетических пользователей и временного HTTPS origin. До этого момента реальные Bitrix24-вызовы запрещены.

## Границы

- Harness включается только server-only флагом `BITRIX24_OAUTH_SPIKE_ENABLED=true`.
- В production все три route handler возвращают `404`, даже если флаг установлен.
- `BITRIX24_MODE` не включает harness и не меняется им.
- `Bitrix24TaskClient` остается mock в development/test и disabled в production.
- Profiles, app sessions, Supabase, migrations и постоянное хранение credentials отсутствуют.
- Initial и rotated access/refresh token pairs существуют только внутри одного callback request, после проверки отбрасываются и не передаются браузеру.
- Installer tokens не считаются user identity, не создают session, не сохраняются, не логируются и не передаются дальше после разбора installation callback.

## Маршруты

- `GET /api/bitrix24/oauth/start` — создает одноразовый state и перенаправляет на один настроенный portal.
- `GET /api/bitrix24/oauth/callback` — consumes state, проверяет initial exchange, немедленно выполняет refresh rotation, повторно проверяет portal identity и token metadata, затем проверяет active employee только через rotated access token.
- `POST /api/bitrix24/oauth/install` — явно разбирает bracket-keys фактического `ONAPPINSTALL` form payload, выводит только sanitized `member_id` и canonical portal origin и возвращает общий success.

Start route игнорирует portal/domain из query, body, headers и cookies. Portal origin, token endpoint и callback берутся только из server configuration.

## Ephemeral state

State создается криптографически случайным, а в памяти хранится только SHA-256 hash. TTL составляет пять минут; consume атомарный, повторное использование запрещено. При коллизии с active или consumed hash генерация повторяется ограниченное число раз и завершается безопасной ошибкой, если уникальный state получить не удалось.

Это допустимое только для локального single-process spike хранилище. Оно не является реализацией будущей таблицы `oauth_transactions`, app session или production state storage. Hot reload и перезапуск dev server инвалидируют выданные state; callback в таком случае возвращает безопасный `invalid_state`.

## Конфигурация

Для запуска install/bootstrap route достаточно development/test runtime и `BITRIX24_OAUTH_SPIKE_ENABLED=true`. Client ID, client secret и expected member ID на этом этапе еще могут быть неизвестны. Полная конфигурация ниже обязательна только для start/callback. Скопируйте placeholders из `.env.example` в игнорируемый `.env.local`. Ни одно имя не должно иметь префикс `NEXT_PUBLIC_`.

```dotenv
BITRIX24_OAUTH_SPIKE_ENABLED=true
BITRIX24_OAUTH_SPIKE_APP_ORIGIN=https://temporary-harness.example
BITRIX24_OAUTH_SPIKE_PORTAL_ORIGIN=https://test-portal.example
BITRIX24_OAUTH_SPIKE_EXPECTED_MEMBER_ID=00000000000000000000000000000000
BITRIX24_OAUTH_SPIKE_CLIENT_ID=local.placeholder
BITRIX24_OAUTH_SPIKE_CLIENT_SECRET=local-secret-placeholder
BITRIX24_OAUTH_SPIKE_REDIRECT_URI=https://temporary-harness.example/api/bitrix24/oauth/callback
BITRIX24_OAUTH_SPIKE_SCOPES=user_brief
BITRIX24_OAUTH_SPIKE_TOKEN_ENDPOINT=https://oauth.bitrix.info/oauth/token/
```

Должен быть выбран ровно один user scope: `user_brief`, `user_basic` или `user`. Дополнительно можно указать `basic`, если он нужен отдельному системному методу. Несколько user scopes одновременно, дубли, `task`, `tasks`, `crm`, webhook и любые неизвестные scopes отклоняются. Token endpoint фиксирован на `https://oauth.bitrix.info/oauth/token/`. Redirect URI обязан принадлежать configured app origin и указывать на callback route.

`user_brief` — первая проверяемая гипотеза, а не подтвержденный достаточный production scope. План live campaign:

1. Сначала проверить admission с `user_brief`.
2. Если Bitrix24 не возвращает `USER_TYPE`, зафиксировать это как результат spike; пользователь не считается employee, admission остается закрытым.
3. Повторить admission-проверку с `user`.
4. Определить окончательный минимальный production scope только после этой campaign и отдельного employee-directory spike.

Обычный user OAuth требует явного `BITRIX24_OAUTH_SPIKE_EXPECTED_MEMBER_ID`. Первое увиденное значение не становится доверенным автоматически.

## Canonical portal origin

Token-response `domain` не считается portal domain. Harness использует только `client_endpoint`, который должен:

- быть валидным HTTPS URL;
- не содержать username, password, query или fragment;
- иметь точный REST path `/rest/`.

После проверки canonical portal origin равен `URL.origin`. Exchange и refresh возвращают `member_id` и `client_endpoint`, поэтому одна и та же проверка применяется к обеим операциям. Initial result также должен иметь непустой нормализованный scope set и корректную expiry metadata.

Refresh выполняется немедленно в том же callback request. Его `member_id`, canonical portal origin, нормализованный scope set, expiry metadata и доступный provider user ID сверяются с initial exchange до вызова user API. Для `getCurrentUser` используются только rotated access token и refreshed `client_endpoint`. При drift обе token pair отбрасываются без admission, profile, session или credentials.

Token-response scopes нормализуются как set без дублей, initial и refresh set должны совпасть. Точная семантика возвращаемого Bitrix24 поля `scope` пока не подтверждена и остается предметом live campaign; harness намеренно не требует его точного совпадения с env configuration.

## Подготовка local application

До сохранения API-only local application должен быть запущен и доступен по HTTPS route `/api/bitrix24/oauth/install`. Bitrix24 может вызвать его сразу и передать installer access/refresh tokens.

Installation callback не использует эти tokens как вход пользователя, не сохраняет их на диск, не передает дальше, не логирует и не возвращает в response. Harness не заявляет гарантированное стирание строк из памяти: значения только кратковременно читаются для проверки обязательной формы payload, после чего ссылки на них не удерживаются. В локальный output попадают только sanitized `member_id` и canonical portal origin. User OAuth всегда выполняется отдельно через start/callback.

## Безопасные результаты

Browser получает только `success/error`, совпадение member ID, canonical portal origin, admission status, `refreshVerified: true` при полном успехе и безопасный reason code. Scopes, expiry, access token, refresh token, authorization code, client secret, Bitrix user ID, provider payload и stack trace в response не выводятся. Sanitized server log может содержать только нормализованные названия scopes без token metadata.

Live OAuth campaign не запускается автоматически после настройки environment. Для нее требуется отдельное подтверждение.
