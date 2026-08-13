import type { AppUser, UserRole } from "@/types";
import {
  LayoutDashboard, Users, TrendingUp, Code, Phone, Clock, Wallet,
  Settings, BookOpen, FolderOpen, Target, User, BarChart3,
  ClipboardList, Briefcase, Wrench, FileCheck, MessageSquare, Video, Eye, Film, ScrollText, CalendarClock, Trophy, History,
  ShoppingBag, Contact, Star, GraduationCap, LayoutGrid, PiggyBank, Banknote, Wand2, Search,
} from "lucide-react";

export interface NavItem {
  title: string;
  /** Present for a direct link. Omitted for a group — see `children`. */
  path?: string;
  icon: any;
  badge?: string;
  /** When present, this item is a collapsible dropdown group instead of a direct link. */
  children?: NavItem[];
}

const NAV: Record<UserRole, NavItem[]> = {
  main_admin: [
    { title: "Dashboard", path: "/main-admin/dashboard", icon: LayoutDashboard },
    { title: "Team Management", path: "/main-admin/team", icon: Users },
    { title: "Revenue Overview", path: "/main-admin/revenue", icon: TrendingUp },
    { title: "Tech Department", path: "/main-admin/tech", icon: Code },
    { title: "Business Development", path: "/main-admin/sales", icon: Phone },
    { title: "Clients", path: "/main-admin/clients", icon: Contact },
    { title: "Session History", path: "/main-admin/sessions", icon: Clock },
    { title: "Accounts", path: "/main-admin/accounts", icon: Wallet },
    { title: "Profit & Loss", path: "/main-admin/profit", icon: PiggyBank },
    { title: "Settings", path: "/main-admin/settings", icon: Settings },
  ],
  tech_admin: [
    { title: "Dashboard", path: "/tech-admin/dashboard", icon: LayoutDashboard },
    { title: "Work Assign", path: "/tech-admin/work-assign", icon: ClipboardList },
    { title: "Orders", path: "/tech-admin/orders", icon: ShoppingBag },
    { title: "Attendance", path: "/tech-admin/attendance", icon: CalendarClock },
    { title: "Payroll", path: "/tech-admin/payroll", icon: Wallet },
    { title: "My Team", path: "/tech-admin/team", icon: Users },
    { title: "Clients", path: "/tech-admin/clients", icon: Contact },
    // Opened daily, so it sits in the top-level list rather than buried in the Manage dropdown.
    { title: "Work Done & Reports", path: "/tech-admin/work-reports", icon: BarChart3 },
    {
      title: "Manage", icon: LayoutGrid,
      children: [
        { title: "HR & Documents", path: "/tech-admin/hr", icon: FileCheck },
        { title: "Profit & Loss", path: "/tech-admin/profit", icon: PiggyBank },
        { title: "Drive Management", path: "/tech-admin/drive", icon: FolderOpen },
        { title: "Training Modules", path: "/tech-admin/training", icon: BookOpen },
        // Who assigned, moved, verified or removed what — including the team leaders'.
        { title: "Activity History", path: "/tech-admin/activity", icon: History },
        { title: "Session History", path: "/tech-admin/sessions", icon: Clock },
        { title: "Team Chat", path: "/tech-admin/chat", icon: MessageSquare },
        { title: "Meetings", path: "/tech-admin/meeting", icon: Video },
        { title: "Chat Monitor", path: "/tech-admin/chat-monitor", icon: Eye },
      ],
    },
    { title: "Tools", path: "/tech-admin/tools", icon: Wrench },
    { title: "Cinematic Ads", path: "/tech-admin/cinematic-ads", icon: Film },
    { title: "Settings", path: "/tech-admin/settings", icon: Settings },
  ],
  sales_admin: [
    // Ordered by how often the sales admin actually opens each screen, not by module.
    { title: "Dashboard", path: "/sales-admin/dashboard", icon: LayoutDashboard },
    { title: "My Team", path: "/sales-admin/team", icon: Users },
    { title: "Leaderboard", path: "/sales-admin/leaderboard", icon: Trophy },
    { title: "Sales Approvals", path: "/sales-admin/approvals", icon: FileCheck },
    { title: "Clients", path: "/sales-admin/clients", icon: Contact },
    // "Who has this number, and what have we sold them?" — asked several times a week and, until
    // this page, answerable only by hand across three other screens.
    { title: "Client Lookup", path: "/sales-admin/client-lookup", icon: Search },
    { title: "Settlements", path: "/sales-admin/settlements", icon: Wallet },
    { title: "Attendance", path: "/sales-admin/attendance", icon: CalendarClock },
    { title: "Payroll", path: "/sales-admin/payroll", icon: Banknote },
    {
      // Two halves of the same job — finding numbers and working them — so they live together.
      title: "Leads", icon: Phone,
      children: [
        { title: "Leads Management", path: "/sales-admin/leads", icon: Phone },
        { title: "Schedule Numbers", path: "/sales-admin/schedule-numbers", icon: CalendarClock },
      ],
    },
    { title: "HR & Documents", path: "/sales-admin/hr", icon: FileCheck },
    {
      title: "Reports & History", icon: BarChart3,
      children: [
        { title: "Analytics", path: "/sales-admin/analytics", icon: BarChart3 },
        { title: "Profit & Loss", path: "/sales-admin/profit", icon: PiggyBank },
        { title: "Activity History", path: "/sales-admin/history", icon: History },
        { title: "Session History", path: "/sales-admin/sessions", icon: Clock },
      ],
    },
    {
      title: "Communication", icon: MessageSquare,
      children: [
        { title: "Team Chat", path: "/sales-admin/chat", icon: MessageSquare },
        { title: "Meetings", path: "/sales-admin/meeting", icon: Video },
        { title: "Chat Monitor", path: "/sales-admin/chat-monitor", icon: Eye },
      ],
    },
    {
      title: "Training & Scripts", icon: GraduationCap,
      children: [
        { title: "Training Modules", path: "/sales-admin/training", icon: BookOpen },
        { title: "Sales Scripts", path: "/sales-admin/scripts", icon: ScrollText },
      ],
    },
    { title: "Settings", path: "/sales-admin/settings", icon: Settings },
  ],
  accounts_admin: [
    { title: "Dashboard", path: "/accounts/dashboard", icon: LayoutDashboard },
    { title: "Revenue Summary", path: "/accounts/revenue", icon: TrendingUp },
    { title: "Daily Expenses", path: "/accounts/expenses", icon: Wallet },
    { title: "Salary Management", path: "/accounts/salary", icon: Users },
  ],
  tech_member: [
    { title: "Dashboard", path: "/tech/dashboard", icon: LayoutDashboard },
    { title: "My Work", path: "/tech/my-work", icon: Briefcase },
    { title: "Recent Ads", path: "/tech/recent-ads", icon: Film },
    { title: "My Salary", path: "/tech/salary", icon: Wallet },
    {
      title: "Workspace", icon: LayoutGrid,
      children: [
        { title: "My Analytics", path: "/tech/analytics", icon: BarChart3 },
        { title: "Team Chat", path: "/tech/chat", icon: MessageSquare },
        { title: "Meetings", path: "/tech/meeting", icon: Video },
        { title: "Training", path: "/tech/training", icon: BookOpen },
      ],
    },
    { title: "My Profile", path: "/tech/profile", icon: User },
  ],
  sales_member: [
    { title: "Dashboard", path: "/sales/dashboard", icon: LayoutDashboard },
    { title: "My Leads", path: "/sales/leads", icon: Phone },
    // Third, right under the work itself: where a member stands against the room is the thing they
    // check between calls, and it was buried under six links they open once a month.
    { title: "Leaderboard", path: "/sales/leaderboard", icon: Trophy },
    // Everything about people who have already bought, in one place. Split across three top-level
    // links it read as three unrelated jobs; it is one — look after the client you sold to.
    {
      title: "Clients", icon: Contact,
      children: [
        { title: "Client Chats", path: "/sales/client-chats", icon: MessageSquare },
        { title: "My Clients", path: "/sales/clients", icon: Contact },
        { title: "My Reviews", path: "/sales/reviews", icon: Star },
      ],
    },
    // Likewise for money: what I sold, what I am paid, what has been settled.
    {
      title: "Salary", icon: Wallet,
      children: [
        { title: "My Performance", path: "/sales/performance", icon: Target },
        { title: "My Salary", path: "/sales/salary", icon: Wallet },
        { title: "Settlements", path: "/sales/settlements", icon: Wallet },
      ],
    },
    {
      title: "Communication", icon: MessageSquare,
      children: [
        { title: "Team Chat", path: "/sales/chat", icon: MessageSquare },
        { title: "Meetings", path: "/sales/meeting", icon: Video },
      ],
    },
    {
      title: "Training & Scripts", icon: GraduationCap,
      children: [
        { title: "Training", path: "/sales/training", icon: BookOpen },
        { title: "Sales Scripts", path: "/sales/scripts", icon: ScrollText },
      ],
    },
    // Not in the requested running order, but a page nobody should lose the way to.
    { title: "My History", path: "/sales/history", icon: History },
    { title: "My Profile", path: "/sales/profile", icon: User },
  ],
  tech_team_leader: [
    { title: "Orders", path: "/team-leader/orders", icon: ShoppingBag },
    { title: "Work Assign", path: "/team-leader/work-assign", icon: ClipboardList },
    { title: "Work Done & Reports", path: "/team-leader/work-reports", icon: BarChart3 },
    { title: "Attendance", path: "/team-leader/attendance", icon: CalendarClock },
    { title: "HR & Documents", path: "/team-leader/hr", icon: FileCheck },
    { title: "Activity History", path: "/team-leader/activity", icon: History },
    { title: "Tools", path: "/team-leader/tools", icon: Wrench },
    // A team leader is an employee too: their own employment record and documents to sign.
    { title: "My Profile", path: "/team-leader/profile", icon: User },
  ],
};

/**
 * An external creator uses the platform for one thing — creating their own ads — so their whole
 * navigation is the ad-creation tool plus their profile. Everything team-related is hidden.
 */
export const EXTERNAL_CREATOR_NAV: NavItem[] = [
  { title: "Create Ad", path: "/tech/create", icon: Wand2 },
  { title: "My Profile", path: "/tech/profile", icon: User },
];

/** The routes an external creator is allowed to reach — everything else redirects to Create Ad. */
export const EXTERNAL_CREATOR_ROUTES = ["/tech/create", "/tech/profile"];

/**
 * Where "my profile" lives for this person.
 *
 * Employees have a My Profile page; admins have Settings, which is the same thing under another
 * name — their account, their photo, their password. Accounts admins have neither yet, so they
 * get "" and whatever is showing their name simply is not a link, rather than a link that lands
 * them somewhere that is not theirs.
 */
export function getProfileRoute(role?: UserRole | null): string {
  switch (role) {
    case "sales_member": return "/sales/profile";
    case "tech_member": return "/tech/profile";
    case "tech_team_leader": return "/team-leader/profile";
    case "main_admin": return "/main-admin/settings";
    case "tech_admin": return "/tech-admin/settings";
    case "sales_admin": return "/sales-admin/settings";
    default: return "";
  }
}

export function getNavItems(role: UserRole, user?: Pick<AppUser, "externalCreator"> | null): NavItem[] {
  if (user?.externalCreator) return EXTERNAL_CREATOR_NAV;
  return NAV[role] || [];
}

export function getRoleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    main_admin: "Main Admin",
    tech_admin: "Tech Admin",
    sales_admin: "Sales Admin",
    accounts_admin: "Accounts Admin",
    tech_member: "Tech Member",
    sales_member: "Sales Executive",
    tech_team_leader: "Tech Team Leader",
  };
  return labels[role] || role;
}

export function getRoleColor(role: UserRole): string {
  const colors: Record<UserRole, string> = {
    main_admin: "bg-role-main-admin/20 text-role-main-admin",
    tech_admin: "bg-role-tech-admin/20 text-role-tech-admin",
    sales_admin: "bg-role-sales-admin/20 text-role-sales-admin",
    accounts_admin: "bg-role-accounts/20 text-role-accounts",
    tech_member: "bg-role-tech-member/20 text-role-tech-member",
    sales_member: "bg-role-sales-member/20 text-role-sales-member",
    tech_team_leader: "bg-purple-500/20 text-purple-500",
  };
  return colors[role] || "";
}

export function getDefaultRoute(role: UserRole): string {
  const routes: Record<UserRole, string> = {
    main_admin: "/main-admin/dashboard",
    tech_admin: "/tech-admin/dashboard",
    sales_admin: "/sales-admin/dashboard",
    accounts_admin: "/accounts/dashboard",
    tech_member: "/tech/dashboard",
    sales_member: "/sales/dashboard",
    tech_team_leader: "/team-leader/work-assign",
  };
  return routes[role] || "/login";
}

/** Where a user lands by default — external creators go straight to the ad-creation tool. */
export function defaultRouteForUser(user: Pick<AppUser, "role" | "externalCreator">): string {
  if (user.externalCreator) return "/tech/create";
  return getDefaultRoute(user.role);
}
