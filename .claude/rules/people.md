---
paths:
  - "src/components/{hr,agreement,payroll,attendance,onboarding,profile}/**"
  - "src/components/{MyIdCardCard,SalaryTimeline,ImageCropper}.tsx"
  - "src/pages/shared/{HrCenter,SendAgreement,Payroll,TeamAttendance,MySalary,MemberProfileDetail,Profit}.tsx"
  - "src/pages/accounts-admin/**"
  - "src/pages/onboarding/**"
  - "src/pages/public/**"
  - "src/pages/main-admin/{Accounts,RevenueOverview}.tsx"
  - "src/pages/sales-admin/{Payroll,Settlements}.tsx"
  - "src/pages/sales-member/{MySalary,Settlements,MyProfile}.tsx"
  - "src/pages/tech-member/{MySalaryDashboard,MyProfile}.tsx"
  - "src/services/{hr,hrDocuments,agreements,companyAssets,publicBadge,onboarding,onboardingGuest,payroll,payrollRun,leave,settlements,techAttendance,salesCheckin,employment}.ts"
  - "src/hooks/{useMonthPayroll,useSalaryMonth,useSalesEarnings,useSalesMemberPay,useTechProductivity,useEmployeeProfile,useCompany,useCompanyLogo,usePrintDocument}.ts"
  - "src/types/{hr,payroll,onboarding}.ts"
  - "api/onboarding.ts"
  - "docs/firestore-rules-onboarding.md"
  - "src/utils/{agreementPdf,agreementPrint,agreementTokens,attendance,documentPages,documentRef,documentSubject,employeeId,employmentDefaults,company,hrPolicy,hrTemplates,idCard,idCardExport,leaveAllowance,onboardingLetters,payrollEngine,payslipPdf,performanceCycle,profitAnalytics,roleLadder,salesIncentive,salesRevenue,salesTargets,signatureImage,techProductivity,imageCrop,missingLetters}.ts"
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
WhatsApp update step and `LeaveApprovalsPanel`). Leave: `services/leave.ts`,
`components/payroll/LeavePanel.tsx`, `utils/leaveAllowance.ts`. Collections `daily_checkins`,
`attendance` (`{memberId}_{date}`), `holidays` (`{date}`), `salesCheckins`, `leave_requests`.

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

## 24. BUSINESS RULES (IMPLEMENTED; verified in code)

- **Commission:** 5% standard, 10% for `incentive_10`; penalties never count toward commission;
  partial payments count on the day collected. Settlements cover sequential date ranges.
- **Sales targets:** only `dailyTarget` is stored; monthly is derived across the pay cycle.
- **Tech performance month:** 10th → 9th; work counts on its **assignment** date.
- **Tech productivity:** pay/work-value ratio target 5%, watch up to 10%, over 10% flagged.
- **Tech attendance:** manual override wins → Sunday or announced holiday = holiday → checked in
  = full → past with no check-in = absent. The monthly leave quota constant is 2. Leave past the
  allowance counts as absence.
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

**NOT IMPLEMENTED ❌** (referenced or planned, absent in code):
- CTC breakup annexure on offer letters (needs salary-structure percentages).
- Template editor with versions for HR letters (explicitly declined).
