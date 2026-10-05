/** The icon for each kind of content on the client calendar — a poster, an AI video, a real video. */
import type { LucideIcon } from "lucide-react";
import { Image as ImageIcon, Sparkles, Video } from "lucide-react";
import type { SmmContentKind } from "@/types/smm";

export const KIND_ICON: Record<SmmContentKind, LucideIcon> = { poster: ImageIcon, ai_ad: Sparkles, real_video: Video };
