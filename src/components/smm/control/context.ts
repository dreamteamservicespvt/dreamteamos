/**
 * What every part of the Delivery Control page shares (2026-10-15): the data, the board built from it, who is
 * looking, whether answers are switched on (Live), and how to open a piece's sheet.
 */
import { createContext, useContext } from "react";
import type { SmmControlBoard, SmmControlView, SmmTaskRow } from "@/utils/smmDeliveryView";
import type { SmmDeliveryData } from "./useDeliveryData";
import type { AppUser } from "@/types";

/** The form a piece's sheet opens on. */
export type SmmPieceAction =
  | "details" | "late" | "blocked" | "more_time" | "move" | "approval" | "posted" | "footage" | "reassign";

export interface SmmControlCtx {
  data: SmmDeliveryData;
  board: SmmControlBoard;
  user: AppUser;
  view: SmmControlView;
  /** Live: the page's own answers write. Preview / Off: read-only (the classic page still works). */
  live: boolean;
  manager: boolean;
  openPiece: (row: SmmTaskRow, action?: SmmPieceAction) => void;
  openMonth: (monthId: string) => void;
}

export const ControlContext = createContext<SmmControlCtx | null>(null);

export function useControl(): SmmControlCtx {
  const c = useContext(ControlContext);
  if (!c) throw new Error("useControl outside the Delivery Control page");
  return c;
}
