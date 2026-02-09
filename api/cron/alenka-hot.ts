import { withCronAuth } from "./_helpers.js"
import { runHot } from "../../src/sources/alenka/pipeline.js"

export default withCronAuth("alenka-hot", () => runHot())
