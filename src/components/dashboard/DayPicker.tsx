import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DashboardDayPickerProps {
  selectedDate: Date | undefined;
  onSelect: (date: Date | undefined) => void;
  dateIndicators?: Record<string, "good" | "average" | "bad">;
}

const indicatorColors: Record<string, string> = {
  good: "bg-green-500",
  average: "bg-yellow-500",
  bad: "bg-red-500",
};

export default function DashboardDayPicker({ selectedDate, onSelect, dateIndicators }: DashboardDayPickerProps) {
  const [open, setOpen] = useState(false);

  // Build modifier dates from indicators
  const modifiers: Record<string, Date[]> = { good: [], average: [], bad: [] };
  if (dateIndicators) {
    Object.entries(dateIndicators).forEach(([dateStr, level]) => {
      modifiers[level].push(new Date(dateStr));
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-9 px-3 gap-2 text-xs font-medium",
            !selectedDate && "text-muted-foreground"
          )}
        >
          <CalendarIcon size={14} />
          {selectedDate ? format(selectedDate, "dd/MM/yyyy") : "Select date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(d) => { onSelect(d); setOpen(false); }}
          modifiers={dateIndicators ? modifiers : undefined}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
          components={{
            DayContent: ({ date, ...props }) => {
              const dateStr = format(date, "yyyy-MM-dd");
              const level = dateIndicators?.[dateStr];
              return (
                <div className="relative flex flex-col items-center">
                  <span>{date.getDate()}</span>
                  {level && (
                    <span className={`absolute -bottom-1 w-1.5 h-1.5 rounded-full ${indicatorColors[level]}`} />
                  )}
                </div>
              );
            },
          }}
        />
        {dateIndicators && (
          <div className="flex items-center justify-center gap-4 pb-3 px-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> ≥70% called</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" /> 40-69%</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> &lt;40%</span>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
