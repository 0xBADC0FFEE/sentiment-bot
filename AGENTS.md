# Writing and Refactoring Code

Always use the `clean-code` skill when writing or refactoring code.
Always use the `conventional-commit` skill when committing.

## Deployment

Push to `main` → Vercel auto-deploys.

## Troubleshooting

**Bot не отвечает на команды:**
1. Check webhook: `curl https://api.telegram.org/bot$TOKEN/getWebhookInfo`
2. If `url` empty → webhook was cleared. Likely cause: `npm run dev:bot` calls `bot.start()` which deletes webhook for polling mode.
3. Fix: `curl "https://api.telegram.org/bot$TOKEN/setWebhook?url=$PROD_WEBHOOK_URL"`
4. `dev.ts` has auto-restore on Ctrl+C, but force-kill (kill -9) will skip it.
