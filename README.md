# BCS Assistant Bot

Telegram-бот для трейдера БКС: дневник сделок, риск-менеджмент, комиссии, MOEX-анализ, AI-разбор и отчеты по портфелю.

> ⚠️ Это не инвестиционная рекомендация. Бот не совершает сделки автоматически. Все торговые решения принимает пользователь.

## Что умеет бот

- Открывает главное меню через `/start`.
- Ведет дневник сделок и открытые позиции в SQLite.
- Считает комиссии БКС для акций, фондов, облигаций, валюты, фьючерсов и опционов.
- Проверяет риск сделки и RR перед сохранением.
- Получает базовые данные по тикеру через MOEX ISS API.
- Делает AI-разбор сделки через OpenAI, если задан `OPENAI_API_KEY`, иначе использует rule-based разбор.
- Формирует дневной и месячный отчеты.
- Позволяет менять депозит, риск, дневную просадку, максимум позиций и тариф комиссии.

## Главное меню

- 📊 Портфель
- 📝 Добавить сделку
- 📈 Анализ инструмента
- 🧠 AI-разбор сделки
- ⚠️ Риск-менеджмент
- 💰 Комиссии БКС
- 📋 Дневник сделок
- 📅 Отчет за день
- 📆 Отчет за месяц
- ⚙️ Настройки

## Переменные окружения

Создайте `.env` на основе `.env.example`:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_ADMIN_ID=
DATABASE_URL=./bcs.db

BROKER=BCS
AUTO_TRADING=false
ALLOW_ORDER_EXECUTION=false
READ_ONLY_MODE=true
EXECUTION_MODE=manual_confirm
MAX_POSITION_PERCENT=5
MAX_DAILY_LOSS_PERCENT=3
ALLOWED_SYMBOLS=Si,BR,GOLD,IMOEX,SBER,GAZP,LKOH
ALLOW_SHORTS=true
EMERGENCY_STOP_ENABLED=true

BCS_API_ENABLED=true
BCS_API_TOKEN=
BCS_ACCOUNT_ID=
BCS_CLIENT_ID=trade-api-read
BCS_API_BASE_URL=https://be.broker.ru

DEFAULT_DEPOSIT_RUB=300000
RISK_PER_TRADE=1
MAX_DAILY_LOSS=3
MAX_OPEN_POSITIONS=3
MIN_SIGNAL_CONFIDENCE=6

MOEX_ENABLED=true
OPENAI_API_KEY=
```

Обязательные переменные для Railway: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_ID`, `DATABASE_URL`.

Переменные предыдущей биржевой версии, live/demo режимы и futures-symbols больше не требуются и не используются.

## Локальный запуск

```bash
npm install
npm run build
npm start
```

Для разработки:

```bash
npm run dev
```

Health-check:

```text
GET /health
```

Ответ содержит `autoTrading: false`, `broker: BCS`, статус MOEX, статус BCS API, read-only mode и версию сборки.

## Подключение БКС API в READ ONLY

1. В веб-версии БКС Мир инвестиций выпустите API-токен только для чтения. По официальной документации БКС access-токен получается из refresh-токена через `client_id=trade-api-read`, а токены только для чтения позволяют получать рыночные данные и портфель без выставления заявок.
2. Добавьте в окружение:
   - `BCS_API_ENABLED=true`
   - `BCS_API_TOKEN=<refresh token>`
   - `BCS_ACCOUNT_ID=<id счета>`
   - `BCS_CLIENT_ID=trade-api-read`
   - `READ_ONLY_MODE=true`
   - `ALLOW_ORDER_EXECUTION=false`
3. При старте бот вызывает `BcsApiClient.connect()`: обновляет access-token из refresh-token, делает read-only `ping()` через портфель, проверяет `BCS_ACCOUNT_ID` и пишет в лог `✅ BCS API connected`, `✅ Account verified`, `✅ Read only mode enabled` либо безопасную ошибку без токена.
4. Бот никогда не выводит и не логирует токен. Методы `placeOrder()`, `cancelOrder()` и `executeOrder()` в READ ONLY режиме выбрасывают `READ ONLY MODE ENABLED`.
5. Если API недоступен, бот не падает: Telegram показывает `⚠️ BCS API временно недоступен. Показываю локальные данные.`, последний sync или локальный дневник.

## Safe execution engine

Execution engine поддерживает режимы `manual_confirm`, `paper`, `semi_auto`, `disabled`. По умолчанию `EXECUTION_MODE=manual_confirm`, но реальные заявки невозможны при `ALLOW_ORDER_EXECUTION=false` и `READ_ONLY_MODE=true`.

Правила безопасности:

- только `LIMIT` orders; market/stop-market заявки запрещены;
- только whitelist `ALLOWED_SYMBOLS`;
- risk gate проверяет сессию, ликвидность, spread, RR, риск, количество открытых позиций, доступность шорта и emergency stop;
- `paper` режим симулирует fill с учетом spread/slippage/commission;
- при попытке реального исполнения в read-only режиме будет ошибка `READ ONLY MODE ENABLED`.

Telegram-меню показывает `🤖 Paper mode`, `⚡ Execution mode`, `⚠️ Risk status`, `🚨 Emergency stop`.

## Portfolio sync

При включенном `BCS_API_ENABLED=true` бот каждые 60 секунд запускает read-only синхронизацию портфеля, позиций и сделок:

- `portfolioSync` сохраняет snapshot портфеля и позиции в SQLite.
- `positionSync` отдельно обновляет реальные позиции для reconciliation.
- `tradeSync` забирает сделки через `/trade-api-bff-trade-details/api/v1/trades/search` и пишет их с deduplication по external id.
- Статус последнего sync показывается в кнопке `🔌 Статус БКС API`.
- Ошибки API логируются без токенов и не останавливают Telegram-бота.

## Деплой на Railway

1. Создайте Railway project из GitHub-репозитория.
2. Добавьте variables:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_ADMIN_ID`
   - `DATABASE_URL` — например `/data/bcs.db` при подключенном volume
   - остальные переменные из `.env.example` при необходимости
3. Build command:
   ```bash
   npm install && npm run build
   ```
4. Start command:
   ```bash
   npm start
   ```
5. Для SQLite на Railway подключите volume и храните `DATABASE_URL` внутри volume.

## Команды Telegram

| Команда | Назначение |
| --- | --- |
| `/start`, `/menu` | Открыть главное меню |
| `/portfolio` | Портфель и открытые позиции |
| `/add_trade` | Добавить сделку через пошаговый сценарий |
| `/analyze SBER` | Получить MOEX-анализ инструмента |
| `/ai_review` | Запустить AI/rule-based разбор сделки |
| `Разбери сделку ...` | Быстрый разбор сделки текстом |
| `/risk` | Настройки риск-менеджмента |
| `/commissions` | Тариф и логика комиссий БКС |
| `/diary` | Дневник сделок |
| `/daily_report` | Отчет за день |
| `/monthly_report` | Отчет за месяц |
| `/settings` | Изменить депозит, риск, просадку, позиции, тариф |
| `/trade 123` | Детали сделки |

## Как добавить сделку

1. Нажмите `📝 Добавить сделку`.
2. Выберите тип инструмента: акция, фьючерс, валюта, облигация или фонд.
3. Введите тикер.
4. Выберите `LONG` или `SHORT`.
5. Введите цену входа, количество, стоп-лосс, тейк-профит и комментарий.
6. Бот покажет сумму позиции, риск, риск %, RR, комиссию БКС и итог: разрешена или запрещена сделка.
7. Нажмите `✅ Сохранить` или `❌ Отмена`.

## MOEX-анализ

Раздел `📈 Анализ инструмента` принимает тикеры, например `SBER`, `GAZP`, `LKOH`, `IMOEX`, `Si`, `BR`, `GOLD`.

Бот возвращает название, последнюю цену, изменение, объем, рынок/режим торгов и простой комментарий. Если MOEX ISS API недоступен, бот покажет понятную ошибку и продолжит работу.

## База данных

SQLite создается по пути `DATABASE_URL`. Основные таблицы:

- `users`
- `settings`
- `instruments`
- `trades`
- `positions`
- `broker_fees`
- `ai_reviews`

## Безопасность

- `AUTO_TRADING=false` по умолчанию.
- `ALLOW_ORDER_EXECUTION=false` и `READ_ONLY_MODE=true` по умолчанию.
- `EXECUTION_MODE=manual_confirm` по умолчанию, но без `ALLOW_ORDER_EXECUTION=true` реальные заявки невозможны.
- В коде нет автоматического выставления заявок, market orders запрещены, а BCS API layer запрещает `placeOrder()`, `cancelOrder()` и `executeOrder()` в READ ONLY режиме.
- Бот не требует и не читает переменные предыдущей биржевой версии.
- В каждом анализе добавляется дисклеймер: «Это не инвестиционная рекомендация».
