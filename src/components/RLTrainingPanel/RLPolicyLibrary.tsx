import { useEffect, useState } from 'react';
import { listAllRLPolicies, type RLPolicyMeta } from '../../storage/rlPolicies';

interface RLPolicyLibraryProps {
  romChecksum: string;
  refreshKey: number;
  onRunAsController: (policyId: string) => void;
  onResumeTraining: (policyId: string) => void;
}

type PendingAction = { policy: RLPolicyMeta; action: 'infer' | 'train' };

/** Saved-policy list with "Run as Controller"/"Resume Training" actions and a
 *  ROM-mismatch warning mirroring LoadStatePanel (FR-012, US2). */
export function RLPolicyLibrary({
  romChecksum,
  refreshKey,
  onRunAsController,
  onResumeTraining,
}: RLPolicyLibraryProps) {
  const [policies, setPolicies] = useState<RLPolicyMeta[]>([]);
  const [pending, setPending] = useState<PendingAction | null>(null);

  useEffect(() => {
    listAllRLPolicies().then(setPolicies);
  }, [refreshKey]);

  const apply = (action: PendingAction) => {
    if (action.action === 'infer') onRunAsController(action.policy.id);
    else onResumeTraining(action.policy.id);
  };

  const handleAction = (policy: RLPolicyMeta, action: 'infer' | 'train') => {
    if (policy.romChecksum !== romChecksum) {
      setPending({ policy, action });
      return;
    }
    apply({ policy, action });
  };

  return (
    <div data-testid="rl-policy-library">
      <ul>
        {policies.map((policy) => (
          <li key={policy.id}>
            {policy.label} ({policy.episodesTrained} episodes,{' '}
            {new Date(policy.updatedAt).toLocaleString()})
            <button type="button" onClick={() => handleAction(policy, 'infer')}>
              Run as Controller
            </button>
            <button type="button" onClick={() => handleAction(policy, 'train')}>
              Resume Training
            </button>
          </li>
        ))}
      </ul>
      {pending && (
        <div role="alertdialog" data-testid="rl-policy-mismatch-warning">
          <p>
            "{pending.policy.label}" was trained on a different ROM than the one currently
            loaded. Using it may not work correctly. Continue anyway?
          </p>
          <button
            type="button"
            onClick={() => {
              apply(pending);
              setPending(null);
            }}
          >
            Continue anyway
          </button>
          <button type="button" onClick={() => setPending(null)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
