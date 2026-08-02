/**
 * "We still need a few things from you" — asked once a day until it is answered.
 *
 * ── Why it collects rather than redirects ─────────────────────────────────────────────────────
 * The obvious version of this popup lists what is missing and links to the profile page. It does
 * not work: the person is mid-check-in, they tap through, land on a page of tabs, and the address
 * field is three clicks away. So the fields are here, in the popup, and each one saves the moment
 * it is filled — partial progress is kept even if they close it after two answers.
 *
 * ── Why it is dismissible ─────────────────────────────────────────────────────────────────────
 * A blocking gate would stop someone working because they cannot photograph their PAN card at
 * 9am. "I'll do it later" is honoured for the rest of the day and the prompt returns tomorrow, so
 * the nagging is real but never costs anyone a morning.
 *
 * ── Why it asks only what is missing ──────────────────────────────────────────────────────────
 * Somebody who has given eight of ten things should see two fields, not a ten-field form with
 * eight already filled. The list rebuilds itself from what is on file, so it shrinks as they go
 * and vanishes for good on the last one.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle, Camera, Check, CheckCircle2, ClipboardList, FileUp, Loader2,
} from "lucide-react";
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/hooks/use-toast";
import { uploadToCloudinary } from "@/services/cloudinary";
import { addKycDocument, saveEmployeeProfile, watchEmployeeProfile } from "@/services/hr";
import { cleanId, departmentOfRole, isValidAadhaar, isValidPan } from "@/utils/hrPolicy";
import {
  joinName, needsProfilePrompt, profileCompletion, profilePromptDismissedKey, splitName,
} from "@/utils/profileCompletion";
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
  const panInput = useRef<HTMLInputElement>(null);
  const aadhaarInput = useRef<HTMLInputElement>(null);
  const inputFor: Record<string, React.RefObject<HTMLInputElement>> = {
    panCard: panInput, aadhaarCard: aadhaarInput,
  };

  const eligible = needsProfilePrompt(user);

  useEffect(() => {
    if (!user?.uid || !eligible) return;
    setDismissed(readFlag(profilePromptDismissedKey(user.uid, today)));
    return watchEmployeeProfile(user.uid, department, (p) => { profileRef.current = p; setProfile(p); });
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

  const completion = useMemo(() => profileCompletion(user, profile), [user, profile]);

  // Seed the draft from whatever is already stored, so a half-filled emergency contact is not
  // silently wiped by saving the other half.
  useEffect(() => {
    if (!profile) return;
    const { given, surname } = splitName(user?.name, profile.surname);
    setDraft({
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
    });
    // The name comes off the account, which the photo step also rewrites — but re-seeding on
    // every user change would discard what they are halfway through typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  // A blank identifier is fine — the papers do not always arrive on day one. A malformed one is
  // not: it surfaces when payroll or a statutory filing needs it, which is far too late.
  const panError = draft.pan.trim() && !isValidPan(draft.pan) ? "PAN should look like ABCDE1234F." : "";
  const aadhaarError = draft.aadhaar.trim() && !isValidAadhaar(draft.aadhaar)
    ? "That is not a valid Aadhaar number — check the 12 digits." : "";

  const actor = { uid: user?.uid || "", name: user?.name || "" };

  const handleLater = () => {
    if (user?.uid) writeFlag(profilePromptDismissedKey(user.uid, today));
    setDismissed(true);
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
      await Promise.all([
        saveEmployeeProfile(user.uid, { photoUrl: url }, actor),
        updateDoc(doc(db, "users", user.uid), { avatar: url, updatedAt: serverTimestamp() }),
      ]);
      setStoreUser({ ...user, avatar: url });
      toast({ title: "Photo saved", description: "It now shows everywhere you appear." });
    } catch {
      toast({ title: "Upload failed", description: "Could not save the photo. Try again.", variant: "destructive" });
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
   */
  useEffect(() => {
    if (!profile || !eligible || dismissed) return;
    if (completion.complete) {
      setJustFinished(true);
      const timer = setTimeout(() => setJustFinished(false), 2600);
      return () => clearTimeout(timer);
    }
  }, [completion.complete, profile, eligible, dismissed]);

  if (!user || !eligible) return null;
  // Nothing is shown until the record has actually loaded — a prompt that flashes up and then
  // disappears because the data arrived late is worse than one that appears a beat later.
  if (!profile) return null;
  if (!checkedIn) return null;
  if (dismissed) return null;
  if (completion.complete && !justFinished) return null;

  const show = (key: ProfileStepKey) => completion.missing.some((s) => s.key === key);
  const stepOf = (key: ProfileStepKey) => completion.missing.find((s) => s.key === key)!;

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
                  <Row step={stepOf("fullName")}>
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
                  <Row step={stepOf("photo")}>
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

                {show("personalEmail") && (
                  <Row step={stepOf("personalEmail")}>
                    <Text
                      type="email" value={draft.personalEmail} placeholder={stepOf("personalEmail").placeholder}
                      onChange={(v) => set("personalEmail", v)} test="prompt-personal-email"
                    />
                  </Row>
                )}

                {show("dob") && (
                  <Row step={stepOf("dob")}>
                    <Text type="date" value={draft.dob} onChange={(v) => set("dob", v)} test="prompt-dob" />
                  </Row>
                )}

                {show("bloodGroup") && (
                  <Row step={stepOf("bloodGroup")}>
                    <Text
                      value={draft.bloodGroup} placeholder={stepOf("bloodGroup").placeholder}
                      onChange={(v) => set("bloodGroup", v.toUpperCase())} test="prompt-blood-group"
                    />
                  </Row>
                )}

                {show("currentAddress") && (
                  <Row step={stepOf("currentAddress")}>
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
                  <Row step={stepOf("permanentAddress")}>
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
                  <Row step={stepOf("emergencyContact")}>
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
                  <Row step={stepOf("pan")} error={panError}>
                    <Text
                      value={draft.pan} placeholder={stepOf("pan").placeholder}
                      onChange={(v) => set("pan", v.toUpperCase())} test="prompt-pan"
                    />
                  </Row>
                )}

                {show("aadhaar") && (
                  <Row step={stepOf("aadhaar")} error={aadhaarError}>
                    <Text
                      value={draft.aadhaar} placeholder={stepOf("aadhaar").placeholder} inputMode="numeric"
                      onChange={(v) => set("aadhaar", v)} test="prompt-aadhaar"
                    />
                  </Row>
                )}

                {(["panCard", "aadhaarCard"] as ProfileStepKey[]).filter(show).map((key) => {
                  const step = stepOf(key);
                  return (
                    <Row key={key} step={step}>
                      <button
                        type="button"
                        onClick={() => inputFor[key].current?.click()}
                        disabled={uploading === key}
                        data-test={`prompt-upload-${key}`}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
                      >
                        {uploading === key
                          ? <Loader2 size={13} className="animate-spin" />
                          : <FileUp size={13} />}
                        {uploading === key ? "Uploading…" : "Choose file"}
                      </button>
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
              <p className="mb-2.5 text-[11px] leading-relaxed text-muted-foreground">
                Files and photos save as soon as you pick them. Everything else saves when you
                press Save. We will ask again tomorrow until it is all here.
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleLater}
                data-test="profile-prompt-later"
                className="h-10 flex-1 rounded-xl border border-border text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                {completion.complete ? "Close" : "I'll do it later"}
              </button>
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
    </AnimatePresence>
  );
}

/** One outstanding item: what it is, why it is wanted, and the control that answers it. */
function Row({ step, error, children }: {
  step: ProfileStep;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div data-test={`prompt-step-${step.key}`}>
      <div className="mb-1.5">
        <label className="text-xs font-semibold text-foreground">{step.label}</label>
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
