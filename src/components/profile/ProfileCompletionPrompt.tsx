/**
 * "We still need a few things from you" — asked once a day until it is answered.
 *
 * ── Why it collects rather than redirects ─────────────────────────────────────────────────────
 * The obvious version of this popup lists what is missing and links to the profile page. It does
 * not work: the person is mid-check-in, they tap through, land on a page of tabs, and the address
 * field is three clicks away. So the fields are here, in the popup, and each one saves the moment
 * it is filled — partial progress is kept even if they close it after two answers.
 *
 * ── Why it is dismissible THREE TIMES, and then not ───────────────────────────────────────────
 * A blocking gate on day one would stop someone working because they cannot photograph their PAN
 * card at 9am, so "I'll do it later" is honoured for the rest of that day and the prompt returns
 * tomorrow. But an unlimited later is not a nag, it is an opt-out: members pressed it every
 * morning for months and payroll ran for people with no PAN and no account to pay into.
 *
 * So the budget is three, counted from the first time the prompt was ever shown and held ON THE
 * EMPLOYMENT RECORD — not in localStorage, which a new phone or a private window resets. Once it
 * is spent the dialog has no dismiss button: the only way past it is to finish the pack. Three
 * covers not having the card to hand, not having a photo, and one bad morning, which is every
 * honest reason for putting it off.
 *
 * ── Why it asks only what is missing, but does not shrink while you use it ────────────────────
 * Somebody who has given eight of twelve things should see four fields, not a twelve-field form
 * with eight already filled — so the questions are chosen from what is outstanding when the
 * dialog opens. They are then FIXED for the session. Rebuilding the list live looked tidy and was
 * awful to use: uploading an Aadhaar made its row disappear mid-interaction, with no way to see
 * what had gone up or to swap the wrong file. Now each answered row stays, ticked, with View /
 * Replace / Remove on the ones that hold a file.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle, Camera, Check, CheckCircle2, ClipboardList, Eye, FileText, FileUp, Loader2,
  PenTool, RefreshCw, Trash2,
} from "lucide-react";
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/hooks/use-toast";
import { uploadToCloudinary } from "@/services/cloudinary";
import {
  addKycDocument, removeKycDocument, saveEmployeeProfile, watchEmployeeProfile,
} from "@/services/hr";
import { cleanId, departmentOfRole, isValidAadhaar, isValidPan } from "@/utils/hrPolicy";
import {
  MAX_PROFILE_DEFERRALS, PROMPT_STEPS, canDeferProfilePrompt, deferralsLeft, joinName,
  needsProfilePrompt, profilePromptDismissedKey, promptCompletion, splitName,
} from "@/utils/profileCompletion";
import { isBankComplete, payoutSummary, watchEmployeeBank } from "@/services/payroll";
import type { EmployeeBank } from "@/types/payroll";
import BankDetailsModal from "@/components/payroll/BankDetailsModal";
import { Wallet } from "lucide-react";
import type { ProfileStep, ProfileStepKey } from "@/utils/profileCompletion";
import type { EmployeeProfile } from "@/types/hr";
import ImageCropper from "@/components/ImageCropper";
import MemberAvatar from "@/components/MemberAvatar";

/** Same ceiling as the profile photo upload — a phone photo is refused before it is sent. */
const MAX_BYTES = 5 * 1024 * 1024;

interface Draft {
  givenName: string;
  surname: string;
  personalEmail: string;
  dob: string;
  bloodGroup: string;
  currentAddress: string;
  permanentAddress: string;
  emergencyName: string;
  emergencyRelation: string;
  emergencyPhone: string;
  pan: string;
  aadhaar: string;
}

const EMPTY_DRAFT: Draft = {
  givenName: "", surname: "", personalEmail: "", dob: "", bloodGroup: "",
  currentAddress: "", permanentAddress: "",
  emergencyName: "", emergencyRelation: "", emergencyPhone: "", pan: "", aadhaar: "",
};

/** The draft as it stands on the server — used both to seed the form and to spot unsaved edits. */
function draftFromProfile(name: string | undefined, profile: EmployeeProfile): Draft {
  const { given, surname } = splitName(name, profile.surname);
  return {
    givenName: given,
    surname,
    personalEmail: profile.personalEmail || "",
    dob: profile.dob || "",
    bloodGroup: profile.bloodGroup || "",
    currentAddress: profile.currentAddress || "",
    permanentAddress: profile.permanentAddress || "",
    emergencyName: profile.emergencyContact?.name || "",
    emergencyRelation: profile.emergencyContact?.relation || "",
    emergencyPhone: profile.emergencyContact?.phone || "",
    pan: profile.pan || "",
    aadhaar: profile.aadhaar || "",
  };
}

function readFlag(key: string): boolean {
  try { return localStorage.getItem(key) === "1"; } catch { return false; }
}
function writeFlag(key: string) {
  try { localStorage.setItem(key, "1"); } catch { /* private mode — ask again, no harm */ }
}

export default function ProfileCompletionPrompt() {
  const user = useAuthStore((s) => s.user);
  const setStoreUser = useAuthStore((s) => s.setUser);
  const { toast } = useToast();

  const today = format(new Date(), "yyyy-MM-dd");
  const department = departmentOfRole(user?.role) || "tech";

  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<ProfileStepKey | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [justFinished, setJustFinished] = useState(false);
  /** Payout details live in their own collection — see the `payout` step in profileCompletion. */
  const [bank, setBank] = useState<EmployeeBank | null>(null);
  const [bankOpen, setBankOpen] = useState(false);

  /**
   * The latest record, readable synchronously.
   *
   * `addKycDocument` rewrites the whole documents array from the copy it is handed. Both card
   * uploads are on screen together here, so picking the second file before the first snapshot has
   * landed in React state would write an array that never contained the first — silently losing
   * the PAN card the member just uploaded. The ref is written in the watcher callback, so it is
   * never a render behind.
   */
  const profileRef = useRef<EmployeeProfile | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const signatureInput = useRef<HTMLInputElement>(null);
  const panInput = useRef<HTMLInputElement>(null);
  const aadhaarInput = useRef<HTMLInputElement>(null);
  const inputFor: Record<string, React.RefObject<HTMLInputElement>> = {
    panCard: panInput, aadhaarCard: aadhaarInput,
  };

  const eligible = needsProfilePrompt(user);

  useEffect(() => {
    if (!user?.uid || !eligible) return;
    setDismissed(readFlag(profilePromptDismissedKey(user.uid, today)));
    const unsubs = [
      watchEmployeeProfile(user.uid, department, (p) => { profileRef.current = p; setProfile(p); }),
      watchEmployeeBank(user.uid, setBank),
    ];
    return () => unsubs.forEach((u) => u());
  }, [user?.uid, eligible, department, today]);

  /**
   * Tech members meet a mandatory check-in gate on their first open of the day. Asking them for
   * their PAN card on top of it would be two modals deep before they have marked attendance — so
   * this waits for the check-in and then asks. It is the same moment, one step later.
   *
   * The query is the one DailyCheckinPrompt already listens to, so Firestore serves both from a
   * single target rather than charging twice.
   */
  const [checkedIn, setCheckedIn] = useState<boolean | null>(null);
  const waitsForCheckIn = user?.role === "tech_member";

  useEffect(() => {
    if (!user?.uid || !eligible || !waitsForCheckIn) { setCheckedIn(true); return; }
    return onSnapshot(
      query(
        collection(db, "daily_checkins"),
        where("memberId", "==", user.uid),
        where("date", "==", today),
      ),
      (snap) => setCheckedIn(!snap.empty),
      // A permission or network failure must not silently retire the prompt for that member.
      () => setCheckedIn(true),
    );
  }, [user?.uid, eligible, waitsForCheckIn, today]);

  const bankComplete = isBankComplete(bank);
  const completion = useMemo(
    () => promptCompletion(user, profile, { bankComplete }),
    [user, profile, bankComplete],
  );

  /**
   * The budget, and whether it is spent.
   *
   * Read from the record so it survives a new device. `canDefer` is what removes the dismiss
   * button entirely — a disabled button that does nothing is a worse explanation than no button
   * and a sentence saying why.
   */
  const canDefer = canDeferProfilePrompt(profile);
  const left = deferralsLeft(profile);

  /**
   * The draft is seeded ONCE, from the first snapshot, and never again.
   *
   * It used to re-seed on every snapshot. Uploading a PAN card writes to Firestore, the snapshot
   * comes straight back, and the effect overwrote the draft with the stored record — silently
   * wiping the address, the emergency contact and everything else the member had typed but not
   * yet pressed Save on. They then had to type it all a second time. Anything arriving from the
   * server after this point is already reflected in `profile`; the draft belongs to the person
   * typing into it.
   */
  const seeded = useRef(false);
  useEffect(() => {
    if (!profile || seeded.current) return;
    seeded.current = true;
    setDraft(draftFromProfile(user?.name, profile));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  /**
   * Whether anything typed is not yet on the server.
   *
   * Files and the photo save the instant they are picked; the text boxes wait for Save. That
   * split is not obvious from looking at the form, so it is said out loud rather than left for
   * someone to discover by closing the dialog and losing an address.
   */
  const dirty = useMemo(() => {
    if (!profile) return false;
    const stored = draftFromProfile(user?.name, profile);
    return (Object.keys(stored) as (keyof Draft)[]).some((k) => draft[k].trim() !== stored[k].trim());
  }, [draft, profile, user?.name]);

  /**
   * Which questions this session asks — fixed when the prompt opens.
   *
   * Rendering "whatever is missing right now" meant a field vanished the instant it was answered:
   * upload the Aadhaar and the row disappeared mid-interaction, with no way to check what had
   * gone up or to swap the wrong file. Freezing the list at open keeps every answered item on
   * screen with a tick beside it — visible, viewable and replaceable — while items that were
   * already complete before opening stay hidden, which is the whole point of a short form.
   */
  const [sessionKeys, setSessionKeys] = useState<ProfileStepKey[] | null>(null);
  useEffect(() => {
    if (!profile || sessionKeys) return;
    setSessionKeys(completion.missing.map((s) => s.key));
  }, [profile, sessionKeys, completion.missing]);

  const sessionSteps = useMemo(
    () => (sessionKeys ? PROMPT_STEPS.filter((s) => sessionKeys.includes(s.key)) : []),
    [sessionKeys],
  );

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  // A blank identifier is fine — the papers do not always arrive on day one. A malformed one is
  // not: it surfaces when payroll or a statutory filing needs it, which is far too late.
  const panError = draft.pan.trim() && !isValidPan(draft.pan) ? "PAN should look like ABCDE1234F." : "";
  const aadhaarError = draft.aadhaar.trim() && !isValidAadhaar(draft.aadhaar)
    ? "That is not a valid Aadhaar number — check the 12 digits." : "";

  const actor = { uid: user?.uid || "", name: user?.name || "" };

  /**
   * Spend one of the three, and record the day the counting started.
   *
   * The write is awaited only for its side effect on the record; the dialog closes either way,
   * because a failed counter must never trap somebody behind a modal they were entitled to defer.
   */
  const handleLater = async () => {
    if (!user?.uid) return;
    // Finishing is not deferring — "Close" on the completed state always works.
    if (completion.complete) { setDismissed(true); return; }
    if (!canDefer) return;
    writeFlag(profilePromptDismissedKey(user.uid, today));
    setDismissed(true);
    try {
      // The date rides along with the first deferral rather than being stamped when the prompt
      // mounts. A mount-time write costs a Firestore write per member for a date that only ever
      // annotates the count — and the count is the rule. A deferral can only happen while the
      // prompt is on screen, so the first one IS the first sighting for every practical purpose.
      await saveEmployeeProfile(user.uid, {
        profilePromptFirstShownOn: profile?.profilePromptFirstShownOn || today,
        profilePromptDeferrals: (Number(profile?.profilePromptDeferrals) || 0) + 1,
      }, actor);
    } catch {
      // Silent: the member has already been let through, and the count is retried next time.
    }
  };


  // ── The photo. Cropped square first, then written to BOTH copies: the HR photograph the ID
  //    card prints and the avatar every other screen already reads. ──────────────────────────
  const handlePickPhoto = (file: File) => {
    if (photoInput.current) photoInput.current.value = "";
    if (!file.type.startsWith("image/")) {
      toast({ title: "Pick an image", description: "A profile photo has to be an image file.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: "Too large", description: "Please choose a photo under 5 MB.", variant: "destructive" });
      return;
    }
    setPendingPhoto(file);
  };

  const handleCroppedPhoto = async (file: File) => {
    setPendingPhoto(null);
    if (!user) return;
    setUploading("photo");
    try {
      const url = await uploadToCloudinary(file);
      // One write: saveEmployeeProfile mirrors the photograph onto `users.avatar` itself, so the
      // face lands on the ID card and in the topbar together (see services/hr.mirrorPhotoToUser).
      await saveEmployeeProfile(user.uid, { photoUrl: url }, actor);
      setStoreUser({ ...user, avatar: url });
      toast({ title: "Photo saved", description: "It now shows everywhere you appear." });
    } catch {
      toast({ title: "Upload failed", description: "Could not save the photo. Try again.", variant: "destructive" });
    } finally {
      setUploading(null);
    }
  };

  /**
   * The signature, photographed off paper.
   *
   * Not cropped and not squared: a signature is a wide, short thing, and forcing it through the
   * avatar cropper would cut the ends off the very name it exists to show.
   */
  const handleSignature = async (file?: File) => {
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Pick an image", description: "Upload a photo or screenshot of your signature.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: "Too large", description: "Please choose an image under 5 MB.", variant: "destructive" });
      return;
    }
    setUploading("signature");
    try {
      const url = await uploadToCloudinary(file);
      await saveEmployeeProfile(user.uid, { signatureUrl: url, signatureUpdatedAt: serverTimestamp() }, actor);
      toast({ title: "Signature saved", description: "It will be used on the letters the company issues you." });
    } catch {
      toast({ title: "Upload failed", description: "Could not save your signature. Try again.", variant: "destructive" });
    } finally {
      setUploading(null);
    }
  };

  /** The file already on record for an upload step, if any. */
  const uploadedFor = (step: ProfileStep) =>
    step.docKind
      ? (profile?.kycDocuments || []).filter((d) => d.kind === step.docKind).slice(-1)[0]
      : undefined;

  /**
   * Take a wrong file back off the record.
   *
   * There was no way to do this before: once a file went up the row disappeared, so a member who
   * photographed the wrong side of their Aadhaar had no route back short of asking an admin.
   */
  const handleRemoveUpload = async (step: ProfileStep) => {
    const current = profileRef.current || profile;
    const existing = uploadedFor(step);
    if (!current || !existing || uploading) return;
    setUploading(step.key);
    try {
      await removeKycDocument(current, existing.id, actor);
      toast({ title: "Removed", description: `${step.label} taken off your record.` });
    } catch {
      toast({ title: "Error", description: "Could not remove the file. Try again.", variant: "destructive" });
    } finally {
      setUploading(null);
    }
  };

  const handleUpload = async (step: ProfileStep, file?: File) => {
    const current = profileRef.current || profile;
    if (!file || !current || !step.docKind) return;
    if (file.size > MAX_BYTES) {
      toast({ title: "Too large", description: "Please choose a file under 5 MB.", variant: "destructive" });
      return;
    }
    setUploading(step.key);
    try {
      const url = await uploadToCloudinary(file);
      // Re-read after the upload too: it takes seconds, and the other card may have landed.
      await addKycDocument(profileRef.current || current, {
        id: `${Date.now()}`,
        kind: step.docKind,
        label: file.name,
        url,
        uploadedByName: actor.name,
      }, actor);
      toast({ title: "Uploaded", description: `${step.label} added to your record.` });
    } catch {
      toast({ title: "Error", description: `Could not upload your ${step.label.toLowerCase()}.`, variant: "destructive" });
    } finally {
      setUploading(null);
    }
  };

  const handleSave = async () => {
    if (!user || saving) return;
    if (panError || aadhaarError) {
      toast({ title: "Check the ID numbers", description: panError || aadhaarError, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const wasMissing = completion.missing.length;
      const fullName = joinName(draft.givenName, draft.surname);

      await saveEmployeeProfile(user.uid, {
        surname: draft.surname.trim() || null,
        personalEmail: draft.personalEmail.trim() || null,
        dob: draft.dob || null,
        bloodGroup: draft.bloodGroup.trim() || null,
        currentAddress: draft.currentAddress.trim() || null,
        permanentAddress: draft.permanentAddress.trim() || null,
        pan: cleanId(draft.pan) || null,
        aadhaar: cleanId(draft.aadhaar) || null,
        emergencyContact: draft.emergencyPhone.trim()
          ? {
            name: draft.emergencyName.trim(),
            relation: draft.emergencyRelation.trim(),
            phone: draft.emergencyPhone.trim(),
          }
          : null,
      }, actor);

      // The account carries the name everything else reads — chat, the leaderboard, payslips,
      // every letter the company issues. Adding a surname here has to reach all of them, or the
      // ID card would print a full name the topbar disagrees with.
      if (fullName && fullName !== user.name) {
        await updateDoc(doc(db, "users", user.uid), { name: fullName, updatedAt: serverTimestamp() });
        setStoreUser({ ...user, name: fullName });
      }

      toast({
        title: "Saved",
        description: wasMissing > 0 ? "Thank you — your record is up to date." : "Your details were saved.",
      });
    } catch {
      toast({ title: "Error", description: "Could not save your details. Try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  /**
   * The moment the last item lands, say so and get out of the way. Without this the prompt would
   * simply vanish mid-interaction, which reads as a crash rather than as finishing.
   *
   * ── Why it is gated on what was outstanding AT OPEN ───────────────────────────────────────────
   * "That's everything — thank you!" is a reply to somebody who just finished. It used to fire on
   * `completion.complete` alone, which is also true of every member who finished weeks ago — so
   * they were congratulated again on every single load, for ever. (The dismissal flag could not
   * stop it: it is keyed by day, and "Close" on the completed state deliberately does not spend a
   * deferral, so it wrote nothing at all.)
   *
   * `sessionKeys` is the list of items missing when this prompt loaded. Empty means the record was
   * already complete before they arrived — there is nothing to announce, so nothing is shown. It
   * is only non-empty for someone who genuinely had things outstanding, and only they see the
   * thank-you, exactly once, at the moment the last one lands.
   */
  useEffect(() => {
    if (!profile || !eligible || dismissed) return;
    // Null means the list has not been frozen yet (it is set from the first snapshot, one render
    // earlier than this effect can see it). Waiting a render is right; assuming is not.
    if (!sessionKeys || sessionKeys.length === 0) return;
    if (completion.complete) {
      setJustFinished(true);
      const timer = setTimeout(() => setJustFinished(false), 2600);
      return () => clearTimeout(timer);
    }
  }, [completion.complete, profile, eligible, dismissed, sessionKeys]);

  if (!user || !eligible) return null;
  // Nothing is shown until the record has actually loaded — a prompt that flashes up and then
  // disappears because the data arrived late is worse than one that appears a beat later.
  if (!profile) return null;
  if (!checkedIn) return null;
  if (dismissed) return null;
  if (completion.complete && !justFinished) return null;

  // Asked this session — answered or not. See sessionKeys for why it is not "missing right now".
  const show = (key: ProfileStepKey) => sessionSteps.some((s) => s.key === key);
  const stepOf = (key: ProfileStepKey) => sessionSteps.find((s) => s.key === key)!;
  /** Live state of one asked question, for the tick beside its label. */
  const isDone = (key: ProfileStepKey) => {
    const step = PROMPT_STEPS.find((s) => s.key === key);
    return !!(step && profile && step.has(profile, user, { bankComplete }));
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        // Below the check-in gate (z-50) and the unsigned-agreement gate (z-55). Those two stop
        // someone working; this one only asks, so it never covers them.
        className="fixed inset-0 z-[45] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-4"
        data-test="profile-completion-prompt"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        >
          {/* Header + progress */}
          <div className="shrink-0 border-b border-border px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                {completion.complete ? <CheckCircle2 size={20} /> : <ClipboardList size={20} />}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-display font-bold text-foreground">
                  {completion.complete ? "That's everything — thank you!" : `Complete your profile, ${user.name.split(" ")[0]}`}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {completion.complete
                    ? "Your employment record is complete. You will not be asked again."
                    : `${completion.missing.length} ${completion.missing.length === 1 ? "thing is" : "things are"} still missing from your employment record.`}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${completion.complete ? "bg-success" : "bg-primary"}`}
                  style={{ width: `${completion.percent}%` }}
                />
              </div>
              <span className="shrink-0 text-[11px] font-semibold text-muted-foreground" data-test="profile-progress">
                {completion.done} of {completion.total}
              </span>
            </div>
          </div>

          {/* Only what is still missing */}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {completion.complete ? (
              <div className="flex flex-col items-center py-6 text-center">
                <CheckCircle2 size={40} className="text-success" />
                <p className="mt-3 text-sm text-muted-foreground">
                  Everything the company needs is now on file. Your ID card is ready in
                  My&nbsp;Profile.
                </p>
              </div>
            ) : (
              <>
                {show("fullName") && (
                  <Row step={stepOf("fullName")} done={isDone("fullName")}>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Text
                        value={draft.givenName} placeholder="Name" onChange={(v) => set("givenName", v)}
                        test="prompt-given-name"
                      />
                      <Text
                        value={draft.surname} placeholder="Surname" onChange={(v) => set("surname", v)}
                        test="prompt-surname"
                      />
                    </div>
                    {/* Shown back to them, because this is the string that gets printed. */}
                    {joinName(draft.givenName, draft.surname) && (
                      <p className="mt-1.5 text-[11px] text-muted-foreground" data-test="prompt-name-preview">
                        Will be saved as{" "}
                        <span className="font-semibold text-foreground">
                          {joinName(draft.givenName, draft.surname)}
                        </span>
                      </p>
                    )}
                  </Row>
                )}

                {show("photo") && (
                  <Row step={stepOf("photo")} done={isDone("photo")}>
                    <div className="flex items-center gap-3">
                      <MemberAvatar name={user.name} avatar={user.avatar} size={52} />
                      <button
                        type="button"
                        onClick={() => photoInput.current?.click()}
                        disabled={uploading === "photo"}
                        data-test="prompt-upload-photo"
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
                      >
                        {uploading === "photo"
                          ? <Loader2 size={13} className="animate-spin" />
                          : <Camera size={13} />}
                        {uploading === "photo" ? "Uploading…" : "Choose photo"}
                      </button>
                      <input
                        ref={photoInput} type="file" accept="image/*" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePickPhoto(f); }}
                      />
                    </div>
                  </Row>
                )}

                {show("signature") && (
                  <Row step={stepOf("signature")} done={isDone("signature")}>
                    {/* Said as steps, because "upload your signature" is the one instruction people
                        answer by scribbling on the screen with a fingertip. */}
                    <ol className="mb-2 space-y-0.5 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                      <li>1. Sign your name on a plain white sheet of paper.</li>
                      <li>2. Take a clear photo of it, or screenshot it.</li>
                      <li>3. Upload that image here.</li>
                    </ol>
                    <div className="flex flex-wrap items-center gap-3">
                      {profile?.signatureUrl && (
                        <img
                          src={profile.signatureUrl}
                          alt="Your signature"
                          data-test="prompt-signature-preview"
                          className="h-14 rounded-lg border border-border bg-white object-contain px-2"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => signatureInput.current?.click()}
                        disabled={uploading === "signature"}
                        data-test="prompt-upload-signature"
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
                      >
                        {uploading === "signature"
                          ? <Loader2 size={13} className="animate-spin" />
                          : <PenTool size={13} />}
                        {uploading === "signature"
                          ? "Uploading…"
                          : profile?.signatureUrl ? "Replace signature" : "Upload signature"}
                      </button>
                      <input
                        ref={signatureInput} type="file" accept="image/*" className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          handleSignature(f);
                        }}
                      />
                    </div>
                  </Row>
                )}

                {show("personalEmail") && (
                  <Row step={stepOf("personalEmail")} done={isDone("personalEmail")}>
                    <Text
                      type="email" value={draft.personalEmail} placeholder={stepOf("personalEmail").placeholder}
                      onChange={(v) => set("personalEmail", v)} test="prompt-personal-email"
                    />
                  </Row>
                )}

                {show("dob") && (
                  <Row step={stepOf("dob")} done={isDone("dob")}>
                    <Text type="date" value={draft.dob} onChange={(v) => set("dob", v)} test="prompt-dob" />
                  </Row>
                )}

                {show("bloodGroup") && (
                  <Row step={stepOf("bloodGroup")} done={isDone("bloodGroup")}>
                    <Text
                      value={draft.bloodGroup} placeholder={stepOf("bloodGroup").placeholder}
                      onChange={(v) => set("bloodGroup", v.toUpperCase())} test="prompt-blood-group"
                    />
                  </Row>
                )}

                {show("currentAddress") && (
                  <Row step={stepOf("currentAddress")} done={isDone("currentAddress")}>
                    <textarea
                      value={draft.currentAddress}
                      onChange={(e) => set("currentAddress", e.target.value)}
                      rows={2}
                      placeholder={stepOf("currentAddress").placeholder}
                      data-test="prompt-address"
                      className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                    />
                  </Row>
                )}

                {show("permanentAddress") && (
                  <Row step={stepOf("permanentAddress")} done={isDone("permanentAddress")}>
                    <textarea
                      value={draft.permanentAddress}
                      onChange={(e) => set("permanentAddress", e.target.value)}
                      rows={2}
                      placeholder={stepOf("permanentAddress").placeholder}
                      data-test="prompt-permanent-address"
                      className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                    />
                    {/* For the many people whose two addresses are the same — typing it twice is
                        the sort of thing that makes someone press "later". */}
                    <label className="mt-1.5 flex w-fit cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
                      <input
                        type="checkbox"
                        data-test="prompt-same-address"
                        checked={
                          !!draft.permanentAddress.trim()
                          && draft.permanentAddress.trim() === (draft.currentAddress || profile.currentAddress || "").trim()
                        }
                        onChange={(e) => set(
                          "permanentAddress",
                          e.target.checked ? (draft.currentAddress || profile.currentAddress || "") : "",
                        )}
                        className="h-3.5 w-3.5 accent-primary"
                      />
                      Same as my current address
                    </label>
                  </Row>
                )}

                {show("emergencyContact") && (
                  <Row step={stepOf("emergencyContact")} done={isDone("emergencyContact")}>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Text value={draft.emergencyName} placeholder="Name" onChange={(v) => set("emergencyName", v)} test="prompt-emergency-name" />
                      <Text value={draft.emergencyRelation} placeholder="Relationship (Father)" onChange={(v) => set("emergencyRelation", v)} />
                      <Text
                        value={draft.emergencyPhone} placeholder="Phone number" onChange={(v) => set("emergencyPhone", v)}
                        test="prompt-emergency-phone" className="sm:col-span-2"
                      />
                    </div>
                  </Row>
                )}

                {show("pan") && (
                  <Row step={stepOf("pan")} done={isDone("pan")} error={panError}>
                    <Text
                      value={draft.pan} placeholder={stepOf("pan").placeholder}
                      onChange={(v) => set("pan", v.toUpperCase())} test="prompt-pan"
                    />
                  </Row>
                )}

                {show("aadhaar") && (
                  <Row step={stepOf("aadhaar")} done={isDone("aadhaar")} error={aadhaarError}>
                    <Text
                      value={draft.aadhaar} placeholder={stepOf("aadhaar").placeholder} inputMode="numeric"
                      onChange={(v) => set("aadhaar", v)} test="prompt-aadhaar"
                    />
                  </Row>
                )}

                {show("payout") && (
                  <Row step={stepOf("payout")} done={isDone("payout")}>
                    {/* Opens the real payout form rather than duplicating it — that component
                        owns the IFSC/UPI validation and the verification flow, and a second
                        half-validating copy here is how two accounts end up disagreeing. */}
                    <div className="flex flex-wrap items-center gap-2">
                      {bankComplete && (
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-2 text-xs text-foreground">
                          <Wallet size={13} className="text-primary" /> {payoutSummary(bank)}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setBankOpen(true)}
                        data-test="prompt-add-payout"
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-accent"
                      >
                        <Wallet size={13} />
                        {bankComplete ? "Change payout details" : "Add payout details"}
                      </button>
                    </div>
                  </Row>
                )}

                {(["panCard", "aadhaarCard"] as ProfileStepKey[]).filter(show).map((key) => {
                  const step = stepOf(key);
                  const existing = uploadedFor(step);
                  const busy = uploading === key;
                  return (
                    <Row key={key} step={step} done={isDone(key)}>
                      {existing ? (
                        // What went up, with a way to check it and a way to undo it — the two
                        // things missing before, when the row simply vanished on upload.
                        <div
                          className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2"
                          data-test={`prompt-uploaded-${key}`}
                        >
                          <FileText size={14} className="shrink-0 text-primary" />
                          <span className="min-w-0 flex-1 truncate text-xs text-foreground">{existing.label}</span>
                          <a
                            href={existing.url} target="_blank" rel="noopener noreferrer"
                            data-test={`prompt-view-${key}`}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium text-foreground hover:bg-accent"
                          >
                            <Eye size={11} /> View
                          </a>
                          <button
                            type="button" onClick={() => inputFor[key].current?.click()} disabled={busy}
                            data-test={`prompt-replace-${key}`}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium text-foreground hover:bg-accent disabled:opacity-50"
                          >
                            {busy ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Replace
                          </button>
                          <button
                            type="button" onClick={() => handleRemoveUpload(step)} disabled={busy}
                            title="Remove this file"
                            data-test={`prompt-remove-${key}`}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => inputFor[key].current?.click()}
                          disabled={busy}
                          data-test={`prompt-upload-${key}`}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
                        >
                          {busy ? <Loader2 size={13} className="animate-spin" /> : <FileUp size={13} />}
                          {busy ? "Uploading…" : "Choose file"}
                        </button>
                      )}
                      <input
                        ref={inputFor[key]} type="file" accept="image/*,application/pdf" className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          handleUpload(step, f);
                        }}
                      />
                    </Row>
                  );
                })}
              </>
            )}
          </div>

          {/* Actions */}
          <div className="shrink-0 border-t border-border px-5 py-3">
            {!completion.complete && (
              dirty ? (
                <p
                  className="mb-2.5 flex items-center gap-1.5 rounded-lg border border-warning/40 bg-warning/10 px-2.5 py-2 text-[11px] font-medium leading-relaxed text-warning"
                  data-test="prompt-unsaved"
                >
                  <AlertCircle size={12} className="shrink-0" />
                  You have typed things that are not saved yet — press Save to keep them.
                </p>
              ) : (
                <p className="mb-2.5 text-[11px] leading-relaxed text-muted-foreground">
                  Files and photos save as soon as you pick them; everything you type saves when you
                  press Save. Nothing you have entered is lost when you upload a file.
                </p>
              )
            )}
            {/* The budget, said before it is spent rather than after — somebody on their last
                deferral should know it is their last one. */}
            {!completion.complete && (
              canDefer ? (
                <p className="mb-2.5 text-[11px] font-medium text-muted-foreground" data-test="prompt-deferrals-left">
                  You can put this off {left} more {left === 1 ? "time" : "times"}. After that these
                  details have to be completed before you can close this.
                </p>
              ) : (
                <p
                  className="mb-2.5 flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-[11px] font-medium leading-relaxed text-destructive"
                  data-test="prompt-deferrals-spent"
                >
                  <AlertCircle size={12} className="shrink-0" />
                  You have put this off {MAX_PROFILE_DEFERRALS} times. Please complete the details
                  above — the company cannot run your payroll or issue your documents without them.
                </p>
              )
            )}
            <div className="flex gap-2">
              {(completion.complete || canDefer) && (
                <button
                  onClick={handleLater}
                  data-test="profile-prompt-later"
                  className="h-10 flex-1 rounded-xl border border-border text-sm font-medium text-foreground transition-colors hover:bg-accent"
                >
                  {completion.complete ? "Close" : "I'll do it later"}
                </button>
              )}
              {!completion.complete && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  data-test="profile-prompt-save"
                  className="font-display inline-flex h-10 flex-[1.4] items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  {saving ? "Saving…" : "Save"}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>

      {pendingPhoto && (
        <ImageCropper
          key="cropper"
          file={pendingPhoto}
          title="Crop your profile photo"
          onCancel={() => setPendingPhoto(null)}
          onCropped={handleCroppedPhoto}
        />
      )}

      <BankDetailsModal
        key="bank"
        open={bankOpen}
        bank={bank}
        onClose={() => setBankOpen(false)}
      />
    </AnimatePresence>
  );
}

/** One asked item: what it is, why it is wanted, whether it is answered, and the control. */
function Row({ step, error, done, children }: {
  step: ProfileStep;
  error?: string;
  /** Ticked once it is on file. The row stays put either way — see sessionKeys. */
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div data-test={`prompt-step-${step.key}`} data-done={done ? "yes" : "no"}>
      <div className="mb-1.5">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          {done && <CheckCircle2 size={13} className="shrink-0 text-success" data-test={`prompt-done-${step.key}`} />}
          {step.label}
        </label>
        <p className="text-[11px] leading-snug text-muted-foreground">{step.hint}</p>
      </div>
      {children}
      {error && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-destructive">
          <AlertCircle size={11} /> {error}
        </p>
      )}
    </div>
  );
}

function Text({ value, onChange, placeholder, type = "text", inputMode, test, className = "" }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: "numeric";
  test?: string;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      inputMode={inputMode}
      placeholder={placeholder}
      data-test={test}
      onChange={(e) => onChange(e.target.value)}
      className={`h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary ${className}`}
    />
  );
}
