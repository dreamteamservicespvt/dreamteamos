import { describe, it, expect } from "vitest";
import { buildCredentialsMessage } from "@/services/memberCredentials";

/**
 * The login message used to tell every member "password and email both are same", which was true
 * for nobody whose password had been set to anything else. These lock down what it says now.
 */
describe("buildCredentialsMessage", () => {
  it("sends the real password when one was stored", () => {
    const msg = buildCredentialsMessage({
      email: "asha@dts.com", password: "Sunrise#42", loginUrl: "https://dts.app",
    });
    expect(msg).toContain("asha@dts.com");
    expect(msg).toContain("Sunrise#42");
    expect(msg).toContain("https://dts.app");
    expect(msg).not.toContain("contact your admin");
  });

  it("never claims a password it does not have", () => {
    const msg = buildCredentialsMessage({ email: "asha@dts.com", password: null, loginUrl: "https://dts.app" });
    expect(msg).toContain("please ask your admin");
    expect(msg).toContain("contact your admin");
    // The old message asserted the password equalled the email. It never should have.
    expect(msg).not.toContain("both are same");
  });

  it("treats an empty stored password as none, not as a blank one to send", () => {
    expect(buildCredentialsMessage({ email: "a@b.com", password: "", loginUrl: "u" }))
      .toContain("please ask your admin");
  });
});
