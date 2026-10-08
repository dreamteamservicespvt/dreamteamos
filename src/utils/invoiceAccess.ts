/**
 * Who may use the Invoice Builder, and what they may do there (owner, 2026-10-08).
 *
 *   Sales person, Sales Admin, Tech Admin, Main Admin, Accounts Admin → yes.
 *   Tech Team Leader → only while the ONE switch in `invoice_settings/access` is on; the Tech Admin
 *                      or the Main Admin turns it on and off in Settings.
 *   Tech Member      → never.
 *
 * The same rules are written into `docs/firestore-rules.md` (`canUseInvoices`, `isInvoiceAdmin`), so
 * a hidden menu item is not the only thing standing between a tech member and the invoices. This file
 * is what the route gate, the navigation and the buttons ask.
 *
 * Visibility: a salesperson or team leader sees the invoices they made; the four admins see every
 * invoice — the company's register, where a missing number would otherwise be impossible to explain.
 *
 * Pure.
 */
import type { UserRole } from "@/types";
import type { Invoice } from "@/types/invoice";

/** Every role that can ever reach `/invoices` — the route guard. The team leader still needs the switch. */
export const INVOICE_ROUTE_ROLES: UserRole[] = [
  "main_admin", "tech_admin", "sales_admin", "accounts_admin", "sales_member", "tech_team_leader",
];

/** The roles that see every invoice and may set the defaults new invoices start with. */
const INVOICE_ADMIN_ROLES: UserRole[] = ["main_admin", "tech_admin", "sales_admin", "accounts_admin"];

export function canUseInvoiceBuilder(role: UserRole | null | undefined, teamLeadersEnabled: boolean): boolean {
  if (!role) return false;
  if (role === "tech_team_leader") return teamLeadersEnabled === true;
  return INVOICE_ROUTE_ROLES.includes(role);
}

/** The team-leader switch belongs to the people who run the tech team. */
export function canManageInvoiceAccess(role: UserRole | null | undefined): boolean {
  return role === "tech_admin" || role === "main_admin";
}

export function isInvoiceAdmin(role: UserRole | null | undefined): boolean {
  return !!role && INVOICE_ADMIN_ROLES.includes(role);
}

/** Bank details, terms and notes for every new invoice. A changed bank account is a fraud vector. */
export const canEditInvoiceDefaults = isInvoiceAdmin;

type Viewer = { uid: string; role: UserRole };

/** Open and edit: the person who made it, or an admin. Edits after generation keep the number. */
export function canEditInvoice(viewer: Viewer | null | undefined, invoice: Pick<Invoice, "ownerId"> | null | undefined): boolean {
  if (!viewer || !invoice) return false;
  return invoice.ownerId === viewer.uid || isInvoiceAdmin(viewer.role);
}

/** Only a draft can be deleted — a generated invoice holds a number in the series and is cancelled instead. */
export function canDeleteInvoice(
  viewer: Viewer | null | undefined,
  invoice: Pick<Invoice, "ownerId" | "status" | "number"> | null | undefined,
): boolean {
  return !!invoice && invoice.status === "draft" && !invoice.number && canEditInvoice(viewer, invoice);
}
