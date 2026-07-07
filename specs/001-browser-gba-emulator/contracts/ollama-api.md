# Contract: Local Ollama API (consumed by `src/ai/ollamaClient.ts`)

External interface this feature depends on. Ollama is not built by this feature;
this documents the subset of its existing HTTP API the app calls, and what the
app assumes about the response.

## List available models

`GET http://localhost:11434/api/tags`

Used to populate the AI model selector (FR-009) and to validate a previously
chosen `AIControllerProfile.modelName` is still installed (FR-013).

**Expected response shape** (subset used):
```json
{ "models": [ { "name": "gemma3:vision", "...": "..." } ] }
```
App behavior: model selector only lists entries here; if a stored profile's
`modelName` is absent from this list, surface the "model unavailable" error
(FR-013) instead of attempting to use it.

## Request a decision

`POST http://localhost:11434/api/generate`

**Request body** (fields the app sends):
```json
{
  "model": "gemma3:vision",
  "prompt": "<DECISION_PROMPT, see src/ai/ollamaClient.ts>",
  "images": ["<base64 PNG of current frame>"],
  "options": { "temperature": 0.0 },
  "stream": false
}
```
- `options.temperature` is derived from `AIControllerProfile.styleValue`
  (research.md #3): `temperature = styleValue` (0 = robotic/deterministic, up to
  1 = more human/varied).
- `prompt` (`DECISION_PROMPT` in `ollamaClient.ts`) frames the mission as
  completing the Pokedex. It states up front that the model is stateless (sees
  only the current frame, no memory of earlier ones) and that each reply is
  exactly one button press, then teaches it to classify the screen
  (title/intro / battle / dialogue / naming screen / menu / overworld) and gives
  per-screen playbooks — battle-menu 2x2 grid geometry (FIGHT/BAG/POKEMON/RUN),
  weaken a new wild Pokemon to yellow/red HP then throw a Poke Ball from the
  Bag (never risk fainting an uncaught species; run from already-caught ones),
  win trainer battles on type matchups, advance dialogue with A, accept default
  names via START→OK on the naming screen, and explore toward tall
  grass/caves/water and visible exits while only stepping onto open walkable
  ground — plus a press-A-when-unsure fallback and the button legend. The
  mandated reply format is one short reasoning sentence followed by a final
  line `BUTTON: <name>` with nothing after it.

**Expected response shape** (subset used):
```json
{ "response": "The dialogue box is open, so I will advance it.\nBUTTON: A" }
```
App behavior: `requestNextButton` returns both fields the UI needs — the
`response` text is parsed for a button token (`extractGbaButton` in
`ollamaClient.ts`) AND the full, unmodified `response` text is returned
alongside it as `message`, which the AI control UI displays verbatim so the
user can see the model's reasoning (not just the button it chose).

Button parsing, in order:
1. The labeled `BUTTON: <name>` line the prompt mandates — unambiguous even
   for single-letter buttons, and wins over button names mentioned in the
   reasoning text.
2. Exact (punctuation-stripped, case-insensitive) whole-response match, for
   models that answer with just a bare button word.
3. Whole-word scan for multi-letter button names
   (`UP`/`DOWN`/`LEFT`/`RIGHT`/`START`/`SELECT`) anywhere in the text.
   Single-letter buttons (`A`/`B`/`L`/`R`) are **not** scanned for inside
   prose — they collide with common English words ("press **a** button").

If no button is found, the decision loop treats it as a no-op for that cycle
rather than crashing the session (spec edge case: "AI produces an invalid
action") — the message is still displayed either way.

## Failure handling

- Connection refused / timeout on either call → `GameSession.status = "error"`,
  `errorMessage` set to a user-facing "AI backend unreachable" message (FR-013).
  Autoplay does not silently hang.
- Non-200 response → same error path as above.
