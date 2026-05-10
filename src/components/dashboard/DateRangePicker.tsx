import { useState } from "react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DashboardDateRangePickerProps {
  value: DateRange | undefined;
  onSelect: (range: DateRange | undefined) => void;
}

function getLabel(range: DateRange | undefined) {
  if (!range?.from) return "Select range";
  if (!range.to) return `${format(range.from, "dd/MM/yyyy")} - ...`;
  return `${format(range.from, "dd/MM/yyyy")} - ${format(range.to, "dd/MM/yyyy")}`;
}

export default function DashboardDateRangePicker({ value, onSelect }: DashboardDateRangePickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-10 min-w-[172px] justify-start rounded-xl border-border/70 bg-background/80 px-3.5 text-xs font-medium shadow-sm backdrop-blur-sm transition-all hover:border-primary/40 hover:bg-accent/60",
            !value?.from && "text-muted-foreground"
          )}
        >
          <CalendarIcon size={14} className="text-primary" />
          <span className="truncate max-w-[180px]">{getLabel(value)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto rounded-2xl border-border/70 bg-card/95 p-0 shadow-2xl" align="end">
        <Calendar
          mode="range"
          selected={value}
          numberOfMonths={2}
          onSelect={(range) => {
            onSelect(range);
            if (!range?.from || range.to) setOpen(false);
          }}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}