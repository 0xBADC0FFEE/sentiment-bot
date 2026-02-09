import { withCronAuth } from "./_helpers.js"
import { runTrends } from "../../src/pipeline.js"
import { ONE_DAY_MS } from "../../src/config.js"

export default withCronAuth("alenka-trends", () =>
  runTrends("alenka", { since: new Date(Date.now() - ONE_DAY_MS), onLog: console.log }),
)
