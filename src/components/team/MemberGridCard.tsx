import type { ReactNode } from "react";
import { MessageCircle, Phone } from "lucide-react";
import MemberAvatar from "@/components/MemberAvatar";
import { formatPhoneDisplay, getCallUrl, getWhatsAppUrl } from "@/utils/phone";
import type { AppUser } from "@/types";
import type { EmployeeProfile } from "@/types/hr";
import { EngagementChip, StageChip } from "@/components/hr/ui";

export interface MemberStat {
  label: string;
  value: ReactNode;
  tone?: "default" | "primary" | "muted";
}

/**
 * One team member as a card.
 *
 * Shared by both My Team screens so a member looks the same to a tech admin and a sales admin —
 * only the numbers differ. The whole card is the link into that member's profile; the action row
 * at the bottom stops propagation so a quick action never navigates by accident.
 */
export default function MemberGridCard({ member, profile, stats, badges, actions, onOpen }: {
  member: AppUser;
  /** Their HR record, when it has been loaded — drives the stage and engagement chips. */
  profile?: EmployeeProfile | null;
  stats: MemberStat[];
  badges?: ReactNode;
  actions?: ReactNode;
  onOpen: () => void;
}) {
  return (
    <div
      onClick={onOpen}
      data-test="member-card"
      /*
        `min-w-0` is what actually makes the truncation below work.

        A grid item's automatic minimum size is its min-content width, and the min-content width of
        a `truncate` line — which is `white-space: nowrap` — is the whole string. `overflow: hidden`
        does not shrink it. So a member called "Venkata Naga Sai Sri Lakshmi Narasimha Prasad
        Chowdary" sized the card to their full name and pushed it clean off a phone screen, taking
        every other card in the column with it, because a 1fr track sizes to the widest item.
        Setting min-width to 0 removes that floor and lets the card be the width of its grid area,
        at which point the ellipsis does its job.
      */
      className="group flex min-w-0 cursor-pointer flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/20"
    >
      <div className="flex items-start gap-3">
        {/* The photo the member uploaded themselves wins over the one filed in their HR record:
            it is the one they chose, and the one every other screen is already showing. */}
        <MemberAvatar name={member.name} avatar={member.avatar || profile?.photoUrl} size={48} viewable />

        <div className="min-w-0 flex-1">
          <p className="truncate font-display font-semibold text-foreground group-hover:text-primary">
            {member.name}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {profile?.designation || member.email}
          </p>
        </div>

        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            member.isActive ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
          }`}
        >
          {member.isActive ? "Active" : "Inactive"}
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {profile?.stage && <StageChip stage={profile.stage} engagement={profile.engagementType} />}
        <EngagementChip engagement={profile?.engagementType} />
        {member.employeeId && (
          <span className="rounded-full bg-accent px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            {member.employeeId}
          </span>
        )}
        {badges}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/60 pt-3">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
            <p
              className={`truncate text-sm font-semibold ${
                s.tone === "primary" ? "text-primary" : s.tone === "muted" ? "text-muted-foreground" : "text-foreground"
              }`}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {member.phone && (
        <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground">
          {formatPhoneDisplay(member.phone)}
        </p>
      )}

      <div
        className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        {member.phone && (
          <>
            <a href={getCallUrl(member.phone)} title="Call"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-success hover:bg-success/10">
              <Phone size={13} />
            </a>
            <a href={getWhatsAppUrl(member.phone)} target="_blank" rel="noopener noreferrer" title="WhatsApp"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-success hover:bg-success/10">
              <MessageCircle size={13} />
            </a>
          </>
        )}
        {actions}
      </div>
    </div>
  );
}
