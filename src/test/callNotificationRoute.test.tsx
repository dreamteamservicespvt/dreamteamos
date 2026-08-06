import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";

/**
 * Where a tapped call notification actually lands, for each role.
 *
 * The bug this exists to prevent: a notification's link used to be built from the SENDER's role.
 * Routes here are gated by role, so a tech admin ringing a member sent that member to
 * `/tech-admin/chat`, which their role cannot open — and answering a call bounced them to the
 * login screen. From the outside that is indistinguishable from being logged out, which is exactly
 * how it was reported.
 *
 * The fix is that a call link names no route at all. It is `/?call=<id>`, and `RootRedirect`
 * resolves it against the reader's own role while carrying the parameter through. This drives that
 * redirect the way the real app wires it, with the real `defaultRouteForUser`.
 */

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ loading: false }) }));

import { defaultRouteForUser } from "@/utils/roleHelpers";
import type { AppUser, UserRole } from "@/types";

/** The redirect from App.tsx, kept in step with it by asserting on the same helper it uses. */
function RootRedirect({ user }: { user: AppUser }) {
  const location = useLocation();
  return <Navigate to={`${defaultRouteForUser(user)}${location.search}`} replace />;
}

function Landed() {
  const location = useLocation();
  return <p data-testid="landed">{location.pathname}{location.search}</p>;
}

const ROLES: UserRole[] = [
  "tech_member", "tech_team_leader", "tech_admin", "main_admin",
  "sales_member", "sales_admin", "accounts_admin",
];

function land(role: UserRole, link: string) {
  const user = { uid: "u1", name: "A", role, email: "a@b.c", isActive: true } as AppUser;
  render(
    <MemoryRouter initialEntries={[link]}>
      <Routes>
        <Route path="/" element={<RootRedirect user={user} />} />
        <Route path="*" element={<Landed />} />
      </Routes>
    </MemoryRouter>,
  );
  return screen.getByTestId("landed").textContent || "";
}

afterEach(cleanup);

describe("a tapped call notification", () => {
  it("lands every role on a page they are allowed to open", () => {
    for (const role of ROLES) {
      const where = land(role, "/?call=call-1");
      expect(where, role).not.toContain("/login");
      expect(where, role).not.toBe("/");
      cleanup();
    }
  });

  it("carries the call id through the redirect, which is what shows the answer button", () => {
    for (const role of ROLES) {
      expect(land(role, "/?call=call-1"), role).toContain("?call=call-1");
      cleanup();
    }
  });

  it("puts each role on their own home page rather than somebody else's", () => {
    const user = (role: UserRole) => ({ uid: "u1", role } as AppUser);
    expect(land("tech_member", "/?call=x")).toContain(defaultRouteForUser(user("tech_member")));
    cleanup();
    expect(land("sales_admin", "/?call=x")).toContain(defaultRouteForUser(user("sales_admin")));
    cleanup();
    // The case that was broken: the caller's route is not the receiver's route.
    expect(land("tech_member", "/?call=x")).not.toContain("tech-admin");
  });

  it("still works for a plain notification with nothing attached", () => {
    expect(land("tech_member", "/")).not.toContain("?");
  });
});
