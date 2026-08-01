import type { UserRole } from "@/types";

/** Deterministic room ID for a 1-on-1 chat pair */
export function getChatRoomId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join("_");
}

/** Everyone who works here. Ordered so the section list reads top-down by seniority. */
export const CHATTABLE_ROLES: UserRole[] = [
  "main_admin", "tech_admin", "sales_admin", "accounts_admin",
  "tech_team_leader", "tech_member", "sales_member",
];

/**
 * Who a person can chat with: everybody.
 *
 * It used to be a per-role allow-list, and every line of it was a rule nobody had asked for — a
 * sales member could not message the tech member building their client's ad, a team leader could
 * not reach the sales admin whose order they were querying. The people doing the work know who they
 * need; the platform's job is to not be in the way.
 *
 * The list is kept navigable instead: the sidebar groups contacts by section and opens on the
 * reader's own, which is who they talk to most — see CHAT_SECTIONS.
 */
export function getChatContactRoles(_role: UserRole): UserRole[] {
  return CHATTABLE_ROLES;
}

/** The groups the contact list is split into, in the order they are offered. */
export type ChatSectionKey = "all" | "sales" | "tech" | "admins";

export const CHAT_SECTIONS: { key: ChatSectionKey; label: string; roles: UserRole[] }[] = [
  { key: "all", label: "Everyone", roles: CHATTABLE_ROLES },
  { key: "sales", label: "Sales team", roles: ["sales_admin", "sales_member"] },
  { key: "tech", label: "Tech team", roles: ["tech_admin", "tech_team_leader", "tech_member"] },
  { key: "admins", label: "Admins", roles: ["main_admin", "tech_admin", "sales_admin", "accounts_admin"] },
];

/**
 * The section the contact list opens on: the reader's own.
 *
 * A sales member's day is mostly other sales people, so that is what they should see first —
 * without it, opening the list on "Everyone" buries the five people they actually message under
 * the whole company.
 */
export function defaultChatSection(role: UserRole | undefined): ChatSectionKey {
  if (role === "sales_admin" || role === "sales_member") return "sales";
  if (role === "tech_admin" || role === "tech_team_leader" || role === "tech_member") return "tech";
  return "all";
}

/** Whether a contact belongs in a section. */
export function inChatSection(role: string | undefined, section: ChatSectionKey): boolean {
  const found = CHAT_SECTIONS.find((s) => s.key === section);
  return !!found && !!role && found.roles.includes(role as UserRole);
}

/** @deprecated use getChatContactRoles */
export function getChatContactRole(role: UserRole): UserRole | null {
  switch (role) {
    case "tech_admin":
      return "tech_member";
    case "tech_member":
      return "tech_admin";
    case "sales_admin":
      return "sales_member";
    case "sales_member":
      return "sales_admin";
    default:
      return null;
  }
}

/** Returns the department roles (admin + members) for admin monitoring */
export function getDepartmentMemberRole(role: UserRole): UserRole | null {
  if (role === "tech_admin") return "tech_member";
  if (role === "sales_admin") return "sales_member";
  return null;
}

/** The chat page route for a given role */
export function getChatRoute(role: UserRole): string {
  switch (role) {
    case "tech_admin":
      return "/tech-admin/chat";
    case "tech_member":
      return "/tech/chat";
    case "sales_admin":
      return "/sales-admin/chat";
    case "sales_member":
      return "/sales/chat";
    default:
      return "/";
  }
}

/** The meeting page route for a given role */
export function getMeetingRoute(role: UserRole): string {
  switch (role) {
    case "tech_admin":
      return "/tech-admin/meeting";
    case "tech_member":
      return "/tech/meeting";
    case "sales_admin":
      return "/sales-admin/meeting";
    case "sales_member":
      return "/sales/meeting";
    default:
      return "/";
  }
}
