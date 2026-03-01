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
}

export default function DashboardDayPicker({ selectedDate, onSelect }: DashboardDayPickerProps) {
  const [open, setOpen] = useState(false);

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
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}
