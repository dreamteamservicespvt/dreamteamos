import { useAuthStore } from "@/store/authStore";
import { getRoleLabel } from "@/utils/roleHelpers";
import { Construction } from "lucide-react";

interface PlaceholderPageProps {
  title: string;
}

export default function PlaceholderPage({ title }: PlaceholderPageProps) {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="bg-card border border-border rounded-xl p-12 text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
          <Construction size={32} className="text-primary" />
        </div>
        <h2 className="font-display text-xl font-bold text-foreground mb-2">{title}</h2>
        <p className="text-muted-foreground text-sm">
          This module is being built. You're logged in as{" "}
          <span className="text-foreground font-medium">{user?.name}</span>{" "}
          ({getRoleLabel(user?.role || "tech_member")}).
        </p>
      </div>
    </div>
  );
}
