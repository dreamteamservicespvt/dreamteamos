import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAuthStore } from "@/store/authStore";
import { getDefaultRoute } from "@/utils/roleHelpers";
import Login from "@/pages/auth/Login";
import AppLayout from "@/components/layout/AppLayout";
import MainAdminDashboard from "@/pages/main-admin/Dashboard";
import TeamManagement from "@/pages/main-admin/TeamManagement";
import RevenueOverview from "@/pages/main-admin/RevenueOverview";
import TechDepartment from "@/pages/main-admin/TechDepartment";
import SalesDepartment from "@/pages/main-admin/SalesDepartment";
import SessionHistory from "@/pages/main-admin/SessionHistory";
import Accounts from "@/pages/main-admin/Accounts";
import MainAdminSettings from "@/pages/main-admin/Settings";
import TechMemberDashboard from "@/pages/tech-member/Dashboard";
import TechMemberTraining from "@/pages/tech-member/Training";
import TechMemberProfile from "@/pages/tech-member/MyProfile";
import MyWork from "@/pages/tech-member/MyWork";
import AdsHistory from "@/pages/tech-member/AdsHistory";
import MyLeads from "@/pages/sales-member/MyLeads";
import SalesMemberDashboard from "@/pages/sales-member/Dashboard";
import MyPerformance from "@/pages/sales-member/MyPerformance";
import SalesMemberTraining from "@/pages/sales-member/Training";
import SalesMemberProfile from "@/pages/sales-member/MyProfile";
import SalesAdminDashboard from "@/pages/sales-admin/Dashboard";
import SalesAdminMyTeam from "@/pages/sales-admin/MyTeam";
import LeadsManagement from "@/pages/sales-admin/LeadsManagement";
import SalesApprovals from "@/pages/sales-admin/SalesApprovals";
import MemberSalesHistory from "@/pages/sales-admin/MemberSalesHistory";
import MemberLeadsDetail from "@/pages/sales-admin/MemberLeadsDetail";
import SalesTrainingModules from "@/pages/sales-admin/TrainingModules";
import SalesAdminSessionHistory from "@/pages/sales-admin/SessionHistory";
import SalesAdminSettings from "@/pages/sales-admin/Settings";
import SalesAnalytics from "@/pages/sales-admin/Analytics";
import TechAdminDashboard from "@/pages/tech-admin/Dashboard";
import TechAdminMyTeam from "@/pages/tech-admin/MyTeam";
import DriveManagement from "@/pages/tech-admin/DriveManagement";
import TechTrainingModules from "@/pages/tech-admin/TrainingModules";
import TechAdminSessionHistory from "@/pages/tech-admin/SessionHistory";
import TechAdminSettings from "@/pages/tech-admin/Settings";
import TechAdminMemberHistory from "@/pages/tech-admin/MemberHistory";
import WorkAssign from "@/pages/tech-admin/WorkAssign";
import MemberAssignments from "@/pages/tech-admin/MemberAssignments";
import TechAdminTools from "@/pages/tech-admin/Tools";
import AccountsDashboard from "@/pages/accounts-admin/Dashboard";
import RevenueSummary from "@/pages/accounts-admin/RevenueSummary";
import DailyExpenses from "@/pages/accounts-admin/DailyExpenses";
import SalaryManagement from "@/pages/accounts-admin/SalaryManagement";
import PlaceholderPage from "@/pages/PlaceholderPage";
import MySalaryPage from "@/pages/shared/MySalary";
import NotFound from "@/pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function RootRedirect() {
  const { loading } = useAuth();
  const user = useAuthStore((s) => s.user);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (user) return <Navigate to={getDefaultRoute(user.role)} replace />;
  return <Navigate to="/login" replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />

          {/* Main Admin */}
          <Route element={<AppLayout allowedRoles={["main_admin"]} />}>
            <Route path="/main-admin/dashboard" element={<MainAdminDashboard />} />
            <Route path="/main-admin/team" element={<TeamManagement />} />
            <Route path="/main-admin/revenue" element={<RevenueOverview />} />
            <Route path="/main-admin/tech" element={<TechDepartment />} />
            <Route path="/main-admin/sales" element={<SalesDepartment />} />
            <Route path="/main-admin/sessions" element={<SessionHistory />} />
            <Route path="/main-admin/accounts" element={<Accounts />} />
            <Route path="/main-admin/settings" element={<MainAdminSettings />} />
            <Route path="/main-admin/salary" element={<MySalaryPage />} />
          </Route>

          {/* Tech Admin */}
          <Route element={<AppLayout allowedRoles={["tech_admin"]} />}>
            <Route path="/tech-admin/dashboard" element={<TechAdminDashboard />} />
            <Route path="/tech-admin/team" element={<TechAdminMyTeam />} />
            <Route path="/tech-admin/team/:memberId" element={<TechAdminMemberHistory />} />
            <Route path="/tech-admin/drive" element={<DriveManagement />} />
            <Route path="/tech-admin/training" element={<TechTrainingModules />} />
            <Route path="/tech-admin/sessions" element={<TechAdminSessionHistory />} />
            <Route path="/tech-admin/settings" element={<TechAdminSettings />} />
            <Route path="/tech-admin/salary" element={<MySalaryPage />} />
            <Route path="/tech-admin/work-assign" element={<WorkAssign />} />
            <Route path="/tech-admin/work-assign/:memberId" element={<MemberAssignments />} />
            <Route path="/tech-admin/tools" element={<TechAdminTools />} />
          </Route>

          {/* Sales Admin */}
          <Route element={<AppLayout allowedRoles={["sales_admin"]} />}>
            <Route path="/sales-admin/dashboard" element={<SalesAdminDashboard />} />
            <Route path="/sales-admin/team" element={<SalesAdminMyTeam />} />
            <Route path="/sales-admin/team/:memberId" element={<MemberSalesHistory />} />
            <Route path="/sales-admin/leads" element={<LeadsManagement />} />
            <Route path="/sales-admin/leads/:memberId" element={<MemberLeadsDetail />} />
            <Route path="/sales-admin/approvals" element={<SalesApprovals />} />
            <Route path="/sales-admin/analytics" element={<SalesAnalytics />} />
            <Route path="/sales-admin/training" element={<SalesTrainingModules />} />
            <Route path="/sales-admin/sessions" element={<SalesAdminSessionHistory />} />
            <Route path="/sales-admin/settings" element={<SalesAdminSettings />} />
            <Route path="/sales-admin/salary" element={<MySalaryPage />} />
          </Route>

          {/* Accounts Admin */}
          <Route element={<AppLayout allowedRoles={["accounts_admin"]} />}>
            <Route path="/accounts/dashboard" element={<AccountsDashboard />} />
            <Route path="/accounts/revenue" element={<RevenueSummary />} />
            <Route path="/accounts/expenses" element={<DailyExpenses />} />
            <Route path="/accounts/salary" element={<SalaryManagement />} />
          </Route>

          {/* Tech Member */}
          <Route element={<AppLayout allowedRoles={["tech_member"]} />}>
            <Route path="/tech/dashboard" element={<TechMemberDashboard />} />
            <Route path="/tech/my-work" element={<MyWork />} />
            <Route path="/tech/ads-history" element={<AdsHistory />} />
            <Route path="/tech/training" element={<TechMemberTraining />} />
            <Route path="/tech/profile" element={<TechMemberProfile />} />
            <Route path="/tech/salary" element={<MySalaryPage />} />
          </Route>

          {/* Sales Member */}
          <Route element={<AppLayout allowedRoles={["sales_member"]} />}>
            <Route path="/sales/dashboard" element={<SalesMemberDashboard />} />
            <Route path="/sales/leads" element={<MyLeads />} />
            <Route path="/sales/performance" element={<MyPerformance />} />
            <Route path="/sales/training" element={<SalesMemberTraining />} />
            <Route path="/sales/profile" element={<SalesMemberProfile />} />
            <Route path="/sales/salary" element={<MySalaryPage />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
