/**
 * DREAM TEAM AI Development OS — one route for every role (`/dev-os/*`), like `/smm`: one path is right for everyone
 * and the page scopes itself (a learner's own data; the Control Center for the admins). Each section is lazy.
 */
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { DevOsProvider } from "@/components/devos/context";
import { DevOsShell } from "@/components/devos/DevOsShell";
import { Loading } from "@/components/devos/kit";

const HomeView = lazy(() => import("@/components/devos/HomeView"));
const StartView = lazy(() => import("@/components/devos/StartView"));
const PlayView = lazy(() => import("@/components/devos/PlayView"));
const SkillsView = lazy(() => import("@/components/devos/SkillsView"));
const PathView = lazy(() => import("@/components/devos/PathView"));
const CareerView = lazy(() => import("@/components/devos/CareerView"));
const ArenaView = lazy(() => import("@/components/devos/ArenaView"));
const HistoryView = lazy(() => import("@/components/devos/HistoryView"));
const AttemptView = lazy(() => import("@/components/devos/AttemptView"));
const AdminView = lazy(() => import("@/components/devos/admin/AdminView"));

export default function DevOsPage() {
  return (
    <DevOsProvider>
      <DevOsShell>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route index element={<HomeView />} />
            <Route path="start" element={<StartView />} />
            <Route path="play/:taskId" element={<PlayView />} />
            <Route path="skills" element={<SkillsView />} />
            <Route path="path" element={<PathView />} />
            <Route path="rank" element={<CareerView />} />
            <Route path="arena" element={<ArenaView />} />
            <Route path="history" element={<HistoryView />} />
            <Route path="history/:attemptId" element={<AttemptView />} />
            <Route path="admin/*" element={<AdminView />} />
            <Route path="*" element={<Navigate to="/dev-os" replace />} />
          </Routes>
        </Suspense>
      </DevOsShell>
    </DevOsProvider>
  );
}
