import { useEffect, useState } from "react";
import { watchPayrollConfig } from "@/services/payroll";
import { DEFAULT_PAYROLL_CONFIG, type PayrollConfig } from "@/types/payroll";

/**
 * The live payroll policy (`payroll_config/default`, the documented defaults while unset).
 *
 * For the attendance screens (2026-10-09): the grid and the calendars counted leave against a
 * hard-coded allowance of two and drew the cycle from the default pay day, while the salary read
 * both from this document — one policy, read by everyone, so the counts cannot part ways if it is
 * ever changed. One document read per screen.
 */
export function usePayrollConfig(): PayrollConfig {
  const [config, setConfig] = useState<PayrollConfig>(DEFAULT_PAYROLL_CONFIG);
  useEffect(() => watchPayrollConfig(setConfig), []);
  return config;
}
