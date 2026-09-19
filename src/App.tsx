import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAuthStore } from "@/store/authStore";
import { defaultRouteForUser } from "@/utils/roleHelpers";
import Login from "@/pages/auth/Login";
import AppLayout from "@/components/layout/AppLayout";
import { Loader2 } from "lucide-react";
import AppUpdateBanner from "@/components/layout/AppUpdateBanner";


/**
 * Every page is its own chunk, fetched when somebody actually goes there.
 *
 * ── Why this matters more here than on most apps ──────────────────────────────────
 * Importing all sixty pages at the top of this file meant one bundle carrying the ad generator,
 * its prompt library, the charting library, the document writers and the video-call stack — all of
 * it downloaded and parsed before a sales member on a phone could see their leads, and none of it
 * used on that screen. A member who never opens the AI platform was paying for it on every single
 * load, on a mobile connection.
 *
 * `lazy` turns each one into a separate file. The first screen ships with what the first screen
 * needs; the ad generator arrives when somebody opens the ad generator. `Suspense` below covers
 * the moment in between, and the router keeps every path exactly as it was.
 */
const MainAdminDashboard = lazy(() => import("@/pages/main-admin/Dashboard"));
const TeamManagement = lazy(() => import("@/pages/main-admin/TeamManagement"));
const RevenueOverview = lazy(() => import("@/pages/main-admin/RevenueOverview"));
const TechDepartment = lazy(() => import("@/pages/main-admin/TechDepartment"));
const SalesDepartment = lazy(() => import("@/pages/main-admin/SalesDepartment"));
const SessionHistory = lazy(() => import("@/pages/main-admin/SessionHistory"));
const Accounts = lazy(() => import("@/pages/main-admin/Accounts"));
const MainAdminSettings = lazy(() => import("@/pages/main-admin/Settings"));
const TechMemberDashboard = lazy(() => import("@/pages/tech-member/Dashboard"));
const CreateAd = lazy(() => import("@/pages/tech-member/CreateAd"));
const TechMemberTraining = lazy(() => import("@/pages/tech-member/Training"));
const TechMemberProfile = lazy(() => import("@/pages/tech-member/MyProfile"));
const MyWork = lazy(() => import("@/pages/tech-member/MyWork"));
const TechMemberMyAnalytics = lazy(() => import("@/pages/tech-member/MyAnalytics"));
const RecentAds = lazy(() => import("@/pages/tech-member/RecentAds"));
const MyLeads = lazy(() => import("@/pages/sales-member/MyLeads"));
const SalesMemberDashboard = lazy(() => import("@/pages/sales-member/Dashboard"));
const MyPerformance = lazy(() => import("@/pages/sales-member/MyPerformance"));
const SalesMemberTraining = lazy(() => import("@/pages/sales-member/Training"));
const SalesMemberProfile = lazy(() => import("@/pages/sales-member/MyProfile"));
const SalesScripts = lazy(() => import("@/pages/sales-member/SalesScripts"));
const MyReviews = lazy(() => import("@/pages/sales-member/MyReviews"));
const SalesClientChats = lazy(() => import("@/pages/sales-member/ClientChats"));
const SalesMyClients = lazy(() => import("@/pages/sales-member/MyClients"));
const SalesMemberActivityHistory = lazy(() => import("@/pages/sales-member/ActivityHistory"));
const SalesMemberSettlements = lazy(() => import("@/pages/sales-member/Settlements"));
const SalesAdminDashboard = lazy(() => import("@/pages/sales-admin/Dashboard"));
const SalesAdminMyTeam = lazy(() => import("@/pages/sales-admin/MyTeam"));
const LeadsManagement = lazy(() => import("@/pages/sales-admin/LeadsManagement"));
const SalesApprovals = lazy(() => import("@/pages/sales-admin/SalesApprovals"));
const ClientLookup = lazy(() => import("@/pages/sales-admin/ClientLookup"));
const Settlements = lazy(() => import("@/pages/sales-admin/Settlements"));
const MemberSalesHistory = lazy(() => import("@/pages/sales-admin/MemberSalesHistory"));
const MemberLeadsDetail = lazy(() => import("@/pages/sales-admin/MemberLeadsDetail"));
const SalesTrainingModules = lazy(() => import("@/pages/sales-admin/TrainingModules"));
const SalesAdminSessionHistory = lazy(() => import("@/pages/sales-admin/SessionHistory"));
const SalesAdminSettings = lazy(() => import("@/pages/sales-admin/Settings"));
const SalesAnalytics = lazy(() => import("@/pages/sales-admin/Analytics"));
const ScheduleNumbers = lazy(() => import("@/pages/sales-admin/ScheduleNumbers"));
const SalesAdminActivityHistory = lazy(() => import("@/pages/sales-admin/ActivityHistory"));
const Leaderboard = lazy(() => import("@/pages/shared/Leaderboard"));
const TechAdminDashboard = lazy(() => import("@/pages/tech-admin/Dashboard"));
const TechAdminMyTeam = lazy(() => import("@/pages/tech-admin/MyTeam"));
const DriveManagement = lazy(() => import("@/pages/tech-admin/DriveManagement"));
const TechTrainingModules = lazy(() => import("@/pages/tech-admin/TrainingModules"));
const TechAdminSessionHistory = lazy(() => import("@/pages/tech-admin/SessionHistory"));
const TechActivityHistory = lazy(() => import("@/pages/tech-admin/ActivityHistory"));
const TechAdminSettings = lazy(() => import("@/pages/tech-admin/Settings"));
const TechAdminMemberHistory = lazy(() => import("@/pages/tech-admin/MemberHistory"));
const TechAdminMemberAnalytics = lazy(() => import("@/pages/tech-admin/MemberAnalytics"));
const WorkAssign = lazy(() => import("@/pages/tech-admin/WorkAssign"));
const Orders = lazy(() => import("@/pages/tech-admin/Orders"));
const Clients = lazy(() => import("@/pages/shared/Clients"));
const FeedbackUpsell = lazy(() => import("@/pages/shared/FeedbackUpsell"));
const MemberAssignments = lazy(() => import("@/pages/tech-admin/MemberAssignments"));
const TeamLeaderWorkAssign = lazy(() => import("@/pages/tech-team-leader/WorkAssign"));
const TeamLeaderMemberAssignments = lazy(() => import("@/pages/tech-team-leader/MemberAssignments"));
const TeamAttendance = lazy(() => import("@/pages/shared/TeamAttendance"));
const MemberProfileDetail = lazy(() => import("@/pages/shared/MemberProfileDetail"));
const HrCenter = lazy(() => import("@/pages/shared/HrCenter"));
const Tools = lazy(() => import("@/pages/shared/Tools"));
const WorkReports = lazy(() => import("@/pages/shared/WorkReports"));
const Payroll = lazy(() => import("@/pages/shared/Payroll"));
const Profit = lazy(() => import("@/pages/shared/Profit"));
const SalesPayroll = lazy(() => import("@/pages/sales-admin/Payroll"));
const SalesMySalary = lazy(() => import("@/pages/sales-member/MySalary"));
const CinematicAds = lazy(() => import("@/pages/tech-admin/CinematicAds"));
const AccountsDashboard = lazy(() => import("@/pages/accounts-admin/Dashboard"));
const RevenueSummary = lazy(() => import("@/pages/accounts-admin/RevenueSummary"));
const DailyExpenses = lazy(() => import("@/pages/accounts-admin/DailyExpenses"));
const SalaryManagement = lazy(() => import("@/pages/accounts-admin/SalaryManagement"));
const PlaceholderPage = lazy(() => import("@/pages/PlaceholderPage"));
const MySalaryPage = lazy(() => import("@/pages/shared/MySalary"));
const MySalaryDashboard = lazy(() => import("@/pages/tech-member/MySalaryDashboard"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const VerifyEmployee = lazy(() => import("@/pages/public/VerifyEmployee"));
const JoinOnboarding = lazy(() => import("@/pages/onboarding/JoinOnboarding"));
const Chat = lazy(() => import("@/pages/shared/Chat"));
const SocialMedia = lazy(() => import("@/pages/shared/SocialMedia"));
const SmmCampaignPage = lazy(() => import("@/pages/shared/SmmCampaignPage"));
const Meeting = lazy(() => import("@/pages/shared/Meeting"));
const AdminChatMonitor = lazy(() => import("@/pages/shared/AdminChatMonitor"));
const ClientChat = lazy(() => import("@/pages/client/ClientChat"));
const ClientChatResume = lazy(() => import("@/pages/client/ClientChat").then((m) => ({ default: m.ClientChatResume })));

const queryClient = new QueryClient();

/**
 * "/" means "wherever this person's day starts", and it carries the query along with it.
 *
 * The query matters because it is how a tapped notification says what it was about — `?call=<id>`
 * is what makes the answer button appear. A notification cannot know the recipient's role, and
 * linking to a role's own route got it wrong in the one case that matters most: a tech admin
 * ringing a member sent that member to `/tech-admin/chat`, which their role is not allowed to
 * open, so answering a call signed them out. Sending everyone to "/" and forwarding both the route
 * and the parameters is the version that cannot be wrong about who is reading it.
 */
/** Shown while a route's chunk is downloading. Deliberately identical to AppLayout's own loader. */
function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="animate-spin text-primary" size={32} />
    </div>
  );
}

function RootRedirect() {
  const { loading } = useAuth();
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (user) return <Navigate to={`${defaultRouteForUser(user)}${location.search}`} replace />;
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
        {/* The half-second while a page's own chunk arrives. Same mark the shell uses, so a
            navigation never flashes something unfamiliar. */}
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />

          {/* The client's chat for one order. Public by design: the customer has no account and
              must never be asked to sign in — or to type anything — to answer a question about
              their own ad. Kept short so it survives being pasted into WhatsApp. */}
          <Route path="/c/:chatId" element={<ClientChat />} />
          {/* Where the installed chat app starts. A manifest is one static file for every
              customer, so it cannot name a chat; this sends them to the last one they opened. */}
          <Route path="/c" element={<ClientChatResume />} />
          <Route path="/c/" element={<ClientChatResume />} />

          {/* Where an ID card's QR lands. Public because the people who check a badge — a client's
              security desk, a landlord, a bank — are by definition outside the company. */}
          <Route path="/verify/:uid" element={<VerifyEmployee />} />

          {/* Becoming an employee. Public by design and for the same reason: the person reading it
              has no account, because the account is what they get for signing. Offer letter, then
              joining letter, then their login — all behind a 4-digit code. */}
          <Route path="/join/:inviteId" element={<JoinOnboarding />} />

          {/*
            Social Media Management — one route, six roles.

            Deliberately NOT role-prefixed like the rest of the app. Everybody on a monthly client
            looks at the same page and the same month, and a prefixed path would need six copies of
            each route plus a way for a notification to guess which one its recipient is allowed to
            open — which is precisely the bug that once signed people out when they answered a call
            (see the header of RootRedirect). One path is right for everyone, and the page scopes
            itself to what the reader may see.
          */}
          <Route element={<AppLayout allowedRoles={[
            "main_admin", "tech_admin", "sales_admin", "tech_member", "sales_member", "tech_team_leader",
          ]} />}>
            <Route path="/smm" element={<SocialMedia />} />
            <Route path="/smm/:campaignId" element={<SmmCampaignPage />} />
          </Route>

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
            <Route path="/tech-admin/hr" element={<HrCenter />} />
            {/* The Agreements page moved into the HR centre. The old path still
                resolves so existing links and bookmarks do not break. */}
            <Route path="/tech-admin/agreements" element={<HrCenter />} />
            <Route path="/tech-admin/drive" element={<DriveManagement />} />
            <Route path="/tech-admin/training" element={<TechTrainingModules />} />
            <Route path="/tech-admin/sessions" element={<TechAdminSessionHistory />} />
            <Route path="/tech-admin/activity" element={<TechActivityHistory />} />
            <Route path="/tech-admin/settings" element={<TechAdminSettings />} />
            <Route path="/tech-admin/salary" element={<MySalaryPage />} />
            <Route path="/tech-admin/work-assign" element={<WorkAssign />} />
            <Route path="/tech-admin/work-assign/:memberId" element={<MemberAssignments />} />
            <Route path="/tech-admin/work-reports" element={<WorkReports />} />
            <Route path="/tech-admin/payroll" element={<Payroll />} />
            <Route path="/tech-admin/profit" element={<Profit />} />
            <Route path="/tech-admin/orders" element={<Orders />} />
            <Route path="/tech-admin/clients" element={<Clients />} />
            {/* How the delivered work was actually received — the WORK half of the feedback is
                this department's own report card. Read-only here: see canRecordFeedback. */}
            <Route path="/tech-admin/feedback-upsell" element={<FeedbackUpsell />} />
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
            <Route path="/sales-admin/client-lookup" element={<ClientLookup />} />
            <Route path="/sales-admin/settlements" element={<Settlements />} />
            <Route path="/sales-admin/payroll" element={<SalesPayroll />} />
            <Route path="/sales-admin/attendance" element={<TeamAttendance />} />
            <Route path="/sales-admin/profit" element={<Profit />} />
            <Route path="/sales-admin/analytics" element={<SalesAnalytics />} />
            <Route path="/sales-admin/training" element={<SalesTrainingModules />} />
            <Route path="/sales-admin/scripts" element={<SalesScripts />} />
            <Route path="/sales-admin/sessions" element={<SalesAdminSessionHistory />} />
            <Route path="/sales-admin/settings" element={<SalesAdminSettings />} />
            <Route path="/sales-admin/hr" element={<HrCenter />} />
            {/* The Agreements page moved into the HR centre. The old path still
                resolves so existing links and bookmarks do not break. */}
            <Route path="/sales-admin/agreements" element={<HrCenter />} />
            <Route path="/sales-admin/leaderboard" element={<Leaderboard />} />
            <Route path="/sales-admin/history" element={<SalesAdminActivityHistory />} />
            <Route path="/sales-admin/clients" element={<Clients />} />
            <Route path="/sales-admin/feedback-upsell" element={<FeedbackUpsell />} />
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
            {/* The seller is on their clients' order chats now — this is where they read them. */}
            <Route path="/sales/client-chats" element={<SalesClientChats />} />
            {/* Their own customers — built from their SALES, not from what has shipped, so a
                client bought this morning is callable this morning. See pages/sales-member/MyClients. */}
            <Route path="/sales/clients" element={<SalesMyClients />} />
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
            <Route path="/team-leader/feedback-upsell" element={<FeedbackUpsell />} />
            {/* A leader reads the same department feed — their own actions are in it. */}
            <Route path="/team-leader/activity" element={<TechActivityHistory />} />
            <Route path="/team-leader/attendance" element={<TeamAttendance />} />
            <Route path="/team-leader/hr" element={<HrCenter />} />
            {/* The Agreements page moved into the HR centre. The old path still
                resolves so existing links and bookmarks do not break. */}
            <Route path="/team-leader/agreements" element={<HrCenter />} />
            {/* A team leader is an employee too — they have HR documents of their own to sign. */}
            <Route path="/team-leader/profile" element={<TechMemberProfile />} />
            <Route path="/team-leader/tools" element={<Tools />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
