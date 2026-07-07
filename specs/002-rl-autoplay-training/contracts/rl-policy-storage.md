# Contract: RL Policy Storage (`src/storage/rlPolicies.ts`)

Mirrors the existing `src/storage/saveStates.ts` CRUD contract (feature 001),
adapted for a two-namespace persistence scheme (research.md #6).

```ts
interface RLPolicyMeta {
  id: string;
  romChecksum: string;
  label: string;
  createdAt: string;
  updatedAt: string;
  episodesTrained: number;
  totalSteps: number;
}

function saveRLPolicy(
  model: tf.LayersModel,
  romChecksum: string,
  label: string,
  trainingSnapshot: { episodesTrained: number; totalSteps: number },
  existingId?: string, // pass to update-in-place (re-save after more training)
): Promise<RLPolicyMeta>;

function loadRLPolicyModel(id: string): Promise<tf.LayersModel>;

function listAllRLPolicies(): Promise<RLPolicyMeta[]>;

function listRLPoliciesForRom(romChecksum: string): Promise<RLPolicyMeta[]>;

function deleteRLPolicy(id: string): Promise<void>;
```

**Contract rules**:
- `saveRLPolicy` MUST write model weights via TF.js's own persistence path —
  `model.save('indexeddb://rl-policy-model/' + id)` — and MUST write
  `RLPolicyMeta` via the app's existing `idb-keyval` store, using the same
  `id` to join the two records. Never hand-serialize model weights directly
  into `idb-keyval`.
- Without `existingId`, `saveRLPolicy` generates a new uuid, sets
  `createdAt === updatedAt` to the current time. With `existingId`, it
  overwrites the existing TF.js model at the same `indexeddb://` path and
  updates only `updatedAt`/`episodesTrained`/`totalSteps` in the metadata
  (label and `createdAt` are preserved unless the caller explicitly changes
  them).
- `loadRLPolicyModel` MUST throw/reject with a user-facing message (routed
  through the same `onError`/`reportError` channel used elsewhere) if the
  TF.js model artifacts are missing for a given `id` even though metadata
  exists — this is the "orphaned metadata" failure mode and must not be
  silently swallowed.
- `deleteRLPolicy` MUST perform both deletions — the `idb-keyval` metadata key
  AND `tf.io.removeModel('indexeddb://rl-policy-model/' + id)` — and should
  attempt both even if one fails, to avoid leaving orphaned state either
  direction (orphaned weights with no metadata, or metadata pointing at
  deleted weights).
- `listAllRLPolicies`/`listRLPoliciesForRom` follow the identical list/sort
  convention as `listAllSaveStates`/`listSaveStatesForRom` (feature 001):
  sorted most-recent-first by `updatedAt`.
- Loading a policy (for inference or to resume training) whose `romChecksum`
  differs from the active `GameSession.romChecksum` MUST surface the same
  mismatch-warning UX `LoadStatePanel` already implements for game save
  states (FR-012) — implemented at the calling UI layer
  (`RLTrainingPanel`), not inside this storage module.
- Storage-quota errors from `model.save()` MUST propagate as rejected
  promises with a message suitable for direct display (routed through
  `session.reportError`), not swallowed.
