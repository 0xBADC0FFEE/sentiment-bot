import { withCronAuth } from "./_helpers.js"
import { runHot } from "../../src/pipeline.js"

export default withCronAuth("alenka-hot", () => runHot({ onLog: console.log }))
