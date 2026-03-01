import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp, collection, addDoc } from "firebase/firestore";
import { auth, db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { useNavigate } from "react-router-dom";
import { getDefaultRoute } from "@/utils/roleHelpers";
import type { AppUser } from "@/types";
import { Eye, EyeOff, Loader2 } from "lucide-react";

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
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const userDoc = await getDoc(doc(db, "users", cred.user.uid));

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
      setUser(userData);

      // Track session
      await addDoc(collection(db, "sessions"), {
        userId: cred.user.uid,
        loginAt: serverTimestamp(),
        logoutAt: null,
        duration: 0,
      });

      navigate(getDefaultRoute(userData.role));
    } catch (err: any) {
      const msg = err.code === "auth/invalid-credential"
        ? "Invalid email or password."
        : err.code === "auth/too-many-requests"
        ? "Too many attempts. Please wait."
        : "Login failed. Please try again.";
      setError(msg);
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
          <h1 className="font-display text-6xl font-800 tracking-tight mb-4">
            <span className="bg-gradient-to-r from-primary to-warning bg-clip-text text-transparent">
              DTS
            </span>
          </h1>
          <p className="font-display text-xl font-semibold text-foreground/80 mb-2">
            Dream Team Services
          </p>
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
          <div className="lg:hidden text-center mb-10">
            <h1 className="font-display text-4xl font-800 bg-gradient-to-r from-primary to-warning bg-clip-text text-transparent">
              DTS
            </h1>
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
              <p className="text-destructive text-sm bg-destructive/10 px-4 py-2.5 rounded-lg">{error}</p>
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
