import { useState } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc, getDocFromServer, setDoc, serverTimestamp, collection, addDoc } from "firebase/firestore";
import { auth, db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { useNavigate } from "react-router-dom";
import { defaultRouteForUser } from "@/utils/roleHelpers";
import type { AppUser } from "@/types";
import { Eye, EyeOff, Loader2, RefreshCw } from "lucide-react";
import { reportCacheTrouble, repairLocalCaches } from "@/services/localCacheRecovery";

const PARTICLES = Array.from({ length: 8 }, (_, i) => ({
  id: i,
  size: Math.random() * 6 + 2,
  left: Math.random() * 100,
  top: Math.random() * 100,
  delay: Math.random() * 5,
  duration: Math.random() * 4 + 4,
}));

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  /** Auth succeeded but the profile could not be read — offer the repair rather than a dead end. */
  const [profileFailed, setProfileFailed] = useState(false);
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      // Straight from the server. `getDoc` will answer from the IndexedDB cache when it can, and a
      // cold or damaged cache answering "no such user" is what produced the "correct password
      // rejected" reports. Identity has just been proven by Auth; the profile lookup must not be
      // allowed to contradict it on stale local data. Falls back to the cached copy only if the
      // server is unreachable, so a genuinely offline login still works.
      const userDoc = await getDocFromServer(doc(db, "users", cred.user.uid))
        .catch(() => getDoc(doc(db, "users", cred.user.uid)));

      let userData: AppUser;

      if (!userDoc.exists()) {
        // Auto-create main admin document for the seed account
        if (cred.user.email === "admin@dreamteamservices.com") {
          const adminData = {
            email: cred.user.email,
            name: "Head Admin",
            role: "main_admin" as const,
            createdBy: "system",
            isActive: true,
            salary: 0,
            target: 0,
            phone: "",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          await setDoc(doc(db, "users", cred.user.uid), adminData);
          userData = { uid: cred.user.uid, ...adminData } as AppUser;
        } else {
          setError("Account not found in the system. Contact your admin.");
          setLoading(false);
          return;
        }
      } else {
        userData = { uid: cred.user.uid, ...userDoc.data() } as AppUser;
      }

      // Deactivated accounts are not allowed to sign in.
      if (userData.isActive === false) {
        await signOut(auth);
        setError("Your account has been deactivated. Please contact your admin.");
        setLoading(false);
        return;
      }

      setUser(userData);

      // Session tracking is bookkeeping, not part of signing in. Awaiting it meant a Firestore
      // write failing — offline, rules, a broken local cache — threw into the catch below and told
      // someone who was already authenticated that their login had failed.
      void addDoc(collection(db, "sessions"), {
        userId: cred.user.uid,
        loginAt: serverTimestamp(),
        logoutAt: null,
        duration: 0,
      }).catch(() => { /* a missing session row is not worth blocking a login for */ });

      navigate(defaultRouteForUser(userData));
    } catch (err: any) {
      // Only Auth can say the credentials were wrong. Everything else is us failing to load the
      // profile, and saying "invalid password" for that sends the member off to re-type a password
      // that was right all along — which is precisely how this bug stayed hidden for so long.
      const code: string = err?.code || "";
      if (code.startsWith("auth/")) {
        setError(
          code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found"
            ? "Invalid email or password."
            : code === "auth/too-many-requests"
            ? "Too many attempts. Please wait."
            : code === "auth/network-request-failed"
            ? "No connection. Check your internet and try again."
            : "Could not sign you in. Please try again.",
        );
      } else {
        reportCacheTrouble("login-profile-read-failed");
        setError("Signed in, but your profile could not be loaded. Check your connection and try again.");
        setProfileFailed(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left Brand Panel */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden bg-background items-center justify-center">
        {/* Particles */}
        {PARTICLES.map((p) => (
          <div
            key={p.id}
            className="absolute rounded-full bg-primary animate-float"
            style={{
              width: p.size,
              height: p.size,
              left: `${p.left}%`,
              top: `${p.top}%`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              opacity: 0.3,
            }}
          />
        ))}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />

        <div className="relative z-10 text-center px-12">
          <div className="inline-block rounded-2xl bg-black px-8 py-6 shadow-2xl shadow-black/40 ring-1 ring-white/10 mb-5">
            <img src="/dts-logo-full.png" alt="DTS — Dream Team Services" className="w-72 max-w-full h-auto" />
          </div>
          <p className="text-muted-foreground text-sm">Command Center</p>

          <div className="mt-16 flex items-center justify-center gap-2 text-muted-foreground/50 text-xs">
            <div className="w-2 h-2 rounded-full bg-success animate-live-dot" />
            System Operational
          </div>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-card">
        <div className="w-full max-w-[420px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-10">
            <div className="rounded-xl bg-black px-5 py-4 shadow-xl shadow-black/30 ring-1 ring-white/10">
              <img src="/dts-logo-full.png" alt="DTS — Dream Team Services" className="w-48 h-auto" />
            </div>
          </div>

          <h2 className="font-display text-3xl font-bold text-foreground mb-2">Welcome Back</h2>
          <p className="text-muted-foreground mb-8">Sign in to your workspace</p>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@dreamteam.com"
                required
                className="w-full h-11 px-4 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all duration-150 outline-none font-body"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full h-11 px-4 pr-11 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all duration-150 outline-none font-body"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-destructive text-sm bg-destructive/10 px-4 py-2.5 rounded-lg space-y-2">
                <p>{error}</p>
                {/* The password was right; the device's stored data is the problem. This does what
                    "clear your browser cache" used to do, without a member needing to know how. */}
                {profileFailed && (
                  <button
                    type="button"
                    onClick={() => { void repairLocalCaches("login-manual-repair"); }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-2.5 py-1.5 text-xs font-medium hover:bg-destructive/10 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Reset this device's saved data and retry
                  </button>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : null}
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p className="text-center text-muted-foreground/50 text-xs mt-8">
            Accounts are created by administrators only.
          </p>
        </div>
      </div>
    </div>
  );
}
