/**
 * Which fields of each record are signed (HMAC — core/crypto.ts), so a record edited outside the server is detectable
 * (FR-060, NFR-013: "audit records cannot be silently edited by ordinary application users").
 */
import { sign, verify, type DevSecrets } from "../core/crypto.js";
import { DIMENSION_IDS } from "../core/dimensions.js";
import type { AuditEvent, DevAttempt, DevCorrection, DevProfile, RankEvent, XpTransaction } from "../core/types.js";

export type Signed = "xp" | "attempt" | "rank" | "profile" | "audit" | "correction";

export function signedFields(kind: Signed, r: Record<string, unknown>): unknown {
  switch (kind) {
    case "xp": {
      const x = r as unknown as XpTransaction;
      return { id: x.id, uid: x.uid, amount: x.amount, sourceId: x.sourceId, ruleVersion: x.ruleVersion, recordedAt: x.recordedAt };
    }
    case "attempt": {
      const a = r as unknown as DevAttempt;
      return { id: a.id, uid: a.uid, qid: a.qid, response: a.response, score: a.scoring?.score ?? null, outcome: a.outcome, submittedAt: a.submittedAt };
    }
    case "rank": {
      const e = r as unknown as RankEvent;
      return { id: e.id, uid: e.uid, oldRank: e.oldRank, newRank: e.newRank, policyVersion: e.policyVersion, effectiveAt: e.effectiveAt, evidenceIds: e.evidenceIds };
    }
    case "profile": {
      const p = r as unknown as DevProfile;
      return {
        uid: p.uid, rank: p.rank?.level, xp: p.xp?.total, valid: p.gates?.validAttempts, track: p.track,
        dims: Object.fromEntries(DIMENSION_IDS.map((d) => [d, p.dims?.[d]?.score ?? null])),
      };
    }
    case "audit": {
      const a = r as unknown as AuditEvent;
      return { id: a.id, actor: a.actor, action: a.action, target: a.target, at: a.at };
    }
    case "correction": {
      const c = r as unknown as DevCorrection;
      return { id: c.id, attemptId: c.attemptId, after: c.after, at: c.at, by: c.by };
    }
  }
}

export async function signRecord<T extends object>(secrets: DevSecrets, kind: Signed, rec: T): Promise<T & { sig: string }> {
  return { ...rec, sig: await sign(secrets, signedFields(kind, rec as Record<string, unknown>)) };
}

export async function checkRecord(secrets: DevSecrets, kind: Signed, rec: Record<string, unknown> & { sig?: string }): Promise<"ok" | "tampered" | "unknown"> {
  return verify(secrets, signedFields(kind, rec), rec.sig);
}
