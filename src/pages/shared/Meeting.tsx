import { useState, useCallback } from "react";
import { collection, doc, setDoc, query, where, getDocs, serverTimestamp } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { sendNotification } from "@/services/notifications";
import { getChatContactRoles } from "@/utils/chatHelpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Video, Users, Plus, LogIn, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import MeetingRoom from "@/components/chat/MeetingRoom";
import type { AppUser } from "@/types";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export default function Meeting() {
  const user = useAuthStore((s) => s.user);
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);
  const [activeMeetingCode, setActiveMeetingCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [copied, setCopied] = useState(false);

  const createMeeting = useCallback(async () => {
    if (!user) return;
    setCreating(true);
    try {
      const code = generateCode();
      const meetingRef = doc(collection(db, "meetings"));
      await setDoc(meetingRef, {
        code,
        title: `${user.name}'s Meeting`,
        createdBy: user.uid,
        createdByName: user.name,
        status: "active",
        participantUids: [],
        createdAt: serverTimestamp(),
      });
      setActiveMeetingId(meetingRef.id);
      setActiveMeetingCode(code);

      // Notify all team contacts about the new meeting
      const roles = getChatContactRoles(user.role);
      if (roles.length > 0) {
        const contactsSnap = await getDocs(
          query(collection(db, "users"), where("role", "in", roles), where("isActive", "==", true)),
        );
        contactsSnap.docs.forEach((d) => {
          const contact = d.data() as AppUser;
          if (contact.uid !== user.uid) {
            sendNotification({
              userId: contact.uid ?? d.id,
              type: "meeting_invite",
              title: "Meeting Started",
              message: `${user.name} started a meeting. Code: ${code}`,
            });
          }
        });
      }
    } catch (err) {
      console.error("Failed to create meeting:", err);
      toast.error("Failed to create meeting");
    } finally {
      setCreating(false);
    }
  }, [user]);

  const joinMeeting = useCallback(async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    try {
      const q = query(
        collection(db, "meetings"),
        where("code", "==", joinCode.trim().toUpperCase()),
        where("status", "==", "active"),
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        toast.error("Meeting not found or has ended");
        setJoining(false);
        return;
      }
      const meetDoc = snap.docs[0];
      setActiveMeetingId(meetDoc.id);
      setActiveMeetingCode(joinCode.trim().toUpperCase());
    } catch (err) {
      console.error("Failed to join meeting:", err);
      toast.error("Failed to join meeting");
    } finally {
      setJoining(false);
    }
  }, [joinCode]);

  const leaveMeeting = useCallback(() => {
    setActiveMeetingId(null);
    setActiveMeetingCode("");
    setJoinCode("");
  }, []);

  const copyCode = useCallback(() => {
    navigator.clipboard.writeText(activeMeetingCode || joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [activeMeetingCode, joinCode]);

  // Active meeting
  if (activeMeetingId) {
    return (
      <div className="h-[calc(100vh-64px)] flex flex-col">
        <MeetingRoom
          meetingId={activeMeetingId}
          meetingCode={activeMeetingCode}
          onLeave={leaveMeeting}
        />
      </div>
    );
  }

  // Landing — create or join
  return (
    <div className="h-[calc(100vh-64px)] flex items-center justify-center p-4">
      <div className="max-w-2xl w-full grid gap-6 md:grid-cols-2">
        {/* Create */}
        <Card className="border-2 hover:border-primary/50 transition-colors">
          <CardHeader className="text-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
              <Plus className="w-7 h-7 text-primary" />
            </div>
            <CardTitle>New Meeting</CardTitle>
            <CardDescription>Create a meeting and invite your team</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full gap-2" size="lg" onClick={createMeeting} disabled={creating}>
              <Video className="w-5 h-5" />
              {creating ? "Creating…" : "Start Meeting"}
            </Button>
          </CardContent>
        </Card>

        {/* Join */}
        <Card className="border-2 hover:border-primary/50 transition-colors">
          <CardHeader className="text-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
              <LogIn className="w-7 h-7 text-primary" />
            </div>
            <CardTitle>Join Meeting</CardTitle>
            <CardDescription>Enter a meeting code to join</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Enter meeting code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              className="text-center text-lg tracking-widest font-mono uppercase"
              onKeyDown={(e) => e.key === "Enter" && joinMeeting()}
            />
            <Button className="w-full gap-2" size="lg" onClick={joinMeeting} disabled={joining || !joinCode.trim()}>
              <Users className="w-5 h-5" />
              {joining ? "Joining…" : "Join Meeting"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
