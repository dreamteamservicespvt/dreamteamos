/**
 * Uploading a profile photo.
 *
 * Written straight to `users/{uid}.avatar`, which is the copy every screen in the app already
 * reads — so the picture appears in chat, on calls, in team lists, on the leaderboard and in the
 * topbar the moment it saves, with nothing else to update and no second place to keep in step.
 */
import { useRef, useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { db } from "@/services/firebase";
import { uploadToCloudinary } from "@/services/cloudinary";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/hooks/use-toast";
import MemberAvatar from "@/components/MemberAvatar";

/** Big enough that a phone photo is rejected before it is uploaded, not after. */
const MAX_BYTES = 5 * 1024 * 1024;

export default function ProfilePhotoUpload({
  uid, name, avatar, size = 72, onChange,
}: {
  uid: string;
  name?: string | null;
  avatar?: string | null;
  size?: number;
  /** Told the new URL (or null) so the surrounding page can update without a re-read. */
  onChange?: (url: string | null) => void;
}) {
  const { toast } = useToast();
  const storeUser = useAuthStore((s) => s.user);
  const setStoreUser = useAuthStore((s) => s.setUser);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Keeps the topbar and everything else reading the store in step, without a round trip. */
  const syncStore = (url: string | null) => {
    if (storeUser?.uid === uid) setStoreUser({ ...storeUser, avatar: url || undefined });
  };

  const save = async (url: string | null) => {
    await updateDoc(doc(db, "users", uid), { avatar: url, updatedAt: serverTimestamp() });
    syncStore(url);
    onChange?.(url);
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Pick an image", description: "A profile photo has to be an image file.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: "Too large", description: "Please choose a photo under 5 MB.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const url = await uploadToCloudinary(file);
      await save(url);
      toast({ title: "Photo updated", description: "It now shows everywhere you appear." });
    } catch {
      toast({ title: "Upload failed", description: "Could not save the photo. Try again.", variant: "destructive" });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
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
    <div className="flex items-center gap-3">
      <div className="relative">
        <MemberAvatar name={name} avatar={avatar} size={size} />
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
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
        </div>
        <p className="text-[11px] text-muted-foreground">
          Shows on chat, calls, the leaderboard and every team list. JPG or PNG, under 5 MB.
        </p>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
    </div>
  );
}
