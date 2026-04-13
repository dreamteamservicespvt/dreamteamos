import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/services/firebase";
import { format, subDays } from "date-fns";
import type { SchedulePool } from "@/types";

/**
 * Process all active schedule pools for a given admin.
 * For each pool, check if:
 * 1. It hasn't been released today yet
 * 2. The assigned member meets the min completion % from yesterday
 * 3. There are remaining numbers to release
 * 
 * If all conditions are met, release the next batch of numbers as leads.
 * Returns a summary of what was released.
 */
export async function processScheduledPools(adminUid: string): Promise<{ released: number; blocked: number; done: number }> {
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const yesterdayStr = format(subDays(new Date(), 1), "yyyy-MM-dd");

  // Get all schedule pools for this admin
  const poolsSnap = await getDocs(collection(db, "schedulePools"));
  const activePools = poolsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() } as SchedulePool))
    .filter((p) => p.createdBy === adminUid && p.isActive);

  // Get all leads (for completion check)
  const leadsSnap = await getDocs(collection(db, "leads"));
  const allLeads = leadsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

  let released = 0;
  let blocked = 0;
  let done = 0;

  for (const pool of activePools) {
    // Skip if already released today
    if (pool.lastReleasedDate === todayStr) continue;

    const remaining = pool.numbers.length - pool.releasedCount;
    if (remaining <= 0) {
      done++;
      continue;
    }

    const memberId = pool.assignedTo;
    const memberLeads = allLeads.filter((l: any) => l.assignedTo === memberId);

    // Check yesterday's completion
    const yesterdayLeads = memberLeads.filter((l: any) => {
      const ts = l.createdAt?.seconds;
      if (!ts) return false;
      return format(new Date(ts * 1000), "yyyy-MM-dd") === yesterdayStr;
    });

    if (yesterdayLeads.length > 0) {
      const calledYesterday = yesterdayLeads.filter((l: any) => l.status !== "not_called").length;
      const completionPct = Math.round((calledYesterday / yesterdayLeads.length) * 100);
      if (completionPct < pool.minCompletionPercent) {
        blocked++;
        continue;
      }
    }

    // Release the next batch
    const batchSize = Math.min(pool.dailyLimit, remaining);
    const nextNumbers = pool.numbers.slice(pool.releasedCount, pool.releasedCount + batchSize);
    const existingCount = memberLeads.length;

    for (let i = 0; i < nextNumbers.length; i++) {
      await addDoc(collection(db, "leads"), {
        assignedTo: memberId,
        assignedBy: adminUid,
        phone: nextNumbers[i],
        displayName: `C${existingCount + i + 1}`,
        status: "not_called",
        notes: "",
        saleDone: false,
        lastUpdated: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
    }

    await updateDoc(doc(db, "schedulePools", pool.id), {
      releasedCount: pool.releasedCount + batchSize,
      lastReleasedAt: serverTimestamp(),
      lastReleasedDate: todayStr,
    });

    released += batchSize;
  }

  return { released, blocked, done };
}
