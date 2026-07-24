import { AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import type { WorkAssignment } from '@/types';

/**
 * "The sale behind this work was deleted."
 *
 * A sales member can delete a sale after the work has already gone out to a member. The work is
 * deliberately left in place rather than vanishing mid-build — but whoever is holding it has to
 * be told, loudly, that it is no longer wanted.
 */
export default function SaleDeletedBanner({ assignment }: { assignment: WorkAssignment }) {
  if (!assignment.saleDeleted) return null;
  const at = (assignment.saleDeletedAt as { seconds?: number } | undefined)?.seconds;
  return (
    <div className="mt-2 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        <b>Sale deleted{assignment.saleDeletedByName ? ` by ${assignment.saleDeletedByName}` : ''}</b>
        {at ? ` on ${format(new Date(at * 1000), 'dd MMM yyyy, hh:mm a')}` : ''}
        {' '}— this ad is no longer needed. Stop work and check with your admin before continuing.
      </span>
    </div>
  );
}
