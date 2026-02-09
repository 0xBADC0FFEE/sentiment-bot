import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    env: {
      TELEGRAM_BOT_TOKEN: "test:token",
      TG_API_ID: "12345",
      TG_API_HASH: "testhash",
      ALENKA_LOGIN: "test@test.com",
      ALENKA_PASSWORD: "testpass",
      KV_REST_API_URL: "https://test.upstash.io",
      KV_REST_API_TOKEN: "testtoken",
    },
  },
})
