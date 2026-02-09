# Prompt Selection via Inline Buttons

## Flow

```
Source (📡 Alenka / 📡 TG)
  → Duration (24ч / 3д / 7д)          ← unified, no trends/topics split
    → Inline keyboard:
        [📊 Тренды]  [🏷️ Топики]     ← callback buttons
        или свободный текст           ← кастомный промпт
      → run analysis → session for follow-up
```

## Changes

### keyboard.ts

- `sourceKeyboard()`: merge two duration rows into one (no emoji prefix, just "24ч"/"3д"/"7д"). Show if source has `trends` OR `topics` capability.
- New `promptKeyboard(hasTopics: boolean)`: `InlineKeyboard` with "📊 Тренды" (`prompt:trends`) + conditionally "🏷️ Топики" (`prompt:topics`). Skip Topics button if `hasTopics=false`.
- `ButtonAction`: replace `trends`/`topics` with single `{ type: "analysis"; durationMs: number }`.
- `resolveButton()`: duration buttons resolve to `{ type: "analysis", durationMs }`.
- Remove `DURATION_LABELS` trends/topics split → single label per duration.

### store.ts

- `setPending(chatId, durationMs)` — Redis key `user:{chatId}:pending`, 5min TTL, stores durationMs.
- `getPending(chatId)` → `number | null`
- `clearPending(chatId)`

### bot-commands.ts

- `"analysis"` button handler: save durationMs via `store.setPending()`, check topics, reply with `promptKeyboard(hasTopics)` + hint text "Выберите анализ или введите свой промпт:".
- New `bot.on("callback_query:data")` handler:
  - `prompt:trends` → `getPending()`, run `handleTrends()`, `clearPending()`, answer callback.
  - `prompt:topics` → same but `handleTopics()`.
- Free text handler update: before checking session, check `getPending()`. If pending exists → treat text as custom prompt, wrap as `{text}\n\nДанные:\n\n{data}`, run `handleTrends()` with customPrompt, `clearPending()`.

### pipeline.ts, analyzer.ts

No changes. `runTrends` already supports `customPrompt`, `analyze()` already accepts arbitrary prompt.

### /trends, /topics commands

Keep as-is for CLI convenience.
