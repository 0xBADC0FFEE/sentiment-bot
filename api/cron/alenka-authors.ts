import { withCronAuth } from "./_helpers.js"
import { runAuthors } from "../../src/sources/alenka/pipeline.js"

export default withCronAuth("alenka-authors", () => runAuthors())
