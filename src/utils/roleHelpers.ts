import type { UserRole } from "@/types";
import {
  LayoutDashboard, Users, TrendingUp, Code, Phone, Clock, Wallet,
  Settings, BookOpen, FileCheck, FolderOpen, Send, Calendar, Target, User, BarChart3,
  ClipboardList, Briefcase, Wrench,
} from "lucide-react";

export interface NavItem {
  title: string;
  path: string;
  icon: any;
  badge?: string;
}

const NAV: Record<UserRole, NavItem[]> = {
  main_admin: [
    { title: "Dashboard", path: "/main-admin/dashboard", icon: LayoutDashboard },
    { title: "Team Management", path: "/main-admin/team", icon: Users },
    { title: "Revenue Overview", path: "/main-admin/revenue", icon: TrendingUp },
    { title: "Tech Department", path: "/main-admin/tech", icon: Code },
    { title: "Sales Department", path: "/main-admin/sales", icon: Phone },
    { title: "Session History", path: "/main-admin/sessions", icon: Clock },
    { title: "Accounts", path: "/main-admin/accounts", icon: Wallet },
    { title: "Settings", path: "/main-admin/settings", icon: Settings },
  ],
  tech_admin: [
    { title: "Dashboard", path: "/tech-admin/dashboard", icon: LayoutDashboard },
    { title: "My Team", path: "/tech-admin/team", icon: Users },
    { title: "Work Assign", path: "/tech-admin/work-assign", icon: ClipboardList },
    { title: "Work Approvals", path: "/tech-admin/approvals", icon: FileCheck },
    { title: "Drive Management", path: "/tech-admin/drive", icon: FolderOpen },
    { title: "Training Modules", path: "/tech-admin/training", icon: BookOpen },
    { title: "Session History", path: "/tech-admin/sessions", icon: Clock },
    { title: "Tools", path: "/tech-admin/tools", icon: Wrench },
    { title: "Settings", path: "/tech-admin/settings", icon: Settings },
  ],
  sales_admin: [
    { title: "Dashboard", path: "/sales-admin/dashboard", icon: LayoutDashboard },
    { title: "My Team", path: "/sales-admin/team", icon: Users },
    { title: "Leads Management", path: "/sales-admin/leads", icon: Phone },
    { title: "Sales Approvals", path: "/sales-admin/approvals", icon: FileCheck },
    { title: "Analytics", path: "/sales-admin/analytics", icon: BarChart3 },
    { title: "Training Modules", path: "/sales-admin/training", icon: BookOpen },
    { title: "Session History", path: "/sales-admin/sessions", icon: Clock },
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
    { title: "Submit Work", path: "/tech/submit", icon: Send },
    { title: "My History", path: "/tech/history", icon: Calendar },
    { title: "Training", path: "/tech/training", icon: BookOpen },
    { title: "My Profile", path: "/tech/profile", icon: User },
  ],
  sales_member: [
    { title: "Dashboard", path: "/sales/dashboard", icon: LayoutDashboard },
    { title: "My Leads", path: "/sales/leads", icon: Phone },
    { title: "My Performance", path: "/sales/performance", icon: Target },
    { title: "Training", path: "/sales/training", icon: BookOpen },
    { title: "My Profile", path: "/sales/profile", icon: User },
  ],
};

export function getNavItems(role: UserRole): NavItem[] {
  return NAV[role] || [];
}

export function getRoleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    main_admin: "Main Admin",
    tech_admin: "Tech Admin",
    sales_admin: "Sales Admin",
    accounts_admin: "Accounts Admin",
    tech_member: "Tech Member",
    sales_member: "Sales Member",
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
  };
  return routes[role] || "/login";
}
