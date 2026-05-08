import { withCronAuth } from "./_helpers.js"
import { runTelegramAuthors } from "../../src/sources/telegram/pipeline.js"

export default withCronAuth("telegram-authors", () => runTelegramAuthors())
