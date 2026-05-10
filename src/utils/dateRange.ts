import { format, isValid, parseISO, startOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";

export function normalizeDateRange(range: DateRange | undefined): DateRange | undefined {
  if (!range?.from) return undefined;

  const from = startOfDay(range.from);
  const toSource = range.to ?? range.from;
  const to = startOfDay(toSource);

  if (to < from) {
    return { from: to, to: from };
  }

  return { from, to };
}

export function isDateWithinRange(dateStr: string | undefined, range: DateRange | undefined): boolean {
  if (!range?.from || !dateStr) return false;

  const fromStr = format(startOfDay(range.from), "yyyy-MM-dd");
  const toStr = format(startOfDay(range.to ?? range.from), "yyyy-MM-dd");

  return dateStr >= fromStr && dateStr <= toStr;
}

export function formatDateRangeLabel(range: DateRange | undefined, emptyLabel = "All Days"): string {
  if (!range?.from) return emptyLabel;
  const fromLabel = format(range.from, "dd/MM/yyyy");
  const toLabel = format(range.to ?? range.from, "dd/MM/yyyy");
  return fromLabel === toLabel ? fromLabel : `${fromLabel} - ${toLabel}`;
}

export function parseQueryDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const parsed = parseISO(value);
  return isValid(parsed) ? startOfDay(parsed) : undefined;
}

export function parseQueryDateRange(fromValue: string | null, toValue: string | null): DateRange | undefined {
  const from = parseQueryDate(fromValue);
  const to = parseQueryDate(toValue);

  if (!from && !to) return undefined;
  return normalizeDateRange({ from: from ?? to, to: to ?? from });
}