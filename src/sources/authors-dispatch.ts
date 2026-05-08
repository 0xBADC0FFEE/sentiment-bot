import type { Store } from "../store.js"
import { Api } from "grammy"
import { runAuthors as defaultRunAuthors } from "./alenka/pipeline.js"
import { runTelegramAuthors as defaultRunTelegram } from "./telegram/pipeline.js"

export type AuthorsSource = "alenka" | "telegram"

export interface AuthorsDispatchOpts {
  store?: Store
  api?: Api
  maxAlerts?: number
}

export interface AuthorsDispatchResult {
  alerts: number
  comments?: number
}

export interface DispatchDeps {
  runAlenka?: (opts: AuthorsDispatchOpts) => Promise<{ comments: number; alerts: number }>
  runTelegram?: (opts: AuthorsDispatchOpts) => Promise<{ alerts: number }>
}

export async function runAuthorsForSource(
  source: AuthorsSource,
  opts: AuthorsDispatchOpts,
  deps: DispatchDeps = {},
): Promise<AuthorsDispatchResult> {
  const runAlenka = deps.runAlenka ?? defaultRunAuthors
  const runTelegram = deps.runTelegram ?? defaultRunTelegram
  if (source === "telegram") {
    const r = await runTelegram(opts)
    return { alerts: r.alerts }
  }
  const r = await runAlenka(opts)
  return { alerts: r.alerts, comments: r.comments }
}
