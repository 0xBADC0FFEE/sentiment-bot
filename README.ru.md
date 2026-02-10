# Sentiment Bot

[English version](README.md)

Self-hosted анализатор инвестиционного сентимента — требует личные учётные данные Alenka.Capital и Telegram. Парсит комментарии и мониторит папки Telegram, затем через LLM определяет тренды, анализирует топики и оповещает об отслеживаемых авторах. Анализирует один источник за раз: пользователь выбирает источник → период → тип анализа через интерактивную клавиатуру. Работает как Telegram-бот на Vercel serverless.

## Возможности

- **Тренды** — LLM-анализ настроений рынка с извлечением тикеров
- **Топики** — целевой анализ отслеживаемых тем (напр. "Газпром", "ставка ЦБ")
- **Алерты авторов** — уведомления при появлении комментариев отслеживаемых авторов
- **Горячие комменты** — алерты на комментарии с высоким engagement (15+ лайков)
- **Follow-up чат** — уточняющие вопросы по результатам анализа (сессия 4 часа, хранится в Redis)
- **Кастомные промпты** — `/trends 7d Что с нефтью?` отправляет свой вопрос по данным
- **Мульти-провайдер LLM** — Anthropic, Gemini, Groq, OpenRouter через env `LLM_MODEL`
- **Редактируемые промпты** — системный/тренды/топики промпты в `prompts/*.md`

## Источники данных

| Источник | Что собирает | Возможности |
|----------|-------------|-------------|
| Alenka.Capital | Комментарии к статьям через скрейпинг | тренды, топики, авторы, горячие |
| Telegram | Сообщения из папки через MTProto | тренды, топики |

## [Флоу бота](FLOW.md)

```
    /start
      │
      ▼
┌─ источник ───────────────────────┐
│  [ 📡 Alenka ]  [ 📡 TG ]       │
│  [ ℹ️ Статус ] → инфо            │
└──────────────────┬───────────────┘
                   ▼
┌─ период ─────────────────────────┐
│  [ 24h ]  [ 3d ]  [ 7d ]        │
│  [ ◀️ Назад ] → к источнику      │
└──────────────────┬───────────────┘
                   ▼
┌─ анализ ─────────────────────────┐
│  [ 📊 Тренды ]  [ 🏷️ Топики ]   │
│  ...или свой промпт              │
└──────────────────┬───────────────┘
                   ▼
           Сессия (4ч TTL)
           follow-up → ответ LLM
           [ 🔄 Повторить ] → перезапуск
```

## Быстрый старт

1. **Токен бота** — чат [@BotFather](https://t.me/BotFather), `/newbot`, скопировать токен → `TELEGRAM_BOT_TOKEN`
2. **ID админа** — переслать любое сообщение в [@userinfobot](https://t.me/userinfobot), скопировать ID → `TELEGRAM_ADMIN_ID`
3. **MTProto ключи** — [my.telegram.org](https://my.telegram.org) → API Development Tools → создать приложение → `TG_API_ID` + `TG_API_HASH`
4. **Установка и авторизация:**

```bash
cp .env.example .env
# Заполнить токены из шагов 1-3

npm install
npm run auth          # QR-код (рекомендуется) или телефон+OTP
                      # Скопировать вывод → TG_SESSION в .env
npm run dev:bot       # Локальный polling-режим
```

### Деплой на Vercel

Push в `main` — Vercel деплоит автоматически. Переменные окружения задать в настройках проекта.

Крон-задачи:
- `/api/cron/alenka-trends` — ежедневные тренды
- `/api/cron/telegram-trends` — ежедневные тренды
- `/api/cron/alenka-authors` — каждые 1-2 часа
- `/api/cron/alenka-hot` — каждые 30м-1ч

Бесплатная альтернатива: [cron-job.org](https://cron-job.org) — добавить каждый URL с заголовком `Authorization: Bearer $CRON_SECRET`.

## Переменные окружения

```bash
# Обязательные
TELEGRAM_BOT_TOKEN=         # От @BotFather
TELEGRAM_ADMIN_ID=          # Ваш Telegram user ID
KV_REST_API_URL=            # Upstash Redis URL
KV_REST_API_TOKEN=          # Upstash Redis token

# Источник: Alenka
ALENKA_LOGIN=
ALENKA_PASSWORD=

# Источник: Telegram (MTProto)
TG_API_ID=                  # С my.telegram.org
TG_API_HASH=
TG_SESSION=                 # Сгенерировать: npm run auth

# LLM (по умолчанию: anthropic://claude-haiku-4-5-20251001)
LLM_MODEL=                  # {провайдер}://{модель}
ANTHROPIC_API_KEY=          # Нужен только ключ активного провайдера
GEMINI_API_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=

# Vercel
CRON_SECRET=                # Авторизация крон-эндпоинтов
PROD_WEBHOOK_URL=           # Восстанавливается после dev:bot
```

## Команды бота

| Команда | Описание |
|---------|----------|
| `/start` | Подписаться на алерты |
| `/trends [период] [промпт]` | Анализ трендов (по умолчанию 24ч). Можно задать свой промпт |
| `/topics [период] [топик]` | Анализ по топикам. Можно задать ad-hoc топик |
| `/topic <название>` | Добавить/удалить отслеживаемый топик |
| `/follow <имя>` | Добавить/удалить отслеживаемого автора |
| `/folder <имя>` | Задать папку Telegram для мониторинга |
| `/status` | Статус бота |

После `/trends` или `/topics` можно писать свободным текстом — бот продолжит диалог в том же контексте (сессия 4ч). Кнопка 🔄 под результатом перезапускает анализ. Любая команда или кнопка сбрасывает сессию.

## LLM-провайдеры

| URI | Контекст | Заметки |
|-----|----------|---------|
| `anthropic://claude-haiku-4-5-20251001` | 200k | По умолчанию |
| `gemini://gemini-2.5-flash` | 1M | Есть бесплатный тир |
| `groq://llama-3.3-70b-versatile` | 128k | Быстрый inference |
| `openrouter://deepseek/deepseek-r1-0528:free` | 164k | Бесплатный |

## Структура проекта

```
api/                    Vercel serverless хэндлеры + крон
src/
  bot-commands.ts       Обработчики команд + follow-up роутинг
  analyzer.ts           LLM-анализ (analyze, followUp, formatItems)
  pipeline.ts           Оркестрация (runTrends, runTopics, runAuthors, runHot)
  store.ts              Upstash Redis (подписчики, топики, сессии)
  keyboard.ts           Reply-клавиатура Telegram
  telegram.ts           Утилиты (broadcast, formatAlert)
  config.ts             Конфиг из env + бюджет токенов
  llm/                  Реализации LLM-провайдеров
  sources/
    alenka/             Скрейпер, детекция алертов авторов/горячих
    telegram/           MTProto клиент, чтение папок
prompts/                Редактируемые промпты (system.md, trends.md, topics.md)
scripts/                Утилиты (set-webhook.ts, dump-prompt.ts)
```

## Разработка

```bash
npm run dev:bot      # Бот в polling-режиме (восстанавливает webhook по Ctrl+C)
npm run dev          # Локальный эмулятор Vercel
npm run auth         # Сгенерировать строку сессии Telegram
npm run webhook      # Восстановить webhook URL
npm test             # Запуск тестов
npm run test:watch   # Watch-режим
npm run typecheck    # Проверка типов без компиляции
npm run dump         # Дамп собранного LLM-промпта для отладки
```

## Решение проблем

**Бот не отвечает:** Проверить webhook (`curl https://api.telegram.org/bot$TOKEN/getWebhookInfo`). Если пустой — `npm run webhook`.

**`dev:bot` сбросил webhook:** Нормально — переключается на polling. Ctrl+C восстанавливает. Kill -9 не восстановит — `npm run webhook`.

**Ошибка авторизации Alenka:** Удалить ключ `source:alenka:cookie` в Upstash, перезапустить крон.

**`TG_SESSION` истёк:** `npm run auth`, сканировать QR, обновить `.env`.

## Лицензия

ISC
