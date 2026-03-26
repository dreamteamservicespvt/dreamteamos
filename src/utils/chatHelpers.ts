import type { UserRole } from "@/types";

/** Deterministic room ID for a 1-on-1 chat pair */
export function getChatRoomId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join("_");
}

/**
 * Returns all roles a given role can chat with.
 * Admins see their members; members see their admin + fellow members.
 */
export function getChatContactRoles(role: UserRole): UserRole[] {
  switch (role) {
    case "tech_admin":
      return ["tech_member"];
    case "tech_member":
      return ["tech_admin", "tech_member"];
    case "sales_admin":
      return ["sales_member"];
    case "sales_member":
      return ["sales_admin", "sales_member"];
    default:
      return [];
  }
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
