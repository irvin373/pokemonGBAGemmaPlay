import { GBA_BUTTONS, type GbaButton } from '../emulator/types';

const OLLAMA_BASE_URL = 'http://localhost:11434';

const DECISION_PROMPT = `You are playing Pokemon FireRed on a Game Boy Advance. The attached screenshot is
the current screen. You see ONLY this frame — you have no memory of earlier frames —
and your reply presses exactly ONE button (one step of movement or one menu action).
You will see the result in the next screenshot.

Your mission: complete the Pokedex — catch every Pokemon species you have not caught
yet — while exploring the whole world.

First identify the screen type, then act by its rules:

TITLE / INTRO SCREEN (game logo, professor talking, no gameplay): press A to continue.

BATTLE (enemy Pokemon + HP bar at top, yours at bottom, or the FIGHT/BAG/POKEMON/RUN
menu in the lower right): that menu is a 2x2 grid — FIGHT top-left, BAG top-right,
POKEMON bottom-left, RUN bottom-right; move the cursor with the D-pad, confirm with A.
- WILD battle, new/unseen species (top priority — catch it): while its HP bar is
  green, use a weak damaging move; once its HP is yellow/red, STOP attacking — choose
  BAG, open the POKE BALLS pocket, and throw a Poke Ball. If it breaks free, throw
  again. Never use your strongest move on a Pokemon you want to catch — fainting it
  loses it.
- WILD battle, species already caught: fight to win for XP, or choose RUN to save time.
- TRAINER battle (opponent shows a trainer, not a wild Pokemon): you cannot catch
  trainer Pokemon. Pick the move with the best type matchup and fight to win.

DIALOGUE (text box at the bottom): press A to advance. On a YES/NO choice, pick the
option that continues progress (YES for healing, learning moves, or receiving items).

NAMING SCREEN (grid of letters for naming the player, rival, or a Pokemon): press
START to jump the cursor to OK, then A to accept the name.

MENU (list of options with a selection arrow): move the cursor with the D-pad toward
the option serving the current goal, then A. Press B if the menu is not useful right now.

OVERWORLD (the player character standing on a map — explore to find Pokemon):
- Head for TALL GRASS, CAVES, and WATER — wild Pokemon only appear there. Walk around
  inside tall grass to trigger encounters.
- Move toward visible exits: screen edges, doorways, stairs, ladders, cave mouths,
  bridges. New areas mean new species.
- Only move onto open walkable ground — never into walls, fences, trees, ledge edges,
  or water. If the character is boxed in on one side, go another way.
- If the character is standing directly next to an NPC or an item ball, face it and
  press A: NPCs give Poke Balls, items, and hints.
- If your party looks weak or you are out of Poke Balls, head into a town: heal at the
  Pokemon Center and buy Poke Balls at the Mart.

If you cannot tell what screen this is or what to do, press A — it advances dialogue
and interacts with whatever is ahead.

Buttons: UP, DOWN, LEFT, RIGHT (move/cursor), A (confirm/interact/advance), B (cancel/back),
START (main menu), SELECT, L, R.

Reply with exactly ONE short sentence of reasoning, then on the final line exactly:
BUTTON: <name>
where <name> is one of the buttons above. Nothing may follow the BUTTON line.`;

export interface OllamaModel {
  name: string;
}

export class OllamaUnreachableError extends Error {
  constructor(cause?: unknown) {
    super('AI backend unreachable — make sure Ollama is running locally.');
    this.name = 'OllamaUnreachableError';
    this.cause = cause;
  }
}

/** GET /api/tags (contracts/ollama-api.md) — used for model selection and availability checks. */
export async function listOllamaModels(): Promise<OllamaModel[]> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!response.ok) throw new OllamaUnreachableError();
    const data = (await response.json()) as { models: OllamaModel[] };
    return data.models;
  } catch (error) {
    if (error instanceof OllamaUnreachableError) throw error;
    throw new OllamaUnreachableError(error);
  }
}

export interface NextButtonDecision {
  /** Recognized button, or null if the model's response didn't contain one. */
  button: GbaButton | null;
  /** The model's full, unmodified reply text — surfaced to the UI so the user can see its reasoning. */
  message: string;
}

/**
 * POST /api/generate (contracts/ollama-api.md). Returns both the recognized GBA
 * button (or null, edge case: invalid AI action) and the model's full raw reply.
 */
export async function requestNextButton(
  modelName: string,
  frameBase64Png: string,
  temperature: number,
): Promise<NextButtonDecision> {
  let response: Response;
  try {
    response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        prompt: DECISION_PROMPT,
        images: [frameBase64Png],
        options: { temperature },
        stream: false,
      }),
    });
  } catch (error) {
    throw new OllamaUnreachableError(error);
  }

  if (!response.ok) throw new OllamaUnreachableError();

  const data = (await response.json()) as { response: string };
  return { button: extractGbaButton(data.response), message: data.response };
}

// The prompt asks for a labeled "BUTTON: <name>" line — unambiguous even for
// single-letter buttons, so it is checked first.
const LABELED_BUTTON_PATTERN = new RegExp(`BUTTON:\\s*(${GBA_BUTTONS.join('|')})\\b`, 'i');

// Buttons whose names are also common English words (A, B, L, R) are only
// accepted via the labeled line or an exact whole-response match; scanning for
// them inside prose (e.g. "press a button") would produce false positives.
const UNAMBIGUOUS_BUTTONS = GBA_BUTTONS.filter((b) => b.length > 1);
const UNAMBIGUOUS_BUTTON_PATTERN = new RegExp(`\\b(${UNAMBIGUOUS_BUTTONS.join('|')})\\b`, 'i');

/**
 * Pulls the intended button out of the model's reply. The labeled "BUTTON: <name>"
 * line the prompt mandates is tried first; models that ignore the format fall back
 * to an exact single-word match, then to scanning multi-letter button names in
 * prose. Single-letter buttons (A/B/L/R) are never guessed from inside a sentence
 * since they collide with common English words
 * (edge case: AI produces an invalid/wordy action).
 */
function extractGbaButton(responseText: string): GbaButton | null {
  const labeled = LABELED_BUTTON_PATTERN.exec(responseText);
  if (labeled) {
    return labeled[1].toUpperCase() as GbaButton;
  }

  const normalized = responseText.trim().replace(/[.!?"'`]+$/, '').toUpperCase();
  if ((GBA_BUTTONS as readonly string[]).includes(normalized)) {
    return normalized as GbaButton;
  }

  const match = UNAMBIGUOUS_BUTTON_PATTERN.exec(normalized);
  return match ? (match[1] as GbaButton) : null;
}
