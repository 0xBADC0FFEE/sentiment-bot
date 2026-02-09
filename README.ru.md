# Sentiment Bot

[English version](README.md)

Мультиисточниковый анализатор инвестиционного сентимента. Парсит комментарии [Alenka.Capital](https://alenka.capital) и мониторит папки Telegram, затем через LLM определяет тренды, анализирует топики и оповещает об отслеживаемых авторах. Работает как Telegram-бот на Vercel serverless.

## Возможности

- **Тренды** — LLM-анализ настроений рынка с извлечением тикеров
- **Топики** — целевой анализ отслеживаемых тем (напр. "Газпром", "ставка ЦБ")
- **Алерты авторов** — уведомления при появлении комментариев отслеживаемых авторов
- **Горячие комменты** — алерты на комментарии с высоким engagement (15+ лайков)
- **Follow-up чат** — уточняющие вопросы по результатам анализа (сессия 1 час, хранится в Redis)
- **Кастомные промпты** — `/trends 7d Что с нефтью?` отправляет свой вопрос по данным
- **Мульти-провайдер LLM** — Anthropic, Gemini, Groq, OpenRouter через env `LLM_MODEL`
- **Редактируемые промпты** — системный/тренды/топики промпты в `prompts/*.md`

## Источники данных

| Источник | Что собирает | Возможности |
|----------|-------------|-------------|
| Alenka.Capital | Комментарии к статьям через скрейпинг | тренды, топики, авторы, горячие |
| Telegram | Сообщения из папки через MTProto | тренды, топики |

## Быстрый старт

```bash
cp .env.example .env
# Заполнить переменные окружения (см. ниже)

npm install
npm run dev:bot    # Локальный polling-режим
```

### Деплой на Vercel

Push в `main` — Vercel деплоит автоматически. Переменные окружения задать в настройках проекта.

Крон-задачи (в `vercel.json`):
- `/api/cron/alenka-trends` — ежедневные тренды
- `/api/cron/telegram-trends` — ежедневные тренды
- `/api/cron/alenka-authors` — каждые 1-2 часа
- `/api/cron/alenka-hot` — каждые 30м-1ч

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

После `/trends` или `/topics` можно писать свободным текстом — бот продолжит диалог в том же контексте. Любая команда или кнопка сбрасывает сессию.

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
```

## Разработка

```bash
npm run dev:bot      # Бот в polling-режиме (восстанавливает webhook по Ctrl+C)
npm run dev          # Локальный эмулятор Vercel
npm run auth         # Сгенерировать строку сессии Telegram
npm run webhook      # Восстановить webhook URL
npm test             # Запуск тестов
npm run test:watch   # Watch-режим
```

## Решение проблем

**Бот не отвечает:** Проверить webhook (`curl https://api.telegram.org/bot$TOKEN/getWebhookInfo`). Если пустой — `npm run webhook`.

**`dev:bot` сбросил webhook:** Нормально — переключается на polling. Ctrl+C восстанавливает. Kill -9 не восстановит — `npm run webhook`.

**Ошибка авторизации Alenka:** Удалить ключ `source:alenka:cookie` в Upstash, перезапустить крон.

**`TG_SESSION` истёк:** `npm run auth`, сканировать QR, обновить `.env`.

## Лицензия

ISC
