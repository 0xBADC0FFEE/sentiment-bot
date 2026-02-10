# Prompt Templates

Structured prompts following [Anthropic prompt structure](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/extended-thinking-tips#prompt-structure) — section ordering and completeness matter more than mechanical XML wrapping.

## Sections

| # | Tag | Purpose | When to use |
|---|-----|---------|-------------|
| 1 | — | Role/context | System message |
| 2 | — | Tone | System message |
| 4 | `<task>` | Instructions | User message |
| 5 | `<examples>` | Expected output samples | User message |
| 7 | `<data>`, `<topics>` | Runtime data (placeholders) | User message, XML = injection defense |
| 9 | `<output_format>` | Response format | User message |

Sections 3 (background), 6 (history), 8 (metacognition), 10 (prefill) not used.

XML tags used in user messages to separate instructions from user-provided data. System message uses plain text (no user data → no injection risk).

## Files

| File | Sections | Role |
|------|----------|------|
| `system.md` | 1, 2, 9 | System message — role, tone, format. Plain text. |
| `trends.md` | 4, 5, 7, 9 | User message — market trend analysis |
| `topics.md` | 4, 5, 7, 9 | User message — topic-based analysis |

## Examples

`<examples>` must use abstract placeholders (TOPIC_A, Компания_1, ТИКЕР), never concrete names — model anchors on example names and returns them instead of actual data.

## Placeholders

- `{data}` — replaced with formatted messages at runtime (inside `<data>`)
- `{topics}` — replaced with tracked topic list (inside `<topics>`)

## Custom prompts

When user provides custom prompt via `/trends <prompt>`, pipeline wraps it:
```
<task>{customPrompt}</task>
<data>{data}</data>
```
