import { useAuthStore } from "@/store/authStore";
import { formatCurrency } from "@/utils/formatters";
import { format } from "date-fns";
import { Receipt, ExternalLink, ArrowLeft, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getDefaultRoute } from "@/utils/roleHelpers";
import { useSalaryPayments } from "@/hooks/useSalaryPayments";

export default function MySalaryPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  // Every payment — marked paid in Payroll or sent as a receipt by Accounts. This page listed
  // receipts only, so a salary paid from Payroll never appeared in the member's history.
  const { loading, payments: receipts } = useSalaryPayments(user?.uid);

  const totalReceived = receipts.reduce((s, r) => s + r.amount, 0);
  const settingsRoute = user?.role ? getDefaultRoute(user.role).replace("dashboard", "settings").replace("profile", "settings") : "/";
  // Build back route based on role
  const backRoute = user?.role === "tech_member" ? "/tech/profile"
    : user?.role === "sales_member" ? "/sales/profile"
    : user?.role === "sales_admin" ? "/sales-admin/settings"
    : user?.role === "tech_admin" ? "/tech-admin/settings"
    : user?.role === "main_admin" ? "/main-admin/settings"
    : user?.role === "accounts_admin" ? "/accounts/dashboard"
    : "/";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(backRoute)}
          className="w-9 h-9 rounded-lg bg-accent border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="font-display text-xl md:text-2xl font-bold text-foreground">My Salary</h1>
          <p className="text-muted-foreground text-xs md:text-sm mt-0.5">Salary receipts & payment history</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground font-medium mb-1">Current Salary</p>
          <p className="font-display text-xl font-bold text-warning">{formatCurrency(user?.salary || 0)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground font-medium mb-1">Total Received</p>
          <p className="font-display text-xl font-bold text-success">{formatCurrency(totalReceived)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground font-medium mb-1">Payments</p>
          <p className="font-display text-xl font-bold text-foreground">{receipts.length}</p>
        </div>
      </div>

      {/* Receipts List */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
            <Receipt size={16} /> Payment History
          </h2>
        </div>

        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : receipts.length === 0 ? (
          <div className="p-8 text-center">
            <Wallet size={32} className="mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No salary payments recorded yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {receipts.map((r) => (
              <div key={r.id} className="p-4 hover:bg-accent/30 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-success/15 flex items-center justify-center shrink-0 mt-0.5">
                      <Receipt size={16} className="text-success" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-display font-bold text-foreground">{formatCurrency(r.amount)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <span className="font-medium text-foreground/70">{r.periodText}</span>
                        <span> · {r.source === "payroll" ? "Paid via Payroll" : "Receipt from Accounts"}</span>
                        {r.note && <span> · {r.note}</span>}
                      </p>
                      {r.fileUrl && (
                        <a href={r.fileUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 mt-1.5 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors">
                          <ExternalLink size={11} />
                          {r.fileName || "View Receipt"}
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground font-mono">
                      {r.at ? format(r.at, "dd MMM yyyy") : "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                      {r.at ? format(r.at, "hh:mm a") : ""}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
