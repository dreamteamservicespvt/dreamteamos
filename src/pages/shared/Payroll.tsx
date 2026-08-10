import { useMemo, useRef, useState } from "react";
import { format, parse } from "date-fns";
import {
  AlertTriangle, BadgeCheck, Banknote, CalendarClock, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  Download, ExternalLink, FileText, Film, IndianRupee, Loader2, Search, ShieldCheck, Undo2, Upload, Users, Wallet,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useFirestoreCollection } from "@/hooks/useFirestore";
import { useMonthPayroll, type PayrollRow } from "@/hooks/useMonthPayroll";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import { formatCurrency } from "@/utils/formatters";
import { uploadToCloudinary } from "@/services/cloudinary";
import { isBankComplete, payoutSummary, verifyEmployeeBank } from "@/services/payroll";
import { setEmployeeId } from "@/services/employment";
import { markSalaryPaid, undoSalaryPayment } from "@/services/payrollRun";
import { downloadPayslip } from "@/utils/payslipPdf";
import { currentPayMonth, deductionsFor, payPeriodLabel, shiftPayMonth } from "@/utils/payrollEngine";
import { useTechProductivity } from "@/hooks/useTechProductivity";
import { formatRatio, ratioBand, RATIO_BAND_STYLE, RATIO_TARGET, RATIO_LIMIT } from "@/utils/techProductivity";
import type { AppUser } from "@/types";

/**
 * Payroll — pay the team.
 *
 * Deliberately plain: salaries are derived live from attendance, the admin pays on the 10th,
 * records the payment with a receipt, and can undo a mistake. There is no approval pipeline and
 * no salary-package abstraction — those added ceremony without adding safety for a team this
 * size, and every action here is reversible and audit-logged instead.
 */

export default function Payroll() {
  const user = useAuthStore(s => s.user);
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const canManage = user?.role === "tech_admin" || user?.role === "main_admin";
  const isTeamLeader = user?.role === "tech_team_leader";

  const { data: allUsers, loading: usersLoading } = useFirestoreCollection<AppUser>("users");

  const members = useMemo(() => {
    // External creators have no salary — never in payroll.
    const base = allUsers.filter(u => u.role === "tech_member" && u.isActive && !u.externalCreator);
    return isTeamLeader ? base.filter(u => u.createdBy === user?.createdBy) : base;
  }, [allUsers, isTeamLeader, user?.createdBy]);

  const [monthOffset, setMonthOffset] = useState(0);
  // The pay period we are IN, stepped by the ‹ › buttons. The calendar month names a period that
  // has not started for the first nine days of every month — see payrollEngine.currentPayMonth.
  const month = shiftPayMonth(currentPayMonth(), monthOffset);
  const monthLabel = payPeriodLabel(month);

  const [search, setSearch] = useState("");
  const [showUnpaidOnly, setShowUnpaidOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingReceiptRow = useRef<PayrollRow | null>(null);

  const { loading, rows, payDay, totals, period } = useMonthPayroll(members, month);


  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(row => {
      if (showUnpaidOnly && row.line?.paymentStatus === "completed") return false;
      if (!q) return true;
      return row.member.name?.toLowerCase().includes(q) || row.member.email?.toLowerCase().includes(q);
    });
  }, [rows, search, showUnpaidOnly]);

  /** Net payable framed as salary minus deductions — the same framing the employee sees. */
  const netOf = (row: PayrollRow) => {
    const { total } = deductionsFor(row.computation);
    return Math.max(0, row.computation.monthlySalary - total);
  };

  const paidCount = rows.filter(r => r.line?.paymentStatus === "completed").length;
  const totalPayable = filtered.reduce((sum, r) => sum + netOf(r), 0);
  /**
   * What each member actually produced this period, against what they cost.
   *
   * The payroll page showed only the cost, so "is this person worth it?" was a question nobody
   * could answer from the one screen where it gets decided. Keyed on the SAME pay period the
   * salary is calculated for, so the two halves of the ratio describe the same weeks.
   */
  const productivityMembers = useMemo(
    () => rows.map(r => ({ uid: r.member.uid, pay: netOf(r) })),
    [rows], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const productivityFilter = useMemo(
    () => ({ mode: "month" as const, month, day: "", monthBasis: "cycle" as const }),
    [month],
  );
  const { byUid: productivity } = useTechProductivity(productivityMembers, productivityFilter, period);

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleMarkPaid = async (row: PayrollRow) => {
    if (!user) return;
    const { confirmed, inputValue } = await confirm({
      title: `Pay ${row.member.name}?`,
      description: `${formatCurrency(netOf(row))} for ${monthLabel} via ${payoutSummary(row.bank)}. You can undo this afterwards if something's wrong.`,
      confirmText: "Mark as paid",
      withInput: true,
      inputPlaceholder: "Transaction ID (optional)",
    });
    if (!confirmed) return;

    setBusyUid(row.member.uid);
    try {
      await markSalaryPaid(
        { month, member: row.member, netSalary: netOf(row), computation: row.computation },
        { uid: user.uid, name: user.name },
        { transactionId: inputValue?.trim() || undefined, paidVia: row.bank?.method },
      );
      toast({ title: "Marked paid", description: `${row.member.name} · ${formatCurrency(netOf(row))}` });
    } catch (error) {
      console.error("Failed to mark salary paid:", error);
      toast({ title: "Could not record payment", variant: "destructive" });
    } finally {
      setBusyUid(null);
    }
  };

  /** Undo — the safety net. Every payment can be reversed, and the reversal is audit-logged. */
  const handleUndoPayment = async (row: PayrollRow) => {
    if (!user || !row.line) return;
    const { confirmed } = await confirm({
      title: `Undo payment for ${row.member.name}?`,
      description: `This reverses the ${formatCurrency(row.line.netSalary)} payment record for ${monthLabel}. The employee will see it as unpaid again. This is recorded in the audit log.`,
      confirmText: "Undo payment",
      variant: "destructive",
    });
    if (!confirmed) return;

    setBusyUid(row.member.uid);
    try {
      await undoSalaryPayment(row.line, { uid: user.uid, name: user.name });
      toast({ title: "Payment undone", description: `${row.member.name} is marked unpaid again.` });
    } catch (error) {
      console.error("Failed to undo payment:", error);
      toast({ title: "Could not undo payment", variant: "destructive" });
    } finally {
      setBusyUid(null);
    }
  };

  const handlePickReceipt = (row: PayrollRow) => {
    pendingReceiptRow.current = row;
    fileInputRef.current?.click();
  };

  const handleReceiptSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const row = pendingReceiptRow.current;
    e.target.value = "";
    if (!file || !row || !user) return;

    setUploadingFor(row.member.uid);
    try {
      const url = await uploadToCloudinary(file);
      await markSalaryPaid(
        { month, member: row.member, netSalary: netOf(row), computation: row.computation },
        { uid: user.uid, name: user.name },
        { receiptUrl: url, receiptName: file.name, paidVia: row.bank?.method },
      );
      toast({ title: "Receipt uploaded", description: `${row.member.name}'s payment recorded.` });
    } catch (error) {
      console.error("Failed to upload receipt:", error);
      toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setUploadingFor(null);
      pendingReceiptRow.current = null;
    }
  };

  const handleVerifyBank = async (row: PayrollRow) => {
    if (!user) return;
    setBusyUid(row.member.uid);
    try {
      await verifyEmployeeBank(row.member.uid, row.member.name, { uid: user.uid, name: user.name });
      toast({ title: "Payout details verified", description: row.member.name });
    } catch (error) {
      console.error("Failed to verify bank details:", error);
      toast({ title: "Could not verify details", variant: "destructive" });
    } finally {
      setBusyUid(null);
    }
  };

  const handlePayslip = (row: PayrollRow) => {
    downloadPayslip({
      month,
      employeeName: row.member.name,
      employeeId: row.member.employeeId,
      role: "Tech Member",
      computation: row.computation,
      netPayable: netOf(row),
      paymentMethod: payoutSummary(row.bank),
      paymentStatus: row.line?.paymentStatus === "completed" ? "Paid" : "Pending",
      transactionId: row.line?.transactionId,
      paymentDate: row.line?.paidAt && typeof row.line.paidAt === "object" && "seconds" in row.line.paidAt
        ? new Date((row.line.paidAt as { seconds: number }).seconds * 1000)
        : null,
    });
  };

  const handleExport = () => {
    const headers = [
      "Employee", "Monthly Salary", "Absent", "Half Days", "Unpaid Leave", "Deductions", "Net Payable",
      // The productivity half. Exported alongside the cost because the comparison is the point —
      // a spreadsheet of salaries with no output beside them is what this replaces.
      "Videos Delivered", "Work Value", "Pay-to-Work %",
      "Status", "Transaction ID",
    ];
    const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      headers.join(","),
      ...filtered.map(r => {
        const { total } = deductionsFor(r.computation);
        const prod = productivity[r.member.uid];
        return [
          r.member.name, r.computation.monthlySalary, r.computation.absentDays, r.computation.halfDays,
          r.computation.unpaidLeaveDays, Math.round(total), Math.round(netOf(r)),
          prod?.videos ?? 0, Math.round(prod?.workValue ?? 0),
          // Blank rather than 0 when nothing was delivered: 0% is the best possible score, and a
          // spreadsheet cannot show a tooltip explaining that it means the opposite.
          prod?.ratioPercent === null || prod === undefined ? "" : prod.ratioPercent.toFixed(1),
          r.line?.paymentStatus === "completed" ? "Paid" : "Pending", r.line?.transactionId ?? "",
        ].map(escape).join(",");
      }),
    ].join("\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: `${filtered.length} rows downloaded.` });
  };

  if (usersLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5 pb-8">
      {ConfirmDialog}
      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" onChange={handleReceiptSelected} className="hidden" />

      {/* Header */}
      <header className="rounded-2xl border border-border bg-gradient-to-br from-card via-card to-accent/25 p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
              <Wallet className="h-3 w-3" />
              {canManage ? "Salary payments" : "Team payroll (view only)"}
            </div>
            <h1 className="font-display text-xl font-bold text-foreground md:text-2xl">Payroll</h1>
            <p className="mt-1 text-xs text-muted-foreground md:text-sm">
              Period <strong className="text-foreground">{format(parse(period.start, "yyyy-MM-dd", new Date()), "dd MMM")} – {format(parse(period.end, "yyyy-MM-dd", new Date()), "dd MMM yyyy")}</strong> · pay on the {payDay.date.getDate()}th and record the receipt.
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

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={IndianRupee} label="Total Payroll" value={formatCurrency(totalPayable)} tone="primary" />
        <Stat icon={Users} label="Employees" value={members.length} hint={`${paidCount} paid`} />
        <Stat icon={CheckCircle2} label="Paid" value={formatCurrency(totals.paid)} tone="success" />
        <Stat icon={CalendarClock} label="Next Pay Day"
          value={payDay.daysRemaining === 0 ? "Today" : `${payDay.daysRemaining}d`}
          hint={format(payDay.date, "dd MMM")} />
      </section>

      {totals.bankMissing > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            <p className="text-sm font-semibold text-foreground">
              {totals.bankMissing} employee{totals.bankMissing === 1 ? "" : "s"} can't be paid yet
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              They haven't added payout details. They're prompted on every login until they do.
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:items-center md:p-4">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder="Search employee..." value={search} onChange={e => setSearch(e.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
        <button onClick={() => setShowUnpaidOnly(v => !v)}
          className={`h-10 rounded-xl border px-4 text-xs font-medium transition-colors ${
            showUnpaidOnly ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"
          }`}>
          Unpaid only
        </button>
        <button onClick={handleExport} disabled={filtered.length === 0}
          className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border px-4 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50">
          <Download className="h-3.5 w-3.5" /> Export
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-16 text-center">
          <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">
            {rows.length === 0 ? "No employees to pay" : "No employees match this filter"}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="hidden grid-cols-12 gap-3 border-b border-border bg-accent/30 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
            <span className="col-span-4">Employee</span>
            <span className="col-span-2 text-right">Salary</span>
            <span className="col-span-2 text-right">Deductions</span>
            <span className="col-span-2 text-right">Net Payable</span>
            <span className="col-span-2">Status</span>
          </div>

          <div className="divide-y divide-border">
            {filtered.map(row => {
              const { rows: dedRows, total: dedTotal } = deductionsFor(row.computation);
              const net = netOf(row);
              const isPaid = row.line?.paymentStatus === "completed";
              const isOpen = expanded === row.member.uid;
              const bankOk = isBankComplete(row.bank);
              const busy = busyUid === row.member.uid || uploadingFor === row.member.uid;
              const prod = productivity[row.member.uid];

              return (
                <div key={row.member.uid}>
                  <button onClick={() => setExpanded(isOpen ? null : row.member.uid)} aria-expanded={isOpen}
                    className="grid w-full grid-cols-2 gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/30 lg:grid-cols-12 lg:items-center">
                    <div className="col-span-2 flex min-w-0 items-center gap-2.5 lg:col-span-4">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-role-tech-member/15 text-xs font-bold text-role-tech-member">
                        {row.member.name?.charAt(0)?.toUpperCase() || "?"}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{row.member.name}</p>
                        <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                          {bankOk
                            ? <>{row.bank?.verified && <ShieldCheck className="h-2.5 w-2.5 shrink-0 text-success" />}{payoutSummary(row.bank)}</>
                            : <span className="text-warning">Payout details missing</span>}
                        </p>
                        {/* What they produced, against what they cost — the reason this page can
                            answer "is this person worth it?" rather than only "what do we owe?". */}
                        {prod && (
                          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Film className="h-2.5 w-2.5" />
                              {prod.videos} {prod.videos === 1 ? "video" : "videos"}
                            </span>
                            <span className="font-mono tabular-nums text-muted-foreground">
                              {formatCurrency(prod.workValue)}
                            </span>
                            <span data-test="pay-to-work-ratio"
                              title={`${RATIO_BAND_STYLE[ratioBand(prod.ratioPercent)].label}${prod.inProgress ? " · so far this period" : ""}`}
                              className={`rounded-full px-1.5 py-px font-semibold ${RATIO_BAND_STYLE[ratioBand(prod.ratioPercent)].className}`}>
                              {formatRatio(prod.ratioPercent)}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="lg:col-span-2 lg:text-right">
                      <p className="font-mono text-sm tabular-nums text-foreground">{formatCurrency(row.computation.monthlySalary)}</p>
                    </div>

                    <div className="lg:col-span-2 lg:text-right">
                      <p className={`font-mono text-sm tabular-nums ${dedTotal > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                        {dedTotal > 0 ? `−${formatCurrency(dedTotal)}` : "—"}
                      </p>
                    </div>

                    <div className="lg:col-span-2 lg:text-right">
                      <p className="font-display text-base font-bold tabular-nums text-foreground">{formatCurrency(net)}</p>
                    </div>

                    <div className="flex items-center gap-2 lg:col-span-2">
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
                      {/* Employee ID — assigned by the admin, printed on the payslip. */}
                      {canManage && <EmployeeIdField member={row.member} />}

                      {/* Deduction detail */}
                      <div className="rounded-xl border border-border bg-card p-3.5">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Salary calculation
                        </p>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            Monthly salary · {row.computation.workingDays} working days · ₹{row.computation.dailySalary.toFixed(2)}/day
                          </span>
                          <span className="font-mono tabular-nums text-foreground">{formatCurrency(row.computation.monthlySalary)}</span>
                        </div>
                        {dedRows.map(d => (
                          <div key={d.label} className="mt-1.5 flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{d.label} ({d.days} {d.days === 1 ? "day" : "days"})</span>
                            <span className="font-mono tabular-nums text-destructive">−{formatCurrency(d.amount)}</span>
                          </div>
                        ))}
                        <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2.5">
                          <span className="text-sm font-semibold text-foreground">Net payable</span>
                          <span className="font-display text-lg font-bold tabular-nums text-success">{formatCurrency(net)}</span>
                        </div>
                      </div>

                      {/*
                        Pay against output.

                        Deliberately next to the salary calculation rather than on a dashboard
                        somewhere: this is the screen where the decision about a person is actually
                        taken, and a number that lives anywhere else is a number nobody reads at
                        the moment it matters.
                      */}
                      {prod && (
                        <div className="rounded-xl border border-border bg-card p-3.5" data-test="productivity-detail">
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Work delivered this period
                          </p>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              {prod.videos} {prod.videos === 1 ? "video" : "videos"} delivered
                              {prod.inProgress && " so far"}
                            </span>
                            <span className="font-mono tabular-nums text-foreground">{formatCurrency(prod.workValue)}</span>
                          </div>
                          <div className="mt-1.5 flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              {prod.inProgress ? "Salary so far this period" : "Paid to them"}
                            </span>
                            <span className="font-mono tabular-nums text-foreground">{formatCurrency(prod.pay)}</span>
                          </div>
                          <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2.5">
                            <span className="text-sm font-semibold text-foreground">Pay-to-work</span>
                            <span className={`rounded-full px-2 py-0.5 font-mono text-sm font-bold tabular-nums ${RATIO_BAND_STYLE[ratioBand(prod.ratioPercent)].className}`}>
                              {formatRatio(prod.ratioPercent)}
                            </span>
                          </div>
                          <p className="mt-1.5 text-[11px] text-muted-foreground">
                            {prod.ratioPercent === null
                              ? "Nothing delivered in this period yet, so there is no ratio to measure the salary against."
                              : `${RATIO_BAND_STYLE[ratioBand(prod.ratioPercent)].label}. Target is ${RATIO_TARGET}% of the value delivered; past ${RATIO_LIMIT}% we are paying beyond the estimated margin.`}
                            {prod.inProgress && " This period is still running, so both figures are counted to today."}
                          </p>
                        </div>
                      )}

                      {/* Receipt */}
                      {row.line?.receiptUrl && (
                        <a href={row.line.receiptUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-success/10 px-3 py-1.5 text-xs font-medium text-success transition-colors hover:bg-success/20">
                          <FileText className="h-3.5 w-3.5" />
                          {row.line.receiptName || "View receipt"}
                          <ExternalLink className="h-3 w-3 opacity-70" />
                        </a>
                      )}
                      {row.line?.transactionId && (
                        <p className="font-mono text-[11px] text-muted-foreground">Txn: {row.line.transactionId}</p>
                      )}

                      {/* Actions */}
                      <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => handlePayslip(row)}
                          className="flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent">
                          <Download className="h-3.5 w-3.5" /> Salary slip
                        </button>

                        {canManage && (
                          <>
                            {!row.bank?.verified && bankOk && (
                              <button onClick={() => handleVerifyBank(row)} disabled={busy}
                                className="flex h-9 items-center gap-1.5 rounded-xl border border-success/40 bg-success/10 px-3 text-xs font-medium text-success transition-colors hover:bg-success/20 disabled:opacity-50">
                                <ShieldCheck className="h-3.5 w-3.5" /> Verify details
                              </button>
                            )}

                            <button onClick={() => handlePickReceipt(row)} disabled={busy}
                              className="flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50">
                              {uploadingFor === row.member.uid
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Upload className="h-3.5 w-3.5" />}
                              {row.line?.receiptUrl ? "Replace receipt" : "Upload receipt"}
                            </button>

                            {isPaid ? (
                              <button onClick={() => handleUndoPayment(row)} disabled={busy}
                                className="flex h-9 items-center gap-1.5 rounded-xl border border-warning/40 bg-warning/10 px-3 text-xs font-medium text-warning transition-colors hover:bg-warning/20 disabled:opacity-50">
                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />} Undo payment
                              </button>
                            ) : (
                              <button onClick={() => handleMarkPaid(row)} disabled={busy || !bankOk}
                                title={bankOk ? undefined : "Payout details incomplete"}
                                className="flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Banknote className="h-3.5 w-3.5" />} Mark paid
                              </button>
                            )}
                          </>
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

function Stat({
  icon: Icon, label, value, hint, tone,
}: {
  icon: typeof IndianRupee;
  label: string;
  value: string | number;
  hint?: string;
  tone?: "success" | "warning" | "primary";
}) {
  const toneClass = tone === "success" ? "text-success"
    : tone === "warning" ? "text-warning"
    : tone === "primary" ? "text-primary"
    : "text-foreground";

  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <Icon className={`mb-2 h-4 w-4 ${tone ? toneClass : "text-muted-foreground"}`} />
      <p className={`font-display text-lg font-bold tabular-nums ${toneClass}`}>{value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">{label}</p>
      {hint && <p className="mt-0.5 text-[10px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

/**
 * Inline editor for a member's company employee ID.
 *
 * Kept in the expanded row rather than a modal: it's a one-field edit an admin makes once when
 * someone joins, and a dialog for a single text box is more ceremony than the task deserves.
 */
function EmployeeIdField({ member }: { member: AppUser }) {
  const { toast } = useToast();
  const [value, setValue] = useState(member.employeeId ?? "");
  const [saving, setSaving] = useState(false);

  // Follow the record when another admin changes it mid-session.
  const saved = member.employeeId ?? "";
  const dirty = value.trim().toUpperCase() !== saved;

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await setEmployeeId(member.uid, value);
      toast({ title: "Employee ID saved", description: `${member.name} · ${value.trim().toUpperCase() || "cleared"}` });
    } catch {
      toast({ title: "Could not save employee ID", variant: "destructive" });
      setValue(saved);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3.5">
      <BadgeCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Employee ID</p>
        <p className="text-[10px] text-muted-foreground/70">Printed on this member's salary slip.</p>
      </div>
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") void save(); }}
        placeholder="DTS-001"
        maxLength={24}
        className="ml-auto h-9 w-32 rounded-lg border border-border bg-background px-3 font-mono text-xs uppercase text-foreground outline-none focus:border-primary"
      />
      <button
        onClick={save} disabled={!dirty || saving}
        className="h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
      </button>
    </div>
  );
}
