/**
 * What someone sees when they scan the QR on an ID card.
 *
 * A printed badge proves nothing by itself — the scan is what turns it into a credential, so this
 * page has one job: say plainly whether this person works here, today. It is public and account-free
 * for the same reason the client chat is: the people who check a badge are outside the company.
 *
 * It shows only what is already printed on the card that was handed over — name, employee number,
 * designation, department, joining date, photo. Nothing about pay, nothing about documents, no
 * address, no personal phone number. The card is the disclosure; this only confirms it.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { BadgeCheck, Loader2, ShieldAlert, ShieldX } from "lucide-react";
import { db } from "@/services/firebase";
import { COMPANY } from "@/utils/company";
import { prettyDate, provisionalEmployeeId } from "@/utils/idCard";
import { getRoleLabel } from "@/utils/roleHelpers";
import MemberAvatar from "@/components/MemberAvatar";

type Status = "loading" | "employed" | "left" | "unknown";

interface Verified {
  name: string;
  employeeId: string;
  designation: string;
  department: string;
  photoUrl: string | null;
  joinedOn: string | null;
  leftOn: string | null;
}

const DEPARTMENTS: Record<string, string> = { tech: "Technology", sales: "Sales" };

export default function VerifyEmployee() {
  const { uid = "" } = useParams();
  const [status, setStatus] = useState<Status>("loading");
  const [person, setPerson] = useState<Verified | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // The user record answers "is this person still with us"; the HR record adds the formal
        // photograph and joining date. A member with no HR record still verifies.
        const [userSnap, profileSnap] = await Promise.all([
          getDoc(doc(db, "users", uid)),
          getDoc(doc(db, "employee_profiles", uid)).catch(() => null),
        ]);
        if (!alive) return;

        if (!userSnap.exists()) { setStatus("unknown"); return; }
        const u = userSnap.data() as Record<string, unknown>;
        const p = (profileSnap?.exists() ? profileSnap.data() : {}) as Record<string, unknown>;

        const separation = p.separation as { lastWorkingDay?: string } | undefined;
        const active = u.isActive !== false && p.stage !== "exited";

        setPerson({
          name: String(u.name || "").trim() || "—",
          employeeId: String(u.employeeId || "").trim() || provisionalEmployeeId(uid),
          designation: String(p.designation || "").trim() || getRoleLabel(String(u.role || "") as never),
          department: DEPARTMENTS[String(p.department || "")]
            || (String(u.role || "").startsWith("sales") ? "Sales" : "Technology"),
          photoUrl: (p.photoUrl as string) || (u.avatar as string) || null,
          joinedOn: prettyDate(p.joiningDate as string),
          leftOn: prettyDate(separation?.lastWorkingDay),
        });
        setStatus(active ? "employed" : "left");
      } catch {
        if (alive) setStatus("unknown");
      }
    })();
    return () => { alive = false; };
  }, [uid]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-sm" data-test="verify-employee">
        {status === "loading" && (
          <div className="flex flex-col items-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">Checking this ID card…</p>
          </div>
        )}

        {status === "unknown" && (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <ShieldX className="mx-auto mb-3 h-10 w-10 text-destructive" />
            <p className="text-base font-semibold text-foreground">This card could not be verified</p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              No employee record matches it. If someone presented this card, treat it as unverified
              and contact {COMPANY.name}.
            </p>
          </div>
        )}

        {(status === "employed" || status === "left") && person && (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            {/* The verdict first, in the colour that says it before any of the words are read. */}
            <div
              className={`flex items-center gap-2.5 px-5 py-3.5 ${
                status === "employed" ? "bg-emerald-600" : "bg-amber-600"
              }`}
              data-test="verify-verdict"
            >
              {status === "employed"
                ? <BadgeCheck className="h-5 w-5 shrink-0 text-white" />
                : <ShieldAlert className="h-5 w-5 shrink-0 text-white" />}
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">
                  {status === "employed" ? "Verified employee" : "No longer employed"}
                </p>
                <p className="text-[11px] text-white/80">
                  {status === "employed"
                    ? `Currently employed at ${COMPANY.name}`
                    : person.leftOn
                      ? `Left on ${person.leftOn} — this card is no longer valid`
                      : "This card is no longer valid"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 border-b border-border px-5 py-5">
              <MemberAvatar name={person.name} avatar={person.photoUrl} size={72} viewable />
              <div className="min-w-0">
                <p className="truncate text-lg font-bold text-foreground">{person.name}</p>
                <p className="truncate text-sm text-primary">{person.designation}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{person.department} Department</p>
              </div>
            </div>

            <dl className="divide-y divide-border px-5">
              <Field label="Employee ID" value={person.employeeId} mono />
              {person.joinedOn && <Field label="Joined" value={person.joinedOn} />}
              <Field label="Issued by" value={COMPANY.name} />
            </dl>

            <div className="border-t border-border bg-muted/30 px-5 py-3 text-center">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Verified live from {COMPANY.name}'s employee records.
                <br />
                {COMPANY.website} · {COMPANY.email}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-sm font-semibold text-foreground ${mono ? "font-mono tracking-wide" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
