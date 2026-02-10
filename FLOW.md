# Bot Flow

## Usage

`/start` shows the source keyboard. The interactive flow:

```
    /start
      │
      ▼
┌─ source ─────────────────────────┐
│  [ 📡 Alenka ]  [ 📡 TG ]       │
│  [ ℹ️ Статус ] → status info     │
└──────────────────┬───────────────┘
                   ▼
┌─ duration ───────────────────────┐
│  [ 24h ]  [ 3d ]  [ 7d ]        │
│  [ ◀️ Назад ] → back to source   │
└──────────────────┬───────────────┘
                   ▼
┌─ analysis ───────────────────────┐
│  [ 📊 Тренды ]  [ 🏷️ Топики ]   │
│  ...or type a custom prompt      │
└──────────────────┬───────────────┘
                   ▼
           Session (4h TTL)
           follow-up → LLM reply
```

| Button | Action |
|--------|--------|
| 📡 Alenka / 📡 TG | Set source → show duration keyboard |
| 24h / 3d / 7d | Set duration → show analysis picker (inline) |
| ✍️ Авторы | Run author tracking pipeline (admin) |
| 🔥 Горячие | Run hot comments pipeline (admin) |
| ℹ️ Статус | Show status |
| ◀️ Назад | Back to source selection |

**State machine:**

```
[no context] ──/start──▶ [source keyboard]
                              │
                         source btn
                              ↓
                        [duration keyboard]
                              │
                         duration btn
                              ↓
                        [pending] (5min TTL)
                         │          │
                    inline btn   free text
                         │          │
                         ↓          ↓
                   [session active] (4h TTL)
                         │
                    free text → follow-up
                         │
         any /cmd ───────┘ (clears session)
```

---

## Commands

### `/start` (any user)
Subscribe to alerts. Shows source keyboard.

### `/folder <name>` (admin)
Set/view TG folder to monitor.
- No arg → show current
- With arg → set folder

### `/topic <name>` (admin, toggle)
Add/remove tracked topic for `/topics` analysis.
- No arg → list all
- With arg → toggle on/off

### `/follow <name>` (admin, toggle)
Add/remove tracked author for comment alerts.
- No arg → list all
- With arg → toggle on/off

### `/status` (admin)
Show runtime, LLM provider, sources, folder, topics/authors/subscribers count.

### `/trends [24h|3d|7d] [prompt]` (admin)
Run trend analysis. Optional duration (default 24h) and custom prompt.
Creates session for follow-up questions.

### `/topics [24h|3d|7d] [topic]` (admin)
Run topic analysis. Optional duration and ad-hoc topic.
Creates session for follow-up questions.

---

## Cron Jobs

All require `Authorization: Bearer $CRON_SECRET`.

| Endpoint | Schedule | Action | Alert |
|----------|----------|--------|-------|
| `/api/cron/alenka-trends` | Daily | Trend analysis (alenka, 24h) | 📊 to all subs |
| `/api/cron/telegram-trends` | Daily | Trend analysis (telegram, 24h) | 📊 to all subs |
| `/api/cron/alenka-authors` | 1-2h | Scrape new comments, match tracked authors | ✍️ per comment |
| `/api/cron/alenka-hot` | 30m-1h | Scrape comments with 15+ likes | 🔥 per comment |

---

## Alert Formats

### ✍️ Author Alert
```
✍️ {author}
↩️ {reply context}  (if reply)
📅 {date} | 👍 {likes}
{text, truncated 200ch}
🔗 {article link}
[images if any]
```

### 🔥 Hot Comment Alert
Same format, deduplicated via `hot:seen:{id}` (3d TTL).

### 📊 Trends / 🏷️ Topics Alert
```
📊 {date range} | {count} сообщений
{LLM-generated summary}
```

---

## Broadcast

- 1 image → `sendPhoto` with caption
- N images → `sendMediaGroup`, first captioned
- Text only → `sendMessage`, auto-split at 4096 chars
- Errors logged, doesn't block other subscribers

---

## Redis Keys

| Key | Type | TTL | Purpose |
|-----|------|-----|---------|
| `subscribers` | set | — | Subscribed chat IDs |
| `user:{id}:source` | string | — | Selected source |
| `user:{id}:pending` | number | 5min | Pending analysis duration |
| `chat:session:{id}` | JSON | 4h | LLM conversation context |
| `topics:tracked` | set | — | Tracked topics |
| `authors:tracked` | set | — | Tracked authors |
| `hot:seen:{commentId}` | flag | 3d | Dedup hot comments |
| `source:telegram:folder` | string | — | Monitored TG folder |
| `source:alenka:cookie` | string | 24h | Auth cookie |
| `source:alenka:authors:lastId` | string | — | Last processed comment |

---

## Webhook

`POST /api/bot` — Telegram webhook. Always 200 OK, processes async via `waitUntil`.
