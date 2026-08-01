import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAuthStore } from "@/store/authStore";
import { defaultRouteForUser } from "@/utils/roleHelpers";
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
import CreateAd from "@/pages/tech-member/CreateAd";
import TechMemberTraining from "@/pages/tech-member/Training";
import TechMemberProfile from "@/pages/tech-member/MyProfile";
import MyWork from "@/pages/tech-member/MyWork";
import TechMemberMyAnalytics from "@/pages/tech-member/MyAnalytics";
import RecentAds from "@/pages/tech-member/RecentAds";
import MyLeads from "@/pages/sales-member/MyLeads";
import SalesMemberDashboard from "@/pages/sales-member/Dashboard";
import MyPerformance from "@/pages/sales-member/MyPerformance";
import SalesMemberTraining from "@/pages/sales-member/Training";
import SalesMemberProfile from "@/pages/sales-member/MyProfile";
import SalesScripts from "@/pages/sales-member/SalesScripts";
import MyReviews from "@/pages/sales-member/MyReviews";
import SalesMemberActivityHistory from "@/pages/sales-member/ActivityHistory";
import SalesMemberSettlements from "@/pages/sales-member/Settlements";
import SalesAdminDashboard from "@/pages/sales-admin/Dashboard";
import SalesAdminMyTeam from "@/pages/sales-admin/MyTeam";
import LeadsManagement from "@/pages/sales-admin/LeadsManagement";
import SalesApprovals from "@/pages/sales-admin/SalesApprovals";
import Settlements from "@/pages/sales-admin/Settlements";
import MemberSalesHistory from "@/pages/sales-admin/MemberSalesHistory";
import MemberLeadsDetail from "@/pages/sales-admin/MemberLeadsDetail";
import SalesTrainingModules from "@/pages/sales-admin/TrainingModules";
import SalesAdminSessionHistory from "@/pages/sales-admin/SessionHistory";
import SalesAdminSettings from "@/pages/sales-admin/Settings";
import SalesAnalytics from "@/pages/sales-admin/Analytics";
import ScheduleNumbers from "@/pages/sales-admin/ScheduleNumbers";
import SalesAdminActivityHistory from "@/pages/sales-admin/ActivityHistory";
import Leaderboard from "@/pages/shared/Leaderboard";
import TechAdminDashboard from "@/pages/tech-admin/Dashboard";
import TechAdminMyTeam from "@/pages/tech-admin/MyTeam";
import DriveManagement from "@/pages/tech-admin/DriveManagement";
import TechTrainingModules from "@/pages/tech-admin/TrainingModules";
import TechAdminSessionHistory from "@/pages/tech-admin/SessionHistory";
import TechAdminSettings from "@/pages/tech-admin/Settings";
import TechAdminMemberHistory from "@/pages/tech-admin/MemberHistory";
import TechAdminMemberAnalytics from "@/pages/tech-admin/MemberAnalytics";
import WorkAssign from "@/pages/tech-admin/WorkAssign";
import Orders from "@/pages/tech-admin/Orders";
import Clients from "@/pages/shared/Clients";
import MemberAssignments from "@/pages/tech-admin/MemberAssignments";
import TeamLeaderWorkAssign from "@/pages/tech-team-leader/WorkAssign";
import TeamLeaderMemberAssignments from "@/pages/tech-team-leader/MemberAssignments";
import TeamAttendance from "@/pages/shared/TeamAttendance";
import MemberProfileDetail from "@/pages/shared/MemberProfileDetail";
import SendAgreement from "@/pages/shared/SendAgreement";
import Tools from "@/pages/shared/Tools";
import WorkReports from "@/pages/shared/WorkReports";
import Payroll from "@/pages/shared/Payroll";
import Profit from "@/pages/shared/Profit";
import SalesPayroll from "@/pages/sales-admin/Payroll";
import SalesMySalary from "@/pages/sales-member/MySalary";
import CinematicAds from "@/pages/tech-admin/CinematicAds";
import AccountsDashboard from "@/pages/accounts-admin/Dashboard";
import RevenueSummary from "@/pages/accounts-admin/RevenueSummary";
import DailyExpenses from "@/pages/accounts-admin/DailyExpenses";
import SalaryManagement from "@/pages/accounts-admin/SalaryManagement";
import PlaceholderPage from "@/pages/PlaceholderPage";
import MySalaryPage from "@/pages/shared/MySalary";
import MySalaryDashboard from "@/pages/tech-member/MySalaryDashboard";
import NotFound from "@/pages/NotFound";
import Chat from "@/pages/shared/Chat";
import Meeting from "@/pages/shared/Meeting";
import AdminChatMonitor from "@/pages/shared/AdminChatMonitor";
import { Loader2 } from "lucide-react";
import AppUpdateBanner from "@/components/layout/AppUpdateBanner";

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

  if (user) return <Navigate to={defaultRouteForUser(user)} replace />;
  return <Navigate to="/login" replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        {/* Inside the router so it can tell the login screen (safe to update instantly) from a
            page where someone may have unsaved work. */}
        <AppUpdateBanner />
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
            <Route path="/main-admin/profit" element={<Profit />} />
            <Route path="/main-admin/settings" element={<MainAdminSettings />} />
            <Route path="/main-admin/salary" element={<MySalaryPage />} />
            <Route path="/main-admin/clients" element={<Clients />} />
          </Route>

          {/* Tech Admin */}
          <Route element={<AppLayout allowedRoles={["tech_admin"]} />}>
            <Route path="/tech-admin/dashboard" element={<TechAdminDashboard />} />
            <Route path="/tech-admin/team" element={<TechAdminMyTeam />} />
            {/* The full member record — account, employment, KYC, documents, probation, assets, exit */}
            <Route path="/tech-admin/team/:memberId/profile" element={<MemberProfileDetail />} />
            <Route path="/tech-admin/team/:memberId" element={<TechAdminMemberHistory />} />
            <Route path="/tech-admin/team/:memberId/analytics" element={<TechAdminMemberAnalytics />} />
            <Route path="/tech-admin/attendance" element={<TeamAttendance />} />
            <Route path="/tech-admin/agreements" element={<SendAgreement />} />
            <Route path="/tech-admin/drive" element={<DriveManagement />} />
            <Route path="/tech-admin/training" element={<TechTrainingModules />} />
            <Route path="/tech-admin/sessions" element={<TechAdminSessionHistory />} />
            <Route path="/tech-admin/settings" element={<TechAdminSettings />} />
            <Route path="/tech-admin/salary" element={<MySalaryPage />} />
            <Route path="/tech-admin/work-assign" element={<WorkAssign />} />
            <Route path="/tech-admin/work-assign/:memberId" element={<MemberAssignments />} />
            <Route path="/tech-admin/work-reports" element={<WorkReports />} />
            <Route path="/tech-admin/payroll" element={<Payroll />} />
            <Route path="/tech-admin/profit" element={<Profit />} />
            <Route path="/tech-admin/orders" element={<Orders />} />
            <Route path="/tech-admin/clients" element={<Clients />} />
            <Route path="/tech-admin/tools" element={<Tools />} />
            <Route path="/tech-admin/cinematic-ads" element={<CinematicAds />} />
            <Route path="/tech-admin/chat" element={<Chat />} />
            <Route path="/tech-admin/meeting" element={<Meeting />} />
            <Route path="/tech-admin/chat-monitor" element={<AdminChatMonitor />} />
          </Route>

          {/* Sales Admin */}
          <Route element={<AppLayout allowedRoles={["sales_admin"]} />}>
            <Route path="/sales-admin/dashboard" element={<SalesAdminDashboard />} />
            <Route path="/sales-admin/team" element={<SalesAdminMyTeam />} />
            {/* The full member record — account, employment, KYC, documents, probation, assets, exit */}
            <Route path="/sales-admin/team/:memberId/profile" element={<MemberProfileDetail />} />
            <Route path="/sales-admin/team/:memberId" element={<MemberSalesHistory />} />
            <Route path="/sales-admin/leads" element={<LeadsManagement />} />
            <Route path="/sales-admin/leads/:memberId" element={<MemberLeadsDetail />} />
            <Route path="/sales-admin/schedule-numbers" element={<ScheduleNumbers />} />
            <Route path="/sales-admin/approvals" element={<SalesApprovals />} />
            <Route path="/sales-admin/settlements" element={<Settlements />} />
            <Route path="/sales-admin/payroll" element={<SalesPayroll />} />
            <Route path="/sales-admin/attendance" element={<TeamAttendance />} />
            <Route path="/sales-admin/profit" element={<Profit />} />
            <Route path="/sales-admin/analytics" element={<SalesAnalytics />} />
            <Route path="/sales-admin/training" element={<SalesTrainingModules />} />
            <Route path="/sales-admin/scripts" element={<SalesScripts />} />
            <Route path="/sales-admin/sessions" element={<SalesAdminSessionHistory />} />
            <Route path="/sales-admin/settings" element={<SalesAdminSettings />} />
            <Route path="/sales-admin/agreements" element={<SendAgreement />} />
            <Route path="/sales-admin/leaderboard" element={<Leaderboard />} />
            <Route path="/sales-admin/history" element={<SalesAdminActivityHistory />} />
            <Route path="/sales-admin/clients" element={<Clients />} />
            <Route path="/sales-admin/chat" element={<Chat />} />
            <Route path="/sales-admin/meeting" element={<Meeting />} />
            <Route path="/sales-admin/chat-monitor" element={<AdminChatMonitor />} />
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
            <Route path="/tech/create" element={<CreateAd />} />
            <Route path="/tech/dashboard" element={<TechMemberDashboard />} />
            <Route path="/tech/my-work" element={<MyWork />} />
            <Route path="/tech/recent-ads" element={<RecentAds />} />
            <Route path="/tech/analytics" element={<TechMemberMyAnalytics />} />
            <Route path="/tech/training" element={<TechMemberTraining />} />
            <Route path="/tech/profile" element={<TechMemberProfile />} />
            <Route path="/tech/chat" element={<Chat />} />
            <Route path="/tech/meeting" element={<Meeting />} />
            <Route path="/tech/salary" element={<MySalaryDashboard />} />
            <Route path="/tech/salary/receipts" element={<MySalaryPage />} />
          </Route>

          {/* Sales Member */}
          <Route element={<AppLayout allowedRoles={["sales_member"]} />}>
            <Route path="/sales/dashboard" element={<SalesMemberDashboard />} />
            <Route path="/sales/leads" element={<MyLeads />} />
            <Route path="/sales/reviews" element={<MyReviews />} />
            <Route path="/sales/performance" element={<MyPerformance />} />
            <Route path="/sales/training" element={<SalesMemberTraining />} />
            <Route path="/sales/scripts" element={<SalesScripts />} />
            <Route path="/sales/profile" element={<SalesMemberProfile />} />
            <Route path="/sales/leaderboard" element={<Leaderboard />} />
            <Route path="/sales/settlements" element={<SalesMemberSettlements />} />
            <Route path="/sales/history" element={<SalesMemberActivityHistory />} />
            <Route path="/sales/chat" element={<Chat />} />
            <Route path="/sales/meeting" element={<Meeting />} />
            <Route path="/sales/salary" element={<SalesMySalary />} />
            <Route path="/sales/salary/receipts" element={<MySalaryPage />} />
          </Route>

          {/* Tech Team Leader */}
          <Route element={<AppLayout allowedRoles={["tech_team_leader"]} />}>
            <Route path="/team-leader/work-assign" element={<TeamLeaderWorkAssign />} />
            <Route path="/team-leader/work-assign/:memberId" element={<TeamLeaderMemberAssignments />} />
            <Route path="/team-leader/work-reports" element={<WorkReports />} />
            <Route path="/team-leader/orders" element={<Orders />} />
            <Route path="/team-leader/attendance" element={<TeamAttendance />} />
            <Route path="/team-leader/agreements" element={<SendAgreement />} />
            {/* A team leader is an employee too — they have HR documents of their own to sign. */}
            <Route path="/team-leader/profile" element={<TechMemberProfile />} />
            <Route path="/team-leader/tools" element={<Tools />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
