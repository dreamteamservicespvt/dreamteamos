---
paths:
  - "src/components/{hr,agreement,payroll,attendance,onboarding,profile}/**"
  - "src/components/{MyIdCardCard,SalaryTimeline,ImageCropper}.tsx"
  - "src/pages/shared/{HrCenter,SendAgreement,Payroll,TeamAttendance,MySalary,MemberProfileDetail,Profit}.tsx"
  - "src/pages/accounts-admin/**"
  - "src/components/analytics/MemberAnalyticsDashboard.tsx"
  - "src/components/sales/{AttendanceCard,SalesDayCalendar}.tsx"
  - "src/pages/onboarding/**"
  - "src/pages/public/**"
  - "src/pages/main-admin/{Accounts,RevenueOverview}.tsx"
  - "src/pages/sales-admin/{Payroll,Settlements}.tsx"
  - "src/pages/sales-member/{MySalary,Settlements,MyProfile}.tsx"
  - "src/pages/tech-member/{MySalaryDashboard,MyProfile}.tsx"
  - "src/services/{hr,hrDocuments,agreements,companyAssets,publicBadge,onboarding,onboardingGuest,payroll,payrollRun,leave,settlements,techAttendance,salesCheckin,employment,salaryReceipts}.ts"
  - "src/hooks/{useMonthPayroll,useSalaryMonth,useSalesEarnings,useSalesMemberPay,useTechProductivity,useEmployeeProfile,useCompany,useCompanyLogo,usePrintDocument,useToday,usePayrollConfig,useSalaryPayments}.ts"
  - "src/types/{hr,payroll,onboarding}.ts"
  - "api/onboarding.ts"
  - "docs/firestore-rules-onboarding.md"
  - "src/utils/{agreementPdf,agreementPrint,agreementTokens,attendance,documentPages,documentRef,documentSubject,employeeId,employmentDefaults,company,hrPolicy,hrTemplates,idCard,idCardExport,leaveAllowance,onboardingLetters,payrollEngine,payslipPdf,performanceCycle,profitAnalytics,roleLadder,salesIncentive,salesPay,salesRevenue,salesTargets,signatureImage,techProductivity,imageCrop,missingLetters}.ts"
---

# People: attendance & leave, payroll & commission, HR & documents, finance — DTS-OS module context

> Part of the project context (CLAUDE.md → Context map). Claude Code loads this file automatically when a
> file matching the `paths:` above is read or edited. Section numbers are CLAUDE.md's originals, so a
> reference such as "§17.2" still points here. Keep it current per CLAUDE.md §30 step 8; the source code wins.

## 9. APPLICATION MODULES (the entries for this module)

**9.13 Attendance, check-in/out, leave** ✅. Tech: `components/attendance/*` (`DailyCheckinPrompt`,
mandatory for tech members on working days — **not shown on Sundays or on an announced
`holidays/{date}`**, so the platform opens directly; until the member has checked in on a working day it holds the popup
coordinator, so the SMM post check waits for it — 2026-10-15, `smm.md`; `CheckoutModal` with a Drive-upload declaration and, since 2026-10-03, today's finished jobs marked in the Drive or not (`todaysDriveUploads`, one-tap "Uploaded"); since 2026-10-15, for a member SMM Delivery Control covers (Live, pilot group if any), the report step lists each social-media piece of theirs due today, late or behind a checkpoint and Submit waits for a one-tap reason for each (`components/smm/alerts/CheckoutSmmReasons`, saved first by `smmDelivery.saveCheckoutReasons`; never blocks leaving if the save fails) in place of the due card, and the check-in prompt shows a line pointing to Delivery Control instead of the due card — `smm.md` §9.9; `MyDayCalendar`),
`services/techAttendance.ts` (statuses `full|half|absent|leave|half_leave|holiday` + comp-off's two; overrides and holidays
persisted, Full/Absent derived from check-ins). Sales: `services/salesCheckin.ts`,
`components/sales/AttendanceCard.tsx`. Shared grid `pages/shared/TeamAttendance.tsx` (with the
WhatsApp update step and `LeaveApprovalsPanel`); since 2026-10-08 the grid itself is
`components/attendance/AttendanceGrid.tsx` (desktop table + phone month cards; editable with `onCellClick`,
view-only without). **Social Media → Attendance** (`components/smm/SmmAttendanceView`, see `smm.md`) is the Social
Media Team Lead's TODAY board for her daily meeting — who has not checked in (Call / WhatsApp), who is on leave or
absent, who is in and since when — read live from today's `daily_checkins` (`techAttendance.watchCheckinsOnDay`,
with the times), `attendance` marks, `holidays` and pending `leave_requests`; it marks nothing. Leave: `services/leave.ts`,
`components/payroll/LeavePanel.tsx`, `utils/leaveAllowance.ts`. Collections `daily_checkins`,
`attendance` (`{memberId}_{date}`), `holidays` (`{date}`), `salesCheckins`, `leave_requests`.
**One source of truth (2026-10-09).** A day's status is `techAttendance.resolveStatus` (mark → Sunday/holiday →
check-in → past = Absent) from three reads: `attendance` marks, `holidays`, and check-ins from BOTH `daily_checkins`
and `salesCheckins` (`watchCheckedInDaysInRange` reports only after both answered; a sales record counts only with a
`checkInAt` — `isCheckInRecord`; the sales check-out writes onto the checked-in day, `recordCheckOut(…, date)`). The
days are counted by ONE tally, `payrollEngine.tallyAttendance` — used by the salary (`computeSalary`), the grid
(`AttendanceGrid` → `summarize(days, config)`), `MyDayCalendar`, `SalesDayCalendar`, the sales `AttendanceCard`
(engine figures via `useSalaryMonth`) and the analytics "Days Present" (`MemberAnalyticsDashboard`, resolved per day,
duplicates once). Sundays are never counted (a mark on one shows "Sunday, not counted in salary"). The grid and
calendars read the live policy (`hooks/usePayrollConfig`) and turn over at midnight (`hooks/useToday`, lifted from the
SMM board). Range listeners take `onError`; Team Attendance shows a read-error banner. Leave approval counts the
leave already on the ATTENDANCE record (grid marks included, Sundays not), with the live policy's allowance and cycle,
and returns the split the panel's toast reports; undo clears only days still holding the approval's mark
(`approvalMarks`); notifications link `roleHelpers.getSalaryRoute(role)` (sales members got `/tech/salary`).
Announce Holiday jumps to the cycle holding the date (`periodMonthFor`).
**Comp-off (owner, 2026-10-10).** Two more marks (`AttendanceStatus`): **W `holiday_work`** "Worked on holiday" —
only an admin marks it (grid editor, offered only on a Sunday / announced holiday), earns ONE credit for that pay
cycle whatever part of the day, adds no pay itself (an announced weekday holiday stays a paid holiday); **C
`comp_off`** "Comp Off" — a working day paid in full out of the cycle's credits (date order), never one of the paid
leaves; a C beyond the credits is unpaid (`comp_off_unpaid` deduction "Comp off without credit"). Credits never
leave their cycle. `tallyAttendance` counts W on every day before the Sunday skip (`holidayWork`, `compOff`,
`compOffUnpaid`, `compOffLeft`); `SalaryComputation` carries `holidayWorkDays/Dates`, `compOffDays`,
`compOffUnpaidDays`, `compOffLeft` (optional — absent on older frozen payments). Grid editor: W on holiday dates,
"Comp Off — paid · N left" on working days (disabled at 0); the grid summary adds "1W 1C · 0 left". Payroll and Sales
Payroll: "Comp off: N" chip + `components/payroll/CompOffPanel` with **Apply** → `payrollEngine.compOffToApply`
(earliest ABSENT days the unused credits cover, never a leave) → `techAttendance.applyCompOff` (C marks + one
"Comp Off Added" notification). My Salary's Paid Leave tile shows "Comp-off: used · left"; the payslip lists
Holidays Worked / Comp Off (paid); the SMM today board reads W as present and C as away.
**Half-day leave (owner, 2026-10-12).** Apply for leave asks **Full day / Half day** first (`LeavePanel`, the same panel on
/tech/salary and /sales/salary; default Full day). A half day is ONE working date (no To field; a Sunday is refused in the
form and by `submitLeaveRequest`), saved as `leave_requests.duration: "half_day"` with `toDate = fromDate` (a full day
writes `"full_day"`; absent = full day; `kind` is no longer written). It uses **half a day of the allowance** (2 per pay
period): the allowance is settled in half-day units, earliest first (`leaveAllowance.splitLeaveDays` with `duration` and
`alreadyApprovedHalfLeaveDates`; each day has `share` / `paid` / `unpaid` / `mark`). Approval writes **HL
`half_leave`** ("Half-day leave", indigo) when ½ is left — paid as a FULL day (the half worked + the paid leave half) — else
**H `half`**, paid as a half day; a full day that finds only ½ left is written `leave` and paid ½ (verdict "Half a day of
paid leave, then half a day unpaid"). Leave on record counts `half_leave` marks as ½ (`leaveDatesOnRecord` → `{full,
half}`); `approvalMarks` / undo read `duration`. `tallyAttendance` spends the allowance in halves across L and HL by
date: `halfLeave`, `halfLeavePaid`, `halfLeaveUnpaid`, `allowanceUsed`, `leavesLeft` may end in ½; an L day earns its
paid portion (1, ½, 0). `computeSalary`: paid HL = 1 day, unpaid HL = `halfDayFactor` (exactly an H); new lines
`half_leave` "Half-day Leave (paid)" and `half_leave_unpaid`; `SalaryComputation.paidHalfLeaveDays` /
`unpaidHalfLeaveDays` (optional — absent on older frozen payments) and `paidLeavesRemaining` = the tally's;
`deductionsFor` row `half_leave_unpaid` "Half-day leave without pay"; `paidLeaveUsed(c)`. Whole-day results are
unchanged. Shown everywhere in days (`payrollEngine.formatDayCount` "1½", `formatDays` "half a day"; the payslip prints
decimals "1.5" and its Half-day Leave rows): the LeavePanel header ("1½ of 2 paid leaves used"), preview (inside the
allowance / "costs half a day's pay") and history ("Half day · 22 Jul"); `LeaveApprovalsPanel` (Full day / Half day chip,
"one half of the day off", "at least half a day unpaid", toast "Half-day leave approved"); notifications ("Half-day Leave
Approved", "Your half-day leave request … was not approved") and audit lines; the grid (HL cells, "1HL" totals line, "Leaves
left: 1½", legend; the editor offers Half-day leave on the tech AND sales side — sales still hides plain H for hand-marking
but shows H/HL), MyDayCalendar / SalesDayCalendar chips, the sales AttendanceCard, UpdatePopup, My Salary's tiles and
deductions, Payroll's deduction rows and CSV (two columns), Sales Payroll's breakdown, Salary Management, and the Social
Media TODAY board (`half_leave` / a pending half-day request → the away group, "Half-day leave" / "Asked for a half-day
leave — not approved yet", `smmAttendance.halfDayLeaveAskedOn`).

**9.14 Payroll, salary, commission** ✅. Tech payroll `pages/shared/Payroll.tsx`,
`services/payroll.ts` (salary packages, config, bank/payout accounts), `services/payrollRun.ts`
(month runs and lines, mark paid/undo), `utils/payrollEngine.ts` (pay periods, day credit,
deductions), `hooks/useMonthPayroll.ts`, `utils/payslipPdf.ts`, `utils/techProductivity.ts`
(pay-to-work ratio; target 5%, limit 10%). Sales: `pages/sales-admin/Payroll.tsx`,
`hooks/useSalesMemberPay.ts`, `useSalesEarnings.ts`, `utils/salesIncentive.ts` (5% standard, 10% on
`incentive_10`), `utils/salesTargets.ts` (only `dailyTarget` stored), `utils/salesRevenue.ts`;
settlements `services/settlements.ts`, `pages/sales-admin/Settlements.tsx`,
`pages/sales-member/Settlements.tsx`. Member views: `tech-member/MySalaryDashboard.tsx`,
`sales-member/MySalary.tsx`, `shared/MySalary.tsx` (receipts). Collections `salary_packages`,
`payroll_config/default`, `employee_bank`, `payroll_runs`, `payroll_lines`, `salary_receipts`,
`commission_settlements`, `settlement_requests`, `audit_logs`. Cycles: the tech performance month is
**10th → 9th** (`utils/performanceCycle.ts`); the payroll cycle comes from
`PayrollConfig.payDayOfMonth`.
**Pay Salary (2026-10-09).** The payable figure is `payrollEngine.netPayable(c)` (salary − `deductionsFor` +
adjustments) everywhere: Payroll, Sales Payroll, My Salary ×2, the payslip, Salary Management. **Paid = the payment
record:** `payrollRun.isLinePaid` (completed / transferred); `useMonthPayroll` / `useSalesMemberPay` / `useSalaryMonth`
show a paid member's `payroll_lines` amount and frozen `computation` (My Salary's attendance tiles stay live) (nothing creates `payroll_runs`, so freezing on a
run never happened), keep `liveComputation` / `liveNetSalary`, and `changedSincePaid` puts "Now ₹X" + "changed after it
was paid … undo and pay again" on the row and a note on the member's page. Hooks load only when every source answered
and surface `error` (pages show it, never figures). Only ACTIVE members are listed (`roleHelpers.isActiveUser`, owner
2026-10-10 — a member deactivated before payday is paid after re-activating them in My Team). The bank banner / Verify / payout method
use `payroll.isBankComplete` / `isBankVerified` / `payoutMethodOf` (legacy top-level fields were never set; tech
Verify was a no-op). **Sales incentive = `utils/salesPay`** (`salesInPeriod`: verified money collected in the cycle by
local day; `salesIncentive`: rate × base, withheld below 75% of the cycle's target) for both Sales Payroll and
`useSalesEarnings`; a sales payment stores `incentive` on its line and the payslip itemises it (`extraEarnings`).
**Accounts linked:** `services/salaryReceipts` (receipts now carry `period`); Salary Management works on the period
being paid now (`payrollEngine.salaryMonthDue` = last calendar month's cycle — a cycle is paid after it ends), pre-fills from
`payrollRun.priceMemberForPeriod` (attendance roles: `isAttendancePaid`; others = monthly salary), warns and confirms
when Payroll already paid, shows "Paid in Payroll" for this cycle; Payroll rows list the period's receipts
(`watchPeriodReceipts`) and the Mark-paid confirm names them; `hooks/useSalaryPayments` merges both records for the
member's Payment history and Salary History.
**Periods priced on their own terms (owner, 2026-10-15 — "solve all the problems"; decisions "open on the period due, warn
before paying early" and "Payroll's rule everywhere").** The same family as the SMM dates (`smm.md` §9.9): a period
priced or counted with TODAY's values. (1) **Payroll and Sales Payroll open on the period DUE** (`salaryMonthDue`; ‹ goes
back, › only as far as the running period — `payMonthsBetween`), with "Due now" / "Not ended yet — paying it is early" /
"Past period" under the label (`payroll-period-state`); they opened on the running period, which on payday had every day
still to come (full salary) while the period due stayed unpaid. **Paying a period that has not ended asks first** ("Pay
<name> before the period ends?", destructive "Pay early", text from `payrollEngine.earlyPayWarning` naming the days not
worked yet, today included — `daysNotWorkedYet`); Upload receipt on an unpaid row asks the same. `payrollRun.markSalaryPaid`
refuses a new early payment without `earlyPayConfirmed` (`EarlyPaymentError`) and stores `payroll_lines.earlyPay {from, to,
workingDays}`; a paid-early row shows "Paid early" (`payroll-paid-early`, `sales-payroll-paid-early`). On days 1–9 of a month
the period due IS the running one, so paying it then asks. `isLinePaid` is now pure in `payrollEngine`. (2) **Receipts'
period** — 2026-08-01 → 10-10 Salary Management pre-filled the RUNNING period and receipts had no `period`, so the 10 Sep
receipt for August read as September. `utils/receiptPeriod.receiptPeriodOf`: `period` when present; else the label's
period, except a bracketed label ("September 2026 (10 Sep – 09 Oct)", only ever from that default) sent BEFORE that
period's last day → the period before. `watchPeriodReceipts(period, cb, cycleStartDay?)` (signature changed) runs three
equality queries and keeps what `receiptPeriodOf` places in the period; read by `useMonthPayroll`, `useSalesMemberPay`,
`useSalaryPayments` and Salary Management. Nothing is rewritten. (3) **Pay terms with an effective period** —
`users.payHistory[]` (`PayTermsChange`: `from` = the first pay period it applies to, `salary`, `dailyTarget`,
`earningsOption`, `previous`, `at`, `byUid`, `byName`); the top-level fields keep the LATEST terms. Resolver
`utils/payTerms` (`payTermsFor(user, period)`, `salaryFor`, `commissionTermsFor`, `termsPeriodOn(day, today)` — the period a
day falls in, never later than the running one): of the changes with `from ≤ P` the most recently saved wins; before
every change → the first one's `previous`; no history → the stored fields. Writer `services/payroll.savePayTerms` (one
transaction; appends only when salary / target / plan changed; audit `pay_terms_changed`; `assignSalaryPackage` uses it
for the running period). **"Applies from pay period"** (running −2 … +3, `applyFromChoices`) in `EditMemberModal`
(`pay-terms-from`, shown only when the terms changed) and Salary Management (`salary-applies-from`). Read through the
resolver: `useMonthPayroll`, `useSalesMemberPay`, `useSalaryMonth` / `useSalesEarnings` (option `payHistory`),
`payrollRun.computeMemberSalary` / `priceMemberForPeriod`, `profitAnalytics`, Settlements, My Performance, Leaderboard,
the renewals card, **Work Done** (`WorkDoneReport`: the salary of the period the range ends in, all-time → now) and
**Member History** (the day shown's period). "Now ₹X" compares a paid line with the terms of ITS period (a later raise
no longer flags it). (4) **One commission rule** — `utils/salesPay`: `collectionsOf(leads, owner?)` (one entry per
payment received, key `<saleId>#<payment id>` — `salePayments.collectionKey`, the money taken at the sale = `opening`,
recorded or not), `periodOfDay`, `periodIncentive` (the 75% gate on ALL verified money collected in the period,
commission on what is not excluded), `settlementCoverage` (what settlements already paid: `paidKeys`, or for older ones
the first settlement at/after the sale's FIRST approval that the collection precedes), `commissionByPeriod` (rows newest
first, status payroll / running / due / withheld / settled / none; only ENDED periods are due), `commissionInWindow`
(each period's gate on its whole money, its rate on the part inside the window; with `todayStr` (the Leaderboard,
2026-10-19) a running period under 75% returns its incentive as `accruing`, apart from `commission` — the P&L passes no
`todayStr` and is unchanged). Sales Payroll's row shows "₹X at 75% of target" under a withheld ₹0
(`payroll-incentive-gate`; the payment is unchanged). Sales Payroll (`useSalesMemberPay`, + a
listener on `commission_settlements`) leaves out collections Settlements paid and records them on the payment
(`incentive.settledBase` / `settledKeys`; note `sales-payroll-settled`); a paid row is compared with what its own payment
left out. Settlements (admin modal rewritten, member page) pay or request the due periods through
`CommissionPeriodList`, confirm first, and never pay a period with a paid `payroll_lines`;
`settlements.createSettlement({ member, admin, rows, note })` (signature changed) writes `periods`, `paidKeys`,
`breakdown` (`settlementRecord`); the notification links `/sales/settlements`. Removed from `services/settlements`:
`computeCommissionInRange`, `computeUnpaidCommission`, `countPendingInRange`, `paidThrough`. P&L commission and
`priceMemberForPeriod` use the same rule. (5) **Leave panel** — My Salary (tech and sales) give `LeavePanel` the LIVE
computation (it read the paid snapshot, so leave approved after payday was missing). (6) **Salary Management per period** —
a period stepper (`salary-period-stepper`, due by default, forward to the running period); the receipt column says for
THAT period "✓ Receipt sent · ₹X", "Paid in Payroll" (`paid-in-payroll`) or "Not sent", plus "n sent in all"; Send
Receipt opens on the period looked at; the history modal shows the period each receipt pays.

**9.15 HR & documents** ✅. `pages/shared/HrCenter.tsx` (tabs: All documents / Missing paperwork /
Agreements), `pages/shared/SendAgreement.tsx`, `components/hr/*`, `components/agreement/*`
(incl. `MandatoryAgreementGate`, non-closable), `services/hr.ts`, `hrDocuments.ts`,
`agreements.ts`, `companyAssets.ts`, `publicBadge.ts`, `onboarding.ts`, `onboardingGuest.ts`;
`utils/hrTemplates.ts`, `hrPolicy.ts`, `roleLadder.ts`, `documentPages.ts` (paginator shared by PDF
and print), `agreementPdf.ts`, `agreementPrint.ts`, `agreementTokens.ts`, `documentRef.ts`,
`idCard*.ts`; `pages/onboarding/JoinOnboarding.tsx`, `pages/public/VerifyEmployee.tsx`,
`api/onboarding.ts`. Collections `employee_profiles`, `hr_documents`, `hr_counters/{year}`
(references like `DTS/OFR/2026/0007`), `agreements`, `agreement_templates`,
`company_settings/main`, `public_badges`, `onboarding_invites`. 14 document types
(`HR_DOCUMENT_ORDER` is load-bearing; do not sort alphabetically). Both officers (CEO + CTO) sign
every type. Employment stages: `offer_issued → offer_accepted → probation → confirmed →
notice_period → exited`. **India day (2026-10-15):** `api/onboarding.ts`' `todayIso()` is the Asia/Kolkata day (Vercel runs
in UTC, so between 00:00 and 05:30 IST it was yesterday): `offerAcceptedOn`, `joiningAcceptedOn`, the starting stage
(joining today → probation), both letters' `signedDate` and the offer-expiry check; the DEV twin
(`services/onboardingGuest`) uses the local `hrPolicy.todayIso()`.

**9.16 Finance** ✅ (basic). `pages/accounts-admin/*`, `pages/main-admin/Accounts.tsx`,
`RevenueOverview.tsx`, `pages/shared/Profit.tsx`, `utils/profitAnalytics.ts`. Collections
`expenses` (CRUD), `other_income` (read only; **nothing in the code writes it**), `salary_receipts`.
Client invoices (GST, numbered `DTS/26-27/0001`, PDF) are their own module since 2026-10-08 — the accounts admin
uses them at `/invoices`; see `invoices.md` §9.22. They are not yet linked to revenue or P&L.
**Periods and days (2026-10-15).** **P&L salary cost** (`profitAnalytics.computeProfit`; input `salaryMonths` and
`salaryMonthsFor` removed, new optional `payrollLines`, `earliestDate`, `todayStr`, `cycleStartDay`): each pay period the
window touches × the share of its days inside (`periodsInWindow`) — a PAID period (a paid `payroll_lines`) costs what was
paid (the salary part: `netSalary − incentive.amount`; an older sales line `netPayable(computation)`), inactive people
included; an UNPAID period costs `salaryFor(user, period)` for people active whose account existed by its end, and a
running one only its days so far, today included (`shareToDate`; a period not started costs 0). Tech = tech members +
team leaders, sales = sales members, external creators out; commission per salesperson by `commissionInWindow`.
`pages/shared/Profit.tsx` listens to `payroll_lines` and starts the career view on the first SALE's local day (it used the
UTC day of `lead.createdAt`). **Accounts Dashboard** (`accounts-admin/Dashboard.tsx`): the four cards are `computeProfit` for
ONE pay period, the running one (`accounts-period`) — Revenue (verified sales), Expenses, Salaries & incentives, Net Profit,
which add up; before, all-time revenue (sales + the tech side's delivered value — the same work twice) − all-time expenses −
one month of today's salaries. **Revenue = APPROVED sales (owner-delegated decision, 2026-10-18, audit D-05)** — ONE rule in
`utils/salesRevenue` (`isApprovedSale`, `revenueTotals`, `revenueByDay`, `revenueByOwner`, `lastCalendarDays`, `revenueSeries`,
`awaitingApprovalLabel`; `salesBookedByDay` / `salesBookedByOwner` removed): each verified sale's agreed `amount` on its own
local day (`submittedAt`, else `lead.createdAt`), `saleItems` + legacy `saleDetails`; rejected counts nowhere; pending is
NEVER added to a revenue total or chart — it is shown beside it as "Awaiting approval: ₹X (n sales)" (StatCard `note`); money
collected stays its own figure. Revenue Overview (main admin) and Revenue Summary (accounts admin) are one builder,
`utils/revenueReport` (the cards, chart and per-member rows all follow the 7D / 30D / All range; 7 / 30 = CALENDAR days ending
today, a quiet day is 0; the tech side's verified work value is reported beside revenue, never inside it; rows are staff only).
Used too by the main admin's Dashboard ("Revenue Today", "Sales Closed Today" = today's approved / awaiting, 7-day chart),
Sales Department, the sales admin's Dashboard and the Accounts Dashboard (its 7-day chart = the last 7 calendar days). Chart
value axes use `utils/formatters.formatRupeeAxis` ("₹500", "₹1.5k", "₹1.2L" — `toFixed(0)` + "k" repeated labels). **Staff
counts** use `roleHelpers.isStaffMember` (active and not an external creator — D-04): Accounts Dashboard, Salary Management,
main admin Dashboard / Accounts. **Expense date** (Daily Expenses, main admin
Accounts): defaults to `useToday()` (local, turns over at midnight); a picked date is cleared after each entry (it was the
UTC day, set once when the page opened). The main admin's Dashboard and Tech Department use `useToday()` too (the Dashboard
re-subscribes at midnight). **Tech delivered value** (P&L, `techProductivity.memberProductivity`) counts a job on its
assignment day (`workDates.workCountsOn`; a bulk slot on `slot.assignedAt`, else `completedAt`).

## 24. BUSINESS RULES (IMPLEMENTED; verified in code)

- **Commission:** 5% standard, 10% for `incentive_10`; penalties never count toward commission;
  partial payments count on the day collected. **One rule everywhere (owner, 2026-10-15):** commission counts in the
  pay period the money was COLLECTED, at the rate that applied in that period, only when that period reached 75% of its
  target — Sales Payroll, Settlements, My Salary, My Performance, the Leaderboard and the P&L alike. Settlements pays
  only ENDED periods, never a period Sales Payroll paid nor a collection already settled; Sales Payroll leaves out every
  collection Settlements paid. (Settlements used to cover "everything verified since the last one", by date range.)
- **Pay periods (owner, 2026-10-15):** Payroll opens on the salary that is DUE; paying a period that has not ended
  needs a confirmation naming the days not worked yet, which are paid as if worked. A salary, target or plan change
  applies from the pay period chosen (default the running one) — earlier periods keep their own terms, in pay, P&L,
  ratios and "Now ₹X". A receipt belongs to the period it pays. A P&L charges a paid salary what was paid, an unpaid
  one its terms, and a running period only its days so far. Every stored or compared day is the India day.
- **Revenue (2026-10-18, owner-delegated):** "revenue" everywhere means approved (verified) sales, valued at the sale's
  amount on the sale's own India day. Sales awaiting approval are shown beside it ("Awaiting approval: ₹X (n sales)"),
  never added in; rejected sales count nowhere; the tech side's delivered value is never revenue. External creators are
  never counted as staff.
- **Sales targets:** only `dailyTarget` is stored; monthly is derived across the pay cycle.
- **Tech performance month:** 10th → 9th; work counts on its **assignment** date.
- **Tech productivity:** pay/work-value ratio target 5%, watch up to 10%, over 10% flagged.
- **Tech attendance:** manual override wins → Sunday or announced holiday = holiday → checked in
  = full → past with no check-in = absent. The monthly leave quota constant is 2. Leave past the
  allowance counts as absence.
- **Attendance → salary (owner, 2026-10-09):** one count of days for the grid, the calendars and the salary. A mark
  on a **Sunday never changes pay** and is not counted (nor does it use a paid-leave day). A **rejected check-in
  (Member History) stays Present** — to deduct, mark the day on the grid. A **paid salary is the payment record**:
  later attendance or sales corrections are flagged against it ("Now ₹X"), never written over it; settle by undoing
  the payment and paying again. Inactive people are not listed on any pay screen (owner, 2026-10-10); a **joiner**'s days
  before joining stay Absent (pay is pro-rata either way). Sales Payroll pays the same incentive the member's
  My Salary shows. Accounts' receipts start from the attendance figure and warn when Payroll already paid the period;
  **Comp-off (owner, 2026-10-10):** an admin marks a holiday someone worked (W); each one, even half a day, lets one
  absence in the SAME pay cycle become a paid Comp Off day (C) — one click in Payroll or by hand on the grid — without
  touching the two paid leaves; unused credits lapse with the cycle;
  the member's history lists both.
- **Half-day leave (owner, 2026-10-12):** a member (tech or sales) applies for a Full day or a Half day; a half day is one
  working day and uses half a day of the two paid leaves. Inside the allowance the day is paid in full; past it the day
  is recorded as a half day and costs half a day's pay (exactly what a Half Day costs, at the policy's factor). A full day
  of leave that finds only half a day of allowance left is half paid. Approve, reject, undo, the grid, the calendars,
  the salary, the payslip and the Social Media board all show and count it as half a day.
- **Check-out** requires the Drive-upload declaration first; the daily check-in prompt cannot be
  dismissed on a working day, and does not appear on a Sunday or an announced holiday. A member SMM Delivery Control
  covers (Live) gives a reason for each social-media piece of theirs that is due, late or behind before checking out
  (owner, 2026-10-15, decision 8).
- **HR:** 14 document types in lifecycle order; both officers sign all types (falls back to the
  issuing admin); references `DTS/<TYPE>/<year>/<seq>` are allocated in a transaction with a 6s
  timeout; unsigned agreements trigger a non-closable signing gate; bulk sends tokenise personal
  values so one person's salary never reaches another; intern letters say "stipend".

## 25. CURRENT IMPLEMENTATION STATUS

**PARTIALLY IMPLEMENTED 🟡:**
- Accounts admin module: basic CRUD and read-only summaries; `other_income` read but never
  written by the app.
- Pay Salary (2026-10-09): a salary paid and then corrected is settled by hand (undo + pay again) — there is no
  "pay the difference" record. A receipt and a Payroll payment for the same period are two records (both warn
  before the second is made; old receipts without `period` are placed by `receiptPeriodOf` since 2026-10-15); the member's
  "Total received" adds both. Undoing a leave approval does not re-settle the member's other approved requests (a
  later request's absence days stay absent). Per-employee weekly offs from HR (`workingDays`, e.g. "Monday to
  Friday") are printed on letters but the engine only knows Sunday. The cycle start and leave allowance come from
  `payroll_config/default`, which no screen edits (defaults apply). Checked by unit tests, the real hooks/pages on
  the in-memory Firestore and a real-browser harness — not against live Firebase.

- Half-day leave (2026-10-12): one date per request (two half days are two requests); which half (morning / afternoon)
  is not recorded. A half day past the allowance is written as a plain Half Day (H), so the grid no longer shows it was
  leave (the request still says so). An admin can hand-mark HL on the grid; nothing stops an HL on a day with no request
  (as with L). The payslip prints halves as decimals ("1.5"). Checked by unit tests (`halfDayLeaveOct12`: the split, the
  tally at factors 0.5 and 0.75, deductions, the payslip text, LeavePanel and LeaveApprovalsPanel, approval / reject /
  undo on the in-memory Firestore; every older payroll / attendance / leave suite unchanged) and a real-browser harness
  — not against live Firebase.

- Pay periods and the commission rule (2026-10-15): behaviour the owner should confirm — Settlements pays ended periods
  only (a member can no longer request a running one); the Accounts Dashboard shows ONE pay period and no longer adds the
  tech side's delivered value to revenue; every revenue card and chart counts approved sales only (since 2026-10-18;
  pending is shown beside it). Open: a sale revoked and re-approved before 2026-10-15 has no
  `firstVerifiedAt`, so legacy settlement coverage can miss it; no claw-back when a settled sale is rejected later; the
  renewals card and My Performance's Option 1 / 2 are estimates; a receipt sent ON its labelled period's last day keeps
  that label's period; "most recently saved" pay change wins for a period (same as "latest from" when saved in order);
  Salary Management's "Total monthly salary", team lists and profiles still show today's salary. `users` stays under the
  catch-all rule, so a member could still write their own `payHistory` / `salary` (pre-existing gap). Checked by jsdom
  page tests and the services on the in-memory Firestore (`payPeriodsOct15`, `commissionRuleOct15`, `collectedOnOct15`,
  `payLeftoversOct15`, `datesIstOct15`, rewritten `settlements`, `salePayments`, `profitAnalytics`, `techProductivity`
  tests) — not against live Firebase; the real-browser check (Payroll's due period and early-pay confirmation) is in the 2026-10-15 history entry.

**NOT IMPLEMENTED ❌** (referenced or planned, absent in code):
- CTC breakup annexure on offer letters (needs salary-structure percentages).
- Template editor with versions for HR letters (explicitly declined).
