import { withCronAuth } from "./_helpers.js"
import { runAuthors } from "../../src/pipeline.js"

export default withCronAuth("alenka-authors", () => runAuthors())
