import { describe, it, expect } from "vitest";
import { invitationProblem, invitationTypeLabel } from "@/utils/foreverInvitations";
import { buildClientSaleMessage } from "@/utils/salesMessage";
import { getCategoryMeta } from "@/utils/serviceCatalog";

const inv = { clientName: "Ravi", clientPhone: "9876543210", type: "wedding", customType: null, templateName: "Royal Gold" };

describe("Forever Invitations (2026-11-19)", () => {
  it("is a one-time, non-ad service with a typed amount", () => {
    const c = getCategoryMeta("forever_invitations");
    expect(c?.label).toBe("Forever Invitations");
    expect(c?.fromAd).toBe(false);
    expect(c?.packages).toEqual([]);
  });
  it("asks for every field, and the custom type when Custom", () => {
    expect(invitationProblem(inv)).toBeNull();
    expect(invitationProblem({ ...inv, templateName: " " })).toMatch(/template/);
    expect(invitationProblem({ ...inv, type: "custom" })).toMatch(/custom/);
    expect(invitationTypeLabel({ type: "custom", customType: "Retirement" })).toBe("Retirement");
  });
  it("sends the client the invitation message", () => {
    const msg = buildClientSaleMessage({ phone: "+919876543210" } as never, { category: "forever_invitations", amount: 999, invitation: inv } as never);
    expect(msg).toContain("Ravi");
    expect(msg).toContain("Royal Gold");
    expect(msg).toContain("Wedding");
    expect(msg).toContain("₹999");
    expect(msg).toContain("within 24 hours");
    expect(msg).toContain("share your invitation soon. 🚀");
    expect(msg).not.toContain("Your ad details");
  });
});
