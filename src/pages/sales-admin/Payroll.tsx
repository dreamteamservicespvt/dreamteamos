import { useMemo, useRef, useState } from "react";
import { format, parse } from "date-fns";
import {
  AlertTriangle, Banknote, CalendarClock, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  Download, ExternalLink, FileText, IndianRupee, Loader2, Search, ShieldCheck, TrendingUp, Undo2, Upload, Users, Wallet,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useFirestoreCollection } from "@/hooks/useFirestore";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import { formatCurrency } from "@/utils/formatters";
import { uploadToCloudinary } from "@/services/cloudinary";
import { isBankComplete, payoutSummary, verifyEmployeeBank, watchAllEmployeeBanks } from "@/services/payroll";
import { markSalaryPaid, undoSalaryPayment, watchPayrollLines } from "@/services/payrollRun";
import { downloadPayslip } from "@/utils/payslipPdf";
import { useSalesMemberPay, type SalesPayRow } from "@/hooks/useSalesMemberPay";
import { currentPayMonth, payPeriodLabel, shiftPayMonth } from "@/utils/payrollEngine";
import type { AppUser } from "@/types";

/**
 * Sales Payroll — salary plus commission, paid the same way tech is.
 *
 * Deliberately mirrors the tech payroll page: derive live, pay on the 10th, attach a receipt,
 * undo a mistake. The only difference is that a sales member's pay has two components, so both
 * are shown all the way through to the total.
 */
export default function SalesPayroll() {
  const user = useAuthStore(s => s.user);
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const { data: allUsers, loading: usersLoading } = useFirestoreCollection<AppUser>("users");
  const members = useMemo(
    () => allUsers.filter(u => u.role === "sales_member" && u.isActive),
    [allUsers],
  );

  const [monthOffset, setMonthOffset] = useState(0);
  // The pay period we are IN, stepped by the ‹ › buttons. The calendar month names a period that
  // has not started for the first nine days of every month — see payrollEngine.currentPayMonth.
  const month = shiftPayMonth(currentPayMonth(), monthOffset);
  const monthLabel = payPeriodLabel(month);

  const [search, setSearch] = useState("");
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingRow = useRef<SalesPayRow | null>(null);

  const { loading, rows, period, payDay, totals } = useSalesMemberPay(members, month);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (unpaidOnly && r.line?.paymentStatus === "completed") return false;
      if (!q) return true;
      return r.member.name?.toLowerCase().includes(q) || r.member.email?.toLowerCase().includes(q);
    });
  }, [rows, search, unpaidOnly]);

  const handleMarkPaid = async (row: SalesPayRow) => {
    if (!user) return;
    const { confirmed, inputValue } = await confirm({
      title: `Pay ${row.member.name}?`,
      description: `${formatCurrency(row.totalEarnings)} for ${monthLabel} — ${formatCurrency(row.salaryPayable)} salary + ${formatCurrency(row.commission)} commission. You can undo this afterwards.`,
      confirmText: "Mark as paid",
      withInput: true,
      inputPlaceholder: "Transaction ID (optional)",
    });
    if (!confirmed) return;

    setBusyUid(row.member.uid);
    try {
      await markSalaryPaid(
        { month, member: row.member, netSalary: row.totalEarnings, computation: row.computation },
        { uid: user.uid, name: user.name },
        { transactionId: inputValue?.trim() || undefined },
      );
      toast({ title: "Marked paid", description: `${row.member.name} · ${formatCurrency(row.totalEarnings)}` });
    } catch (error) {
      console.error("Failed to mark sales salary paid:", error);
      toast({ title: "Could not record payment", variant: "destructive" });
    } finally {
      setBusyUid(null);
    }
  };

  const handleUndo = async (row: SalesPayRow) => {
    if (!user || !row.line) return;
    const { confirmed } = await confirm({
      title: `Undo payment for ${row.member.name}?`,
      description: `Reverses the ${formatCurrency(row.line.netSalary)} payment record for ${monthLabel}. Recorded in the audit log.`,
      confirmText: "Undo payment",
      variant: "destructive",
    });
    if (!confirmed) return;

    setBusyUid(row.member.uid);
    try {
      await undoSalaryPayment(row.line, { uid: user.uid, name: user.name });
      toast({ title: "Payment undone" });
    } catch {
      toast({ title: "Could not undo payment", variant: "destructive" });
    } finally {
      setBusyUid(null);
    }
  };

  const handleReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const row = pendingRow.current;
    e.target.value = "";
    if (!file || !row || !user) return;

    setUploadingFor(row.member.uid);
    try {
      const url = await uploadToCloudinary(file);
      await markSalaryPaid(
        { month, member: row.member, netSalary: row.totalEarnings, computation: row.computation },
        { uid: user.uid, name: user.name },
        { receiptUrl: url, receiptName: file.name },
      );
      toast({ title: "Receipt uploaded", description: `${row.member.name}'s payment recorded.` });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploadingFor(null);
      pendingRow.current = null;
    }
  };

  const handlePayslip = (row: SalesPayRow) => {
    downloadPayslip({
      month,
      employeeName: row.member.name,
      employeeId: row.member.employeeId,
      role: "Sales Executive",
      computation: row.computation,
      netPayable: row.totalEarnings,
      paymentMethod: payoutSummary(row.bank),
      paymentStatus: row.line?.paymentStatus === "completed" ? "Paid" : "Pending",
      transactionId: row.line?.transactionId,
    });
  };

  const handleExport = () => {
    const headers = ["Employee", "Salary", "Deductions", "Salary Payable", "Sales", "Rate %", "Commission", "Total", "Status"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      headers.join(","),
      ...filtered.map(r => [
        r.member.name, r.computation.monthlySalary, Math.round(r.salaryDeduction),
        Math.round(r.salaryPayable), Math.round(r.salesBase), r.rate,
        Math.round(r.commission), Math.round(r.totalEarnings),
        r.line?.paymentStatus === "completed" ? "Paid" : "Pending",
      ].map(esc).join(",")),
    ].join("\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales-payroll-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: `${filtered.length} rows downloaded.` });
  };

  if (usersLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const day = (d: string) => format(parse(d, "yyyy-MM-dd", new Date()), "dd MMM");

  return (
    <div className="space-y-5 pb-8">
      {ConfirmDialog}
      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" onChange={handleReceipt} className="hidden" />

      <header className="rounded-2xl border border-border bg-gradient-to-br from-card via-card to-accent/25 p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
              <Wallet className="h-3 w-3" /> Salary + commission
            </div>
            <h1 className="font-display text-xl font-bold text-foreground md:text-2xl">Sales Payroll</h1>
            <p className="mt-1 text-xs text-muted-foreground md:text-sm">
              Period <strong className="text-foreground">{day(period.start)} – {day(period.end)}</strong>
              {" "}· pay on the {payDay.date.getDate()}th and record the receipt
            </p>
          </div>

          <div className="flex items-center gap-1 self-start rounded-xl border border-border bg-background p-1 lg:self-auto">
            <button onClick={() => setMonthOffset(o => o - 1)} aria-label="Previous month"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[8.5rem] text-center text-sm font-semibold text-foreground">{monthLabel}</span>
            <button onClick={() => setMonthOffset(o => Math.min(0, o + 1))} disabled={monthOffset >= 0}
              aria-label="Next month"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat icon={IndianRupee} label="Total Payout" value={formatCurrency(totals.total)} tone="primary" />
        <Stat icon={Banknote} label="Salary" value={formatCurrency(totals.salary)} />
        <Stat icon={TrendingUp} label="Commission" value={formatCurrency(totals.commission)} tone="success" />
        <Stat icon={Users} label="Members" value={members.length} hint={`${totals.paidCount} paid`} />
        <Stat icon={CalendarClock} label="Next Pay Day"
          value={payDay.daysRemaining === 0 ? "Today" : `${payDay.daysRemaining}d`}
          hint={format(payDay.date, "dd MMM")} />
      </section>

      {totals.pendingSaleCount > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            <p className="text-sm font-semibold text-foreground">
              {totals.pendingSaleCount} sale{totals.pendingSaleCount === 1 ? "" : "s"} awaiting verification
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Worth {formatCurrency(totals.pendingSaleValue)}. Unverified sales earn no commission — verify
              or reject them before paying, or they drop out of this period entirely.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:items-center md:p-4">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder="Search member..." value={search} onChange={e => setSearch(e.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
        <button onClick={() => setUnpaidOnly(v => !v)}
          className={`h-10 rounded-xl border px-4 text-xs font-medium transition-colors ${
            unpaidOnly ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"
          }`}>
          Unpaid only
        </button>
        <button onClick={handleExport} disabled={filtered.length === 0}
          className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border px-4 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50">
          <Download className="h-3.5 w-3.5" /> Export
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-16 text-center">
          <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">
            {rows.length === 0 ? "No sales executives to pay" : "No members match this filter"}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="hidden grid-cols-12 gap-3 border-b border-border bg-accent/30 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
            <span className="col-span-4">Member</span>
            {/* Full salary first, deductions second — the same order as the tech table, and the
                order people expect: what you earn, then what came off it. */}
            <span className="col-span-2 text-right">Salary</span>
            <span className="col-span-2 text-right">Deductions</span>
            <span className="col-span-2 text-right">Commission</span>
            <span className="col-span-1 text-right">Total</span>
            <span className="col-span-1">Status</span>
          </div>

          <div className="divide-y divide-border">
            {filtered.map(row => {
              const isPaid = row.line?.paymentStatus === "completed";
              const isOpen = expanded === row.member.uid;
              const bankOk = isBankComplete(row.bank);
              const busy = busyUid === row.member.uid || uploadingFor === row.member.uid;

              return (
                <div key={row.member.uid}>
                  <button onClick={() => setExpanded(isOpen ? null : row.member.uid)} aria-expanded={isOpen}
                    className="grid w-full grid-cols-2 gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/30 lg:grid-cols-12 lg:items-center">
                    <div className="col-span-2 flex min-w-0 items-center gap-2.5 lg:col-span-4">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-role-sales-member/15 text-xs font-bold text-role-sales-member">
                        {row.member.name?.charAt(0)?.toUpperCase() || "?"}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{row.member.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {bankOk ? payoutSummary(row.bank) : <span className="text-warning">Payout details missing</span>}
                        </p>
                      </div>
                    </div>

                    <div className="lg:col-span-2 lg:text-right">
                      <p className="font-mono text-sm tabular-nums text-foreground">
                        {formatCurrency(row.computation.monthlySalary)}
                      </p>
                    </div>

                    <div className="lg:col-span-2 lg:text-right">
                      <p className={`font-mono text-sm tabular-nums ${row.salaryDeduction > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                        {row.salaryDeduction > 0 ? `−${formatCurrency(row.salaryDeduction)}` : "—"}
                      </p>
                    </div>

                    <div className="lg:col-span-2 lg:text-right">
                      <p className="font-mono text-sm tabular-nums text-success">{formatCurrency(row.commission)}</p>
                      <p className="text-[10px] text-muted-foreground">{row.rate}% · {row.saleCount} sales</p>
                    </div>

                    <div className="lg:col-span-1 lg:text-right">
                      <p className="font-display text-base font-bold tabular-nums text-foreground">
                        {formatCurrency(row.totalEarnings)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 lg:col-span-1">
                      <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        isPaid ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                      }`}>
                        {isPaid ? "Paid" : "Pending"}
                      </span>
                      <ChevronDown className={`ml-auto hidden h-4 w-4 text-muted-foreground transition-transform lg:block ${isOpen ? "rotate-180" : ""}`} />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="space-y-3 border-t border-border bg-accent/15 p-4">
                      <div className="rounded-xl border border-border bg-card p-3.5 text-sm">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Pay breakdown
                        </p>
                        <Row label={`Monthly salary · ${row.computation.workingDays} working days`} value={formatCurrency(row.computation.monthlySalary)} />
                        {row.salaryDeduction > 0 && (
                          <Row label={`Attendance deductions (${row.computation.absentDays}A · ${row.computation.halfDays}H · ${row.computation.unpaidLeaveDays}LWP)`}
                            value={`−${formatCurrency(row.salaryDeduction)}`} negative />
                        )}
                        <Row label={`Commission · ${row.rate}% of ${formatCurrency(row.salesBase)}`} value={`+${formatCurrency(row.commission)}`} positive />
                        <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2.5">
                          <span className="font-semibold text-foreground">Total payable</span>
                          <span className="font-display text-lg font-bold tabular-nums text-success">
                            {formatCurrency(row.totalEarnings)}
                          </span>
                        </div>
                      </div>

                      {row.line?.receiptUrl && (
                        <a href={row.line.receiptUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-success/10 px-3 py-1.5 text-xs font-medium text-success transition-colors hover:bg-success/20">
                          <FileText className="h-3.5 w-3.5" /> {row.line.receiptName || "View receipt"}
                          <ExternalLink className="h-3 w-3 opacity-70" />
                        </a>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => handlePayslip(row)}
                          className="flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent">
                          <Download className="h-3.5 w-3.5" /> Salary slip
                        </button>

                        {!row.bank?.accounts?.some(a => a.verified) && bankOk && (
                          <button onClick={async () => {
                            if (!user) return;
                            setBusyUid(row.member.uid);
                            try {
                              await verifyEmployeeBank(row.member.uid, row.member.name, { uid: user.uid, name: user.name }, row.bank);
                              toast({ title: "Payout details verified" });
                            } finally { setBusyUid(null); }
                          }} disabled={busy}
                            className="flex h-9 items-center gap-1.5 rounded-xl border border-success/40 bg-success/10 px-3 text-xs font-medium text-success transition-colors hover:bg-success/20 disabled:opacity-50">
                            <ShieldCheck className="h-3.5 w-3.5" /> Verify details
                          </button>
                        )}

                        <button onClick={() => { pendingRow.current = row; fileInputRef.current?.click(); }} disabled={busy}
                          className="flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50">
                          {uploadingFor === row.member.uid ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                          {row.line?.receiptUrl ? "Replace receipt" : "Upload receipt"}
                        </button>

                        {isPaid ? (
                          <button onClick={() => handleUndo(row)} disabled={busy}
                            className="flex h-9 items-center gap-1.5 rounded-xl border border-warning/40 bg-warning/10 px-3 text-xs font-medium text-warning transition-colors hover:bg-warning/20 disabled:opacity-50">
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />} Undo payment
                          </button>
                        ) : (
                          <button onClick={() => handleMarkPaid(row)} disabled={busy || !bankOk}
                            title={bankOk ? undefined : "Payout details incomplete"}
                            className="flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Mark paid
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, negative, positive }: { label: string; value: string; negative?: boolean; positive?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono tabular-nums ${negative ? "text-destructive" : positive ? "text-success" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

function Stat({
  icon: Icon, label, value, hint, tone,
}: { icon: typeof IndianRupee; label: string; value: string | number; hint?: string; tone?: "success" | "primary" }) {
  const toneClass = tone === "success" ? "text-success" : tone === "primary" ? "text-primary" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <Icon className={`mb-2 h-4 w-4 ${tone ? toneClass : "text-muted-foreground"}`} />
      <p className={`font-display text-lg font-bold tabular-nums ${toneClass}`}>{value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">{label}</p>
      {hint && <p className="mt-0.5 text-[10px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}
