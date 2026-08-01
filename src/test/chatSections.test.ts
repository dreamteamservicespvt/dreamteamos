import { describe, it, expect } from "vitest";
import {
  CHATTABLE_ROLES, CHAT_SECTIONS, defaultChatSection, getChatContactRoles, inChatSection,
} from "@/utils/chatHelpers";
import type { UserRole } from "@/types";

const EVERY_ROLE: UserRole[] = [
  "main_admin", "tech_admin", "sales_admin", "accounts_admin",
  "tech_team_leader", "tech_member", "sales_member",
];

describe("who can chat with whom", () => {
  it("is everybody, whoever is asking", () => {
    // The old per-role allow-list meant a sales member could not message the tech member building
    // their client's ad. The people doing the work know who they need.
    for (const role of EVERY_ROLE) {
      expect(getChatContactRoles(role)).toEqual(CHATTABLE_ROLES);
    }
  });

  it("covers every role the platform has, so nobody is unreachable", () => {
    for (const role of EVERY_ROLE) expect(CHATTABLE_ROLES).toContain(role);
  });
});

describe("the section the list opens on", () => {
  it("is the reader's own team", () => {
    expect(defaultChatSection("sales_member")).toBe("sales");
    expect(defaultChatSection("sales_admin")).toBe("sales");
    expect(defaultChatSection("tech_member")).toBe("tech");
    expect(defaultChatSection("tech_team_leader")).toBe("tech");
    expect(defaultChatSection("tech_admin")).toBe("tech");
  });

  it("is everyone for those who belong to no single team", () => {
    expect(defaultChatSection("main_admin")).toBe("all");
    expect(defaultChatSection("accounts_admin")).toBe("all");
    expect(defaultChatSection(undefined)).toBe("all");
  });

  it("always names a section that exists", () => {
    for (const role of [...EVERY_ROLE, undefined]) {
      expect(CHAT_SECTIONS.some((s) => s.key === defaultChatSection(role))).toBe(true);
    }
  });
});

describe("which section a contact falls in", () => {
  it("puts people with their team", () => {
    expect(inChatSection("sales_member", "sales")).toBe(true);
    expect(inChatSection("sales_member", "tech")).toBe(false);
    expect(inChatSection("tech_team_leader", "tech")).toBe(true);
  });

  it("lists an admin under both their team and Admins, which is where people look", () => {
    expect(inChatSection("tech_admin", "tech")).toBe(true);
    expect(inChatSection("tech_admin", "admins")).toBe(true);
    expect(inChatSection("sales_admin", "sales")).toBe(true);
    expect(inChatSection("sales_admin", "admins")).toBe(true);
  });

  it("puts everyone in Everyone", () => {
    for (const role of EVERY_ROLE) expect(inChatSection(role, "all")).toBe(true);
  });

  it("says no rather than throwing for an unknown role", () => {
    expect(inChatSection(undefined, "all")).toBe(false);
    expect(inChatSection("some_future_role", "all")).toBe(false);
  });
});
