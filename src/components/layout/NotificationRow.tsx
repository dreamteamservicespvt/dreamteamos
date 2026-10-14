import { useRef } from "react";
import { animate, motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { Mail, MailOpen, X } from "lucide-react";
import { isDismissSwipe, type AppNotification } from "@/utils/notificationInbox";

interface NotificationRowProps {
  n: AppNotification;
  /** The type chip's colours (Topbar decides them by type). */
  chipClassName: string;
  onOpen: (n: AppNotification) => void;
  onToggleRead: (n: AppNotification) => void;
  onDismiss: (n: AppNotification) => void;
}

/**
 * One row of the bell (owner, 2026-10-13: "dismiss one notification at a time — an X or swipe — and
 * allow mark as unread"). Tap the row to open it; the X, or a sideways swipe, dismisses it; the
 * envelope marks it unread (or read, without opening it).
 *
 * The row is a container rather than one big button, because a button cannot hold the two small
 * ones. The swipe moves only the row's face; what it uncovers says "Dismiss", so a finger that
 * started a swipe by accident can see what letting go will do, and pull back.
 */
export default function NotificationRow({ n, chipClassName, onOpen, onToggleRead, onDismiss }: NotificationRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const uncovered = useTransform(x, (v) => Math.min(1, Math.abs(v) / 64));
  /** A drag ends in a click on whatever is under the finger — that click must not open the row. */
  const draggedRef = useRef(false);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const width = rowRef.current?.offsetWidth || 320;
    if (isDismissSwipe(info.offset.x, info.velocity.x, width)) {
      animate(x, (info.offset.x < 0 ? -1 : 1) * width, { duration: 0.15, onComplete: () => onDismiss(n) });
    } else {
      animate(x, 0, { type: "spring", stiffness: 500, damping: 40 });
    }
  };

  const iconButton =
    "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <motion.div
      ref={rowRef}
      layout="position"
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18 }}
      data-test="notif-row"
      data-unread={!n.read ? "true" : undefined}
      className="relative overflow-hidden border-b border-border/50"
      onPointerDownCapture={() => { draggedRef.current = false; }}
      onClickCapture={(e) => {
        if (!draggedRef.current) return;
        draggedRef.current = false;
        e.stopPropagation();
        e.preventDefault();
      }}
    >
      <motion.div
        aria-hidden
        style={{ opacity: uncovered }}
        className="absolute inset-0 flex items-center justify-between bg-destructive/15 px-4 text-xs font-medium text-destructive"
      >
        <span className="flex items-center gap-1"><X size={14} /> Dismiss</span>
        <span className="flex items-center gap-1">Dismiss <X size={14} /></span>
      </motion.div>
      {/* drag="x" leaves vertical panning to the browser (touch-action: pan-y), so the list still scrolls. */}
      <motion.div
        drag="x"
        dragDirectionLock
        dragMomentum={false}
        style={{ x }}
        onDragStart={() => { draggedRef.current = true; }}
        onDragEnd={handleDragEnd}
        className="relative bg-card"
      >
        <div className={`flex items-start transition-colors hover:bg-accent/30 ${!n.read ? "bg-primary/5" : ""}`}>
          <button
            type="button"
            data-test="notif-open"
            onClick={() => onOpen(n)}
            className="min-w-0 flex-1 py-3 pl-4 pr-1 text-left"
          >
            <div className="flex items-start gap-2">
              {/* Capped and truncated: "order chat call" at shrink-0 was wide enough to
                  push the message text past the edge of the panel on a phone. */}
              <span className={`mt-0.5 max-w-[7rem] shrink-0 truncate rounded-full px-1.5 py-0.5 text-[10px] ${chipClassName}`}>
                {n.type.replace(/_/g, " ")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-xs font-medium text-foreground">{n.title}</p>
                <p className="truncate text-[11px] text-muted-foreground">{n.message}</p>
              </div>
              {!n.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />}
            </div>
          </button>
          {/* 28px each — the smallest a thumb hits reliably next to a neighbour. */}
          <div className="flex shrink-0 items-center gap-0.5 py-2 pr-1.5">
            <button
              type="button"
              data-test="notif-toggle-read"
              onClick={() => onToggleRead(n)}
              aria-label={n.read ? "Mark as unread" : "Mark as read"}
              title={n.read ? "Mark as unread" : "Mark as read"}
              className={iconButton}
            >
              {n.read ? <Mail size={14} /> : <MailOpen size={14} />}
            </button>
            <button
              type="button"
              data-test="notif-dismiss"
              onClick={() => onDismiss(n)}
              aria-label="Dismiss"
              title="Dismiss"
              className={iconButton}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
