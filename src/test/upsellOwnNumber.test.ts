import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Selling a second thing to your own client.
 *
 * The reported failure: a member sold a client a Google listing in the morning, opened My Clients
 * in the afternoon to add a Wishes video, and was told "Gova Rajulapati sold to this client
 * recently — the number is frozen" — naming them to themselves. The freeze exists so nobody else
 * can take a client off the person who just sold to them; it was never meant to stop that person
 * adding another sale, which is the ordinary thing this business does all day and which My Leads
 * has always allowed.
 */

const lock = vi.fn();
const claim = vi.fn();

vi.mock("@/services/numberLock", () => ({
  fetchNumberLock: (...a: unknown[]) => lock(...a),
  claimNumber: (...a: unknown[]) => claim(...a),
}));

const { startUpsell } = await import("@/services/upsell");

const me = { uid: "sales1", name: "Gova" };

beforeEach(() => { lock.mockReset(); claim.mockReset(); });

describe("upselling a number the member already owns", () => {
  it("opens their existing lead even though their own sale froze it", async () => {
    lock.mockResolvedValue({
      ownerId: "sales1",
      ownerLeadId: "lead-1",
      saleFrozen: true,
      saleFrozenUntil: { seconds: Math.floor(Date.now() / 1000) + 86400 },
      saleById: "sales1",
      saleByName: "Gova",
    });

    const result = await startUpsell({ user: me, phone: "+919949736381" });

    expect(result.ok).toBe(true);
    expect(result.leadId).toBe("lead-1");
  });

  /** The ordinary path must not write. Claiming a number that is already yours changes nothing. */
  it("does not touch the number lock when it is already theirs", async () => {
    lock.mockResolvedValue({ ownerId: "sales1", ownerLeadId: "lead-1" });

    await startUpsell({ user: me, phone: "+919949736381" });

    expect(claim).not.toHaveBeenCalled();
  });

  it("claims the number when it is not theirs yet", async () => {
    lock.mockResolvedValue(null);
    claim.mockResolvedValue({ kind: "created", leadId: "lead-new" });

    const result = await startUpsell({ user: me, phone: "+919949736381" });

    expect(claim).toHaveBeenCalled();
    expect(result.leadId).toBe("lead-new");
  });

  /** Somebody else's freeze still holds — that is the protection working. */
  it("still refuses a number another member has just sold to", async () => {
    lock.mockResolvedValue({ ownerId: "sales2", ownerLeadId: "lead-2" });
    claim.mockResolvedValue({
      kind: "sale_frozen",
      saleByName: "Priya",
      until: new Date("2026-08-14T00:00:00"),
    });

    const result = await startUpsell({ user: me, phone: "+919949736381" });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Priya");
  });

  it("refuses politely when there is no phone number to sell to", async () => {
    const result = await startUpsell({ user: me, phone: "" });
    expect(result.ok).toBe(false);
    expect(lock).not.toHaveBeenCalled();
  });

  /**
   * A lock that says the number is theirs but names no lead cannot be opened, and inventing one
   * would leave a duplicate for the number-lock machinery to reconcile later.
   */
  it("falls through to a claim when the lock names no lead", async () => {
    lock.mockResolvedValue({ ownerId: "sales1", ownerLeadId: null });
    claim.mockResolvedValue({ kind: "already_yours" });
    lock.mockResolvedValueOnce({ ownerId: "sales1", ownerLeadId: null });

    const result = await startUpsell({ user: me, phone: "+919949736381" });

    expect(claim).toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });
});
