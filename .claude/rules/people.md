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
`holidays/{date}`**, so the platform opens directly; `CheckoutModal` with a Drive-upload declaration and, since 2026-10-03, today's finished jobs marked in the Drive or not (`todaysDriveUploads`, one-tap "Uploaded"); `MyDayCalendar`),
`services/techAttendance.ts` (statuses `full|half|absent|leave|holiday`; overrides and holidays
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
notice_period → exited`.

**9.16 Finance** ✅ (basic). `pages/accounts-admin/*`, `pages/main-admin/Accounts.tsx`,
`RevenueOverview.tsx`, `pages/shared/Profit.tsx`, `utils/profitAnalytics.ts`. Collections
`expenses` (CRUD), `other_income` (read only; **nothing in the code writes it**), `salary_receipts`.
Client invoices (GST, numbered `DTS/26-27/0001`, PDF) are their own module since 2026-10-08 — the accounts admin
uses them at `/invoices`; see `invoices.md` §9.22. They are not yet linked to revenue or P&L.

## 24. BUSINESS RULES (IMPLEMENTED; verified in code)

- **Commission:** 5% standard, 10% for `incentive_10`; penalties never count toward commission;
  partial payments count on the day collected. Settlements cover sequential date ranges.
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
- **Check-out** requires the Drive-upload declaration first; the daily check-in prompt cannot be
  dismissed on a working day, and does not appear on a Sunday or an announced holiday.
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
  before the second is made; old receipts without `period` are matched on their printed label); the member's
  "Total received" adds both. Undoing a leave approval does not re-settle the member's other approved requests (a
  later request's absence days stay absent). Per-employee weekly offs from HR (`workingDays`, e.g. "Monday to
  Friday") are printed on letters but the engine only knows Sunday. The cycle start and leave allowance come from
  `payroll_config/default`, which no screen edits (defaults apply). Checked by unit tests, the real hooks/pages on
  the in-memory Firestore and a real-browser harness — not against live Firebase.

**NOT IMPLEMENTED ❌** (referenced or planned, absent in code):
- CTC breakup annexure on offer letters (needs salary-structure percentages).
- Template editor with versions for HR letters (explicitly declined).
