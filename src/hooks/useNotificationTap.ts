/**
 * What happens when somebody taps a notification and the app is already open.
 *
 * The service worker focuses the existing window rather than opening a second one — see
 * public/firebase-messaging-sw.js for why — and then posts here to say where the tap was meant to
 * go. Focusing alone is not enough: the member could be three screens away on Payroll, and a call
 * they deliberately answered has to put the answer button in front of them, not the page they
 * happened to be on.
 *
 * Also carries the "Decline" action from the notification's own buttons, so a member can turn a
 * call down from the lock screen without the app ever coming to the front.
 */
import { useEffect } from "react";
import { doc, updateDoc, type Firestore } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db as staffDb } from "@/services/firebase";

interface SwMessage {
  type?: string;
  link?: string;
  callDocId?: string | null;
}

/**
 * @param dbi Which Firestore instance a decline should be written through. The customer's page
 *   passes its own isolated instance — the staff one is signed in as nobody there, and the write
 *   would be refused by the rules.
 */
export function useNotificationTap(dbi: Firestore = staffDb) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data = (event.data || {}) as SwMessage;

      if (data.type === "call-decline" && data.callDocId) {
        updateDoc(doc(dbi, "calls", data.callDocId), { status: "declined" }).catch(() => {
          // Already ended, or the caller gave up. Either way the ringing has stopped.
        });
        return;
      }

      if (data.type === "notification-click" && data.link) {
        /**
         * Same-origin paths only.
         *
         * A link is data that arrived over the wire, and handing it to `navigate` unchecked is an
         * open redirect. `//evil.example.com` has to be rejected alongside `https://…` — a leading
         * double slash is a protocol-relative URL, which the browser treats as another host while
         * a naive "starts with /" check waves it through.
         */
        const safe = data.link.startsWith("/") && !data.link.startsWith("//");
        navigate(safe ? data.link : "/");
      }
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [navigate, dbi]);
}
