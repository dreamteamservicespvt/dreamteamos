import { describe, it, expect } from "vitest";
import {
  ADGEN_ENV_KEY_LIMIT, accountWithKey, aiStudioUrlFor, apiKeyCoverage, apiKeyFingerprint, apiKeyProblem, canHandleApiKey, canSeeAllApiKeys,
  duplicateFingerprints, envFileName, groupKeysByOwner, keyCheckFrom, keysAsEnvFile, keysAsText, maskApiKey, normaliseApiKey, usableKeys,
} from "@/utils/geminiKeys";
import type { FlowAccount, GeminiApiKey } from "@/types/aiAccounts";

/**
 * The Gemini API keys the team makes in its Flow accounts (2026-10-10) — the pure rules: reading a pasted
 * key, saying why it can't be one, what Google's answer means, and the copy / .env a tech admin takes.
 */

const KEY_A = "AIzaSyA0123456789abcdefghijklmnopqrstuv"; // 39 characters
const KEY_B = "AIzaSyB_-ZYXWVUTSRQPONMLKJIHGFEDCBA9876";
const key = (over: Partial<GeminiApiKey>): GeminiApiKey => ({
  id: "a@gmail.com", accountId: "a@gmail.com", accountEmail: "a@gmail.com", key: KEY_A, fingerprint: apiKeyFingerprint(KEY_A),
  ownerId: "ravi", ownerName: "Ravi", addedById: "ravi", addedByName: "Ravi", addedAt: 1, teamAdminId: "admin", status: "working", ...over,
});
const account = (over: Partial<FlowAccount>): FlowAccount => ({
  id: "a@gmail.com", email: "a@gmail.com", phone: "9876543210", createdOn: "2026-10-01", expiresOn: "2028-04-01", monthlyCredits: 1000,
  addedBy: "ravi", addedByName: "Ravi", addedByRole: "tech_member", ownerId: "ravi", ownerName: "Ravi", holderId: "ravi", holderName: "Ravi",
  visibleTo: ["ravi"], teamAdminId: "admin", status: "active", ...over,
});

describe("a pasted key", () => {
  it("is the key alone, whatever came with it", () => {
    expect(KEY_A).toHaveLength(39);
    expect(normaliseApiKey(`  ${KEY_A}\n`)).toBe(KEY_A);
    expect(normaliseApiKey(`API_KEY_3="${KEY_A}"`)).toBe(KEY_A);
    expect(normaliseApiKey(`Here is my key: ${KEY_A} thanks`)).toBe(KEY_A);
    // Copied on a phone, split over two lines.
    expect(normaliseApiKey(`${KEY_A.slice(0, 20)}\n${KEY_A.slice(20)}`)).toBe(KEY_A);
    expect(normaliseApiKey("")).toBe("");
  });

  it("says why it can't be a key, in words a member can act on", () => {
    expect(apiKeyProblem(KEY_A)).toBeNull();
    expect(apiKeyProblem(KEY_B)).toBeNull();
    expect(apiKeyProblem("")).toMatch(/Paste/);
    expect(apiKeyProblem(KEY_A.slice(0, 30))).toMatch(/cut short/);
    expect(apiKeyProblem("ravi.flow01@gmail.com")).toMatch(/email/);
    expect(apiKeyProblem("https://aistudio.google.com/api-keys")).toMatch(/link/);
    expect(apiKeyProblem("hello")).toMatch(/Too short/);
    // A shape Google might use one day goes through — Google's own check decides.
    expect(apiKeyProblem("AQ.Ab8RN6Kx0123456789abcdefghijklmnopqrstuvwxyz")).toBeNull();
  });

  it("has a stable one-way fingerprint, different for every key, and shows only its ends", () => {
    expect(apiKeyFingerprint(KEY_A)).toBe(apiKeyFingerprint(KEY_A));
    expect(apiKeyFingerprint(KEY_A)).not.toBe(apiKeyFingerprint(KEY_B));
    expect(apiKeyFingerprint(KEY_A)).toMatch(/^[0-9a-f]{16}$/);
    expect(apiKeyFingerprint(KEY_A)).not.toContain(KEY_A.slice(4, 10));
    expect(maskApiKey(KEY_A)).toBe("AIzaSyA…stuv");
    expect(maskApiKey("short")).toBe("••••••••");
  });

  it("opens AI Studio in the account it is made in", () => {
    expect(aiStudioUrlFor("ravi.flow01@gmail.com")).toBe("https://aistudio.google.com/api-keys?authuser=ravi.flow01%40gmail.com");
    expect(aiStudioUrlFor()).toBe("https://aistudio.google.com/api-keys");
  });
});

describe("what Google's answer means (the bodies Google sent on 2026-10-10)", () => {
  const invalid = JSON.stringify({ error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] } });
  const leaked = JSON.stringify({ error: { code: 403, message: "Your API key was reported as leaked. Please use another API key.", status: "PERMISSION_DENIED" } });
  const disabled = JSON.stringify({ error: { code: 403, message: "Generative Language API has not been used in project 123 before or it is disabled.", status: "PERMISSION_DENIED", details: [{ reason: "SERVICE_DISABLED" }] } });

  it("works, or is only busy", () => {
    expect(keyCheckFrom(200, "{}")).toEqual({ status: "working" });
    expect(keyCheckFrom(429, "quota")).toEqual({ status: "working" });
  });

  it("is refused — invalid, leaked, turned off — in plain words", () => {
    expect(keyCheckFrom(400, invalid)).toEqual({ status: "failed", message: expect.stringMatching(/not valid/) });
    expect(keyCheckFrom(403, leaked)).toEqual({ status: "failed", message: expect.stringMatching(/reported as leaked/) });
    expect(keyCheckFrom(403, disabled)).toEqual({ status: "failed", message: expect.stringMatching(/turned off/) });
    expect(keyCheckFrom(403, JSON.stringify({ error: { message: "Something new." } }))).toEqual({ status: "failed", message: "Something new." });
    expect(keyCheckFrom(401, "not json")).toEqual({ status: "failed", message: expect.stringMatching(/401/) });
  });

  it("was not reached", () => {
    expect(keyCheckFrom(503, "")).toMatchObject({ status: "unchecked" });
    expect(keyCheckFrom(0, "")).toMatchObject({ status: "unchecked" });
  });
});

describe("a set of keys for AdGen", () => {
  it("copies one per line", () => {
    expect(keysAsText([{ key: KEY_A }, { key: KEY_B }])).toBe(`${KEY_A}\n${KEY_B}`);
  });

  it("downloads as a .env AdGen reads — API_KEY_1, 2 … each under whose account made it", () => {
    const env = keysAsEnvFile([
      { key: KEY_A, ownerName: "Ravi", accountEmail: "a@gmail.com" },
      { key: KEY_B, ownerName: "Anil", accountEmail: "b@gmail.com" },
    ], { date: "10 Oct 2026", byName: "Kiran" });
    expect(env).toContain("# DTS AdGen — Gemini API keys (2)");
    expect(env).toContain("Downloaded 10 Oct 2026 by Kiran");
    expect(env).toContain(`# 1 · Ravi · a@gmail.com\nAPI_KEY_1=${KEY_A}`);
    expect(env).toContain(`# 2 · Anil · b@gmail.com\nAPI_KEY_2=${KEY_B}`);
    expect(env.endsWith("\n")).toBe(true);
    // Every non-comment line is NAME=value — a .env Vercel's paste and Vite both read.
    const lines = env.split("\n").filter((l) => l && !l.startsWith("#"));
    expect(lines).toEqual([`API_KEY_1=${KEY_A}`, `API_KEY_2=${KEY_B}`]);
    expect(envFileName("2026-10-10")).toBe("dts-adgen-gemini-keys-2026-10-10.env");
  });

  it("says where AdGen stops reading when the set is larger than 30", () => {
    const many = Array.from({ length: 32 }, (_, i) => ({ key: `${KEY_A.slice(0, 35)}${String(i).padStart(4, "0")}`, ownerName: "Ravi", accountEmail: `${i}@gmail.com` }));
    const env = keysAsEnvFile(many, { date: "10 Oct 2026" });
    expect(env).toContain(`API_KEY_${ADGEN_ENV_KEY_LIMIT}=`);
    expect(env).toContain("API_KEY_32=");
    expect(env.indexOf("AdGen reads only the first 30")).toBeGreaterThan(env.indexOf("API_KEY_30="));
    expect(env.indexOf("AdGen reads only the first 30")).toBeLessThan(env.indexOf("API_KEY_31="));
  });

  it("leaves out the keys Google refused, and counts them", () => {
    const set = [key({ id: "1" }), key({ id: "2", status: "failed" }), key({ id: "3", status: "unchecked" })];
    expect(usableKeys(set)).toEqual({ keys: [set[0], set[2]], leftOut: 1 });
  });

  it("finds the same key saved on two accounts", () => {
    const fp = apiKeyFingerprint(KEY_A);
    expect([...duplicateFingerprints([{ fingerprint: fp }, { fingerprint: apiKeyFingerprint(KEY_B) }, { fingerprint: fp }, {}])]).toEqual([fp]);
    const accounts = [account({ id: "a", email: "a@gmail.com", apiKey: { fingerprint: fp, status: "working", addedAt: 1 } }), account({ id: "b", email: "b@gmail.com" })];
    expect(accountWithKey(accounts, fp, "b")?.email).toBe("a@gmail.com");
    expect(accountWithKey(accounts, fp, "a")).toBeNull();
  });

  it("lists the keys by person, each person's by account", () => {
    const groups = groupKeysByOwner([
      key({ id: "z", accountEmail: "z@gmail.com", ownerId: "ravi", ownerName: "Ravi" }),
      key({ id: "c", accountEmail: "c@gmail.com", ownerId: "anil", ownerName: "Anil" }),
      key({ id: "b", accountEmail: "b@gmail.com", ownerId: "ravi", ownerName: "Ravi" }),
    ]);
    expect(groups.map((g) => [g.ownerName, g.keys.map((k) => k.id)])).toEqual([["Anil", ["c"]], ["Ravi", ["b", "z"]]]);
  });
});

describe("a member's key progress", () => {
  it("counts working keys over the accounts they opened, and queues the rest — none first, then refused", () => {
    const fp = (k: string) => apiKeyFingerprint(k);
    const accounts = [
      account({ id: "1", email: "1@gmail.com", createdOn: "2026-10-03", apiKey: { fingerprint: fp(KEY_A), status: "working", addedAt: 1 } }),
      account({ id: "2", email: "2@gmail.com", createdOn: "2026-10-05" }),
      account({ id: "3", email: "3@gmail.com", createdOn: "2026-10-01" }),
      account({ id: "4", email: "4@gmail.com", apiKey: { fingerprint: fp(KEY_B), status: "failed", addedAt: 1 } }),
      account({ id: "5", email: "5@gmail.com", ownerId: "anil" }), // assigned to Ravi to use, opened by Anil
    ];
    const c = apiKeyCoverage(accounts, "ravi");
    expect(c).toMatchObject({ total: 4, withKey: 1, failed: 1 });
    expect(c.queue.map((a) => a.id)).toEqual(["3", "2", "4"]);
  });
});

describe("who sees the keys", () => {
  it("the tech admin sees every key; anyone else only the accounts they are shown", () => {
    expect(canSeeAllApiKeys({ role: "tech_admin" })).toBe(true);
    expect(canSeeAllApiKeys({ role: "tech_team_leader" })).toBe(false);
    expect(canSeeAllApiKeys({ role: "tech_member" })).toBe(false);
    const a = account({ visibleTo: ["ravi", "lead"] });
    expect(canHandleApiKey({ uid: "ravi", role: "tech_member" }, a)).toBe(true);
    expect(canHandleApiKey({ uid: "anil", role: "tech_member" }, a)).toBe(false);
    expect(canHandleApiKey({ uid: "other-lead", role: "tech_team_leader" }, a)).toBe(false);
    expect(canHandleApiKey({ uid: "admin", role: "tech_admin" }, a)).toBe(true);
  });
});
