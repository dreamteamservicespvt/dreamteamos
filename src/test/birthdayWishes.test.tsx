import { describe, it, expect } from "vitest";
import { configure, render, screen } from "@testing-library/react";
import { BirthdayGreetingCard, BirthdayTeamStrip } from "@/components/birthday/BirthdayCards";

// This codebase marks test hooks with `data-test`, not `data-testid`.
configure({ testIdAttribute: "data-test" });

/**
 * The half of the birthday feature that people actually touch.
 *
 * The maths of "whose birthday is it" is covered in birthdays.test.ts. What is covered here is
 * the thing that was missing before there was a button at all: the team is told who to wish AND
 * given a working way to do it, with a message that is already written and a link that goes to
 * the right number.
 */

const today = new Date("2026-08-02T09:00:00");

describe("what the team sees", () => {
  it("puts a WhatsApp link on the right number, with the wish already written", () => {
    render(
      <BirthdayTeamStrip
        people={[{ uid: "u1", name: "Asha Devi", phone: "9876543210", dob: "1996-08-02" }]}
        senderName="Ravi Kumar"
      />,
    );

    const link = screen.getByTestId("send-wishes") as HTMLAnchorElement;
    expect(link.textContent).toContain("Send wishes to Asha");
    // A bare 10-digit Indian number must still reach a real wa.me address.
    expect(link.href).toContain("wa.me/919876543210");
    expect(decodeURIComponent(link.href)).toContain("Happy Birthday, Asha!");
    expect(decodeURIComponent(link.href)).toContain("Ravi Kumar");
    // Opens WhatsApp rather than replacing the app the sender is standing in.
    expect(link.target).toBe("_blank");
  });

  it("asks people to wish in person rather than offering a link to nowhere", () => {
    render(<BirthdayTeamStrip people={[{ uid: "u1", name: "Asha Devi", phone: null }]} />);
    expect(screen.queryByTestId("send-wishes")).toBeNull();
    expect(screen.getByText(/Wish Asha in person/)).toBeTruthy();
  });

  it("gives every celebrant their own button on a day with two birthdays", () => {
    render(
      <BirthdayTeamStrip
        people={[
          { uid: "u1", name: "Asha Devi", phone: "9876543210" },
          { uid: "u2", name: "Ravi Kumar", phone: "9876500000" },
        ]}
        senderName="Kiran"
      />,
    );
    const links = screen.getAllByTestId("send-wishes");
    expect(links).toHaveLength(2);
    expect(screen.getByText(/Asha Devi and Ravi Kumar/)).toBeTruthy();
  });

  it("shows nothing at all when nobody is celebrating", () => {
    const { container } = render(<BirthdayTeamStrip people={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("what the birthday person sees", () => {
  it("greets them by first name and says the age when it is known", () => {
    render(<BirthdayGreetingCard name="Asha Devi" dob="1996-08-02" today={today} />);
    expect(screen.getByText(/Happy Birthday, Asha!/)).toBeTruthy();
    expect(screen.getByText("30 today")).toBeTruthy();
    expect(screen.getByText(/from everyone at Dream Team Services/)).toBeTruthy();
  });

  it("still greets someone whose year of birth nobody recorded", () => {
    render(<BirthdayGreetingCard name="Asha Devi" dob={null} today={today} />);
    expect(screen.getByText(/Happy Birthday, Asha!/)).toBeTruthy();
    expect(screen.queryByText(/today$/)).toBeNull();
  });
});
