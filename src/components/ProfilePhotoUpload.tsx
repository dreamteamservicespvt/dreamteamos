/**
 * Uploading a profile photo.
 *
 * Written to `users/{uid}.avatar`, which is the copy every screen in the app already reads — so the
 * picture appears in chat, on calls, in team lists, on the leaderboard and in the topbar the moment
 * it saves. It is mirrored onto the employment record's photograph at the same time, because the
 * KYC section offers its own upload for the same face and a member should never have to give the
 * company their photo twice (see services/hr.mirrorAvatarToProfile).
 *
 * The photo is squared off before it is uploaded, not after: every avatar in the app is a circle,
 * so the person who owns the face is the right one to say which square of it is them.
 */
import { useRef, useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { db } from "@/services/firebase";
import { uploadToCloudinary } from "@/services/cloudinary";
import { mirrorAvatarToProfile } from "@/services/hr";
import { syncPublicBadge } from "@/services/publicBadge";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/hooks/use-toast";
import MemberAvatar from "@/components/MemberAvatar";
import ImageCropper from "@/components/ImageCropper";

/** Big enough that a phone photo is rejected before it is uploaded, not after. */
const MAX_BYTES = 5 * 1024 * 1024;

export default function ProfilePhotoUpload({
  uid, name, avatar, size = 72, onChange, children,
}: {
  uid: string;
  name?: string | null;
  avatar?: string | null;
  size?: number;
  /** Told the new URL (or null) so the surrounding page can update without a re-read. */
  onChange?: (url: string | null) => void;
  /**
   * Who this is — name, role chips. Rendered beside the face rather than left to the caller's
   * own flex row, which is what let it wrap away onto a line of its own on a narrow screen.
   */
  children?: React.ReactNode;
}) {
  const { toast } = useToast();
  const storeUser = useAuthStore((s) => s.user);
  const setStoreUser = useAuthStore((s) => s.setUser);
  const [busy, setBusy] = useState(false);
  /** The picked file, waiting to be squared off. Nothing is uploaded until the crop is confirmed. */
  const [pending, setPending] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Keeps the topbar and everything else reading the store in step, without a round trip. */
  const syncStore = (url: string | null) => {
    if (storeUser?.uid === uid) setStoreUser({ ...storeUser, avatar: url || undefined });
  };

  const save = async (url: string | null) => {
    await updateDoc(doc(db, "users", uid), { avatar: url, updatedAt: serverTimestamp() });
    // Best effort, and after the avatar: the employment record is a mirror here, not the truth.
    await mirrorAvatarToProfile(uid, url);
    await syncPublicBadge(uid);
    syncStore(url);
    onChange?.(url);
  };

  /** Picking a file only opens the cropper — the checks happen here so a bad file is refused fast. */
  const handlePick = (file: File) => {
    if (inputRef.current) inputRef.current.value = "";
    if (!file.type.startsWith("image/")) {
      toast({ title: "Pick an image", description: "A profile photo has to be an image file.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: "Too large", description: "Please choose a photo under 5 MB.", variant: "destructive" });
      return;
    }
    setPending(file);
  };

  /** The cropped square, on its way to Cloudinary. */
  const handleCropped = async (file: File) => {
    setPending(null);
    setBusy(true);
    try {
      const url = await uploadToCloudinary(file);
      await save(url);
      toast({ title: "Photo updated", description: "It now shows everywhere you appear." });
    } catch {
      toast({ title: "Upload failed", description: "Could not save the photo. Try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    try {
      await save(null);
      toast({ title: "Photo removed", description: "Your initials are shown instead." });
    } catch {
      toast({ title: "Error", description: "Could not remove the photo.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full">
      {/* Face and name together, always on one line. They used to be separate flex children of
          the caller's row, so on a phone the name wrapped BELOW the help paragraph — the two
          halves of a person's identity split apart by a note about file sizes. */}
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <MemberAvatar name={name} avatar={avatar} size={size} viewable />
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            </span>
          )}
        </div>
        {children && <div className="min-w-0 flex-1">{children}</div>}
      </div>

      {/* Controls and the note run full width underneath, where they have room to breathe. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
          data-test="upload-photo"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50">
          <Camera size={13} /> {avatar ? "Change photo" : "Upload photo"}
        </button>
        {avatar && (
          <button type="button" onClick={handleRemove} disabled={busy} data-test="remove-photo"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive disabled:opacity-50">
            <Trash2 size={13} />
          </button>
        )}
        <p className="w-full text-[11px] leading-snug text-muted-foreground sm:w-auto sm:flex-1">
          This is the photo the team sees — chat, calls, every team list. Your first upload is also
          used as the photograph on your ID card; after that the two are separate, and the ID card
          one is changed under My&nbsp;details. JPG or PNG, under 5&nbsp;MB.
        </p>
      </div>

      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePick(f); }} />

      {pending && (
        <ImageCropper
          file={pending}
          onCancel={() => setPending(null)}
          onCropped={handleCropped}
        />
      )}
    </div>
  );
}
