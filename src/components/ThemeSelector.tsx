import { useState, useEffect } from "react";
import { useTheme } from "next-themes";

type Theme = "light" | "dark" | "system";

export default function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const options: { value: Theme; label: string; icon: string }[] = [
    { value: "light", label: "Light", icon: "☀️" },
    { value: "dark", label: "Dark", icon: "🌙" },
    { value: "system", label: "System", icon: "💻" },
  ];

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <h3 className="font-display font-semibold text-foreground mb-1">Appearance</h3>
      <p className="text-xs text-muted-foreground mb-4">Choose your preferred theme</p>
      <div className="flex gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => setTheme(o.value)}
            className={`flex-1 h-10 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              theme === o.value
                ? "bg-primary/15 text-primary border border-primary/30"
                : "bg-background border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <span>{o.icon}</span> {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
