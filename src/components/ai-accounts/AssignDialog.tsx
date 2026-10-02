import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import AiModal, { buttonClass, fieldClass } from "./AiModal";
import type { Person } from "@/services/aiAccounts";

/**
 * Choosing who uses an account. A Flow account has one holder at a time (`multiple` off); a paid
 * account can be shared by several members (`multiple` on), and the dialog says how many have it.
 */
export default function AssignDialog({
  open, onClose, title, subtitle, people, selected, multiple = false, onSave,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  people: Person[];
  selected: string[];
  multiple?: boolean;
  onSave: (people: Person[]) => Promise<void>;
}) {
  const [picked, setPicked] = useState<string[]>(selected);
  const [saving, setSaving] = useState(false);
  // Keyed on the ids, not the array: callers build `selected` inline, so it is a new array on every
  // render of theirs — and any live snapshot re-renders them, which would undo the person's choice.
  const selectedKey = selected.join("|");
  useEffect(() => {
    if (open) setPicked(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedKey]);

  const toggle = (uid: string) => setPicked((p) => (multiple ? (p.includes(uid) ? p.filter((x) => x !== uid) : [...p, uid]) : [uid]));

  const save = async () => {
    setSaving(true);
    try {
      await onSave(people.filter((p) => picked.includes(p.uid)));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <AiModal open={open} onClose={onClose} title={title} subtitle={subtitle} testId="assign-dialog"
      footer={<>
        {multiple ? <span className="mr-auto text-xs text-muted-foreground">{picked.length} member{picked.length === 1 ? "" : "s"} selected</span> : null}
        <button className={buttonClass.ghost} onClick={onClose} disabled={saving}>Cancel</button>
        <button className={buttonClass.primary} onClick={save} disabled={saving || (!multiple && picked.length === 0)} data-test="assign-save">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
        </button>
      </>}
    >
      {multiple ? (
        <div className="grid gap-1.5">
          {people.map((p) => (
            <label key={p.uid} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent cursor-pointer">
              <input type="checkbox" checked={picked.includes(p.uid)} onChange={() => toggle(p.uid)} />
              <span className="truncate">{p.name}</span>
              {p.role === "tech_team_leader" ? <span className="ml-auto text-[10px] text-muted-foreground">Team leader</span> : null}
              {p.role === "tech_admin" ? <span className="ml-auto text-[10px] text-muted-foreground">Tech admin</span> : null}
            </label>
          ))}
        </div>
      ) : (
        <select className={fieldClass} value={picked[0] || ""} onChange={(e) => toggle(e.target.value)} data-test="assign-person">
          {people.map((p) => <option key={p.uid} value={p.uid}>{p.name}{p.role === "tech_team_leader" ? " (team leader)" : p.role === "tech_admin" ? " (tech admin)" : ""}</option>)}
        </select>
      )}
    </AiModal>
  );
}
