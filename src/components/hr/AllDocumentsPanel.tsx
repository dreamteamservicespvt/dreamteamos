/**
 * Every letter the company has issued, in one register.
 *
 * Until now a document could only be found through the person it belonged to, which answers
 * "what has Asha got?" and nothing else. The questions that actually get asked are the other shape:
 * who still has not signed their NDA, what went out last month, which letters did this admin issue,
 * where is reference DTS/OFR/2026/0007. All of those are one filter here.
 *
 * It reads the same chunked team-wide subscription the missing-letters panel already uses, so
 * opening this page costs one read per document and nothing per employee — which matters, because
 * the project runs on a Firestore free tier where a per-member scan is what breaks the day.
 *
 * Paged rather than infinite-scrolled: the whole point is to be able to say "there are 84 letters
 * and 6 of them are unsigned", and a list that never ends cannot say that.
 */
import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  CheckCircle2, ChevronLeft, ChevronRight, Clock, FileText, Filter, Search, Trash2, XCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import { deleteDocument } from "@/services/hrDocuments";
import { HR_DOCUMENT_GROUPS, HR_DOCUMENT_LABELS } from "@/types/hr";
import type { HrDocument, HrDocumentStatus, HrDocumentType } from "@/types/hr";
import HrDocumentModal from "./HrDocumentModal";
import { EmptyState } from "./ui";

const PAGE_SIZE = 12;

const STATUS_CHIP: Record<HrDocumentStatus, { label: string; className: string; Icon: typeof Clock }> = {
  issued: { label: "Awaiting signature", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400", Icon: Clock },
  signed: { label: "Signed", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", Icon: CheckCircle2 },
  declined: { label: "Not signed", className: "bg-rose-500/15 text-rose-600 dark:text-rose-400", Icon: XCircle },
};

type StatusFilter = HrDocumentStatus | "all" | "unsigned";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  // The one people come here for, so it sits second rather than buried among the statuses.
  { key: "unsigned", label: "Needs a signature" },
  { key: "signed", label: "Signed" },
  { key: "declined", label: "Not signed" },
];

const seconds = (d: HrDocument): number => (d.createdAt as { seconds?: number } | null)?.seconds ?? 0;

export default function AllDocumentsPanel({ documents, canSign, viewerId, canDelete }: {
  documents: HrDocument[];
  /** The viewer is the employee these belong to — enables signing and records that they read it. */
  canSign?: boolean;
  viewerId?: string;
  /**
   * The viewer may withdraw a document.
   *
   * Issuing is instant and lands in somebody's account immediately, so the wrong letter — wrong
   * person, wrong salary, wrong type — needs an undo that does not involve asking a developer.
   * Admins only, and a signed document warns harder before it goes.
   */
  canDelete?: boolean;
}) {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<HrDocumentType | "all">("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<HrDocument | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (doc: HrDocument) => {
    const { confirmed } = await confirm({
      title: doc.status === "signed" ? "Delete a SIGNED document?" : "Delete this document?",
      description: doc.status === "signed"
        ? `"${doc.title}" has been signed by ${doc.memberName}. Deleting it destroys the signed record permanently — open it and download the PDF first if you need a copy.`
        : `"${doc.title}" will disappear from ${doc.memberName}'s profile as well as this list. Its reference number is not reused.`,
      confirmText: "Delete",
      variant: "destructive",
    });
    if (!confirmed || !doc.id) return;
    setDeleting(doc.id);
    try {
      await deleteDocument(doc.id);
      toast({ title: "Document deleted", description: `${HR_DOCUMENT_LABELS[doc.type]} for ${doc.memberName} was withdrawn.` });
    } catch {
      toast({ title: "Error", description: "Could not delete the document.", variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents
      .filter((d) => {
        if (type !== "all" && d.type !== type) return false;
        if (status === "unsigned") {
          if (!(d.requiresEmployeeSignature && d.status === "issued")) return false;
        } else if (status !== "all" && d.status !== status) return false;
        if (!q) return true;
        return [d.memberName, d.title, d.referenceNo, d.issuedByName, HR_DOCUMENT_LABELS[d.type]]
          .some((v) => (v || "").toLowerCase().includes(q));
      })
      .sort((a, b) => seconds(b) - seconds(a) || (b.issuedOn || "").localeCompare(a.issuedOn || ""));
  }, [documents, search, type, status]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // A filter that shrinks the list can strand the viewer on a page that no longer exists.
  const current = Math.min(page, pages - 1);
  const rows = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const awaiting = documents.filter((d) => d.requiresEmployeeSignature && d.status === "issued").length;

  const reset = (fn: () => void) => { fn(); setPage(0); };

  return (
    <div data-test="all-documents-panel">
      {ConfirmDialog}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => reset(() => setSearch(e.target.value))}
            placeholder="Search by person, document, reference…"
            data-test="document-search"
            className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <select
          value={type}
          onChange={(e) => reset(() => setType(e.target.value as HrDocumentType | "all"))}
          data-test="document-type-filter"
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="all">Every document type</option>
          {HR_DOCUMENT_GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.types.map((t) => <option key={t} value={t}>{HR_DOCUMENT_LABELS[t]}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Filter size={13} className="text-muted-foreground" />
        {STATUS_FILTERS.map((s) => (
          <button
            key={s.key}
            onClick={() => reset(() => setStatus(s.key))}
            data-test={`status-${s.key}`}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${
              status === s.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {s.label}
            {s.key === "unsigned" && awaiting > 0 && (
              <span className="ml-1 rounded-full bg-warning/20 px-1.5 text-[10px] text-warning">{awaiting}</span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<FileText size={28} />}
          title={documents.length === 0 ? "No documents issued yet" : "Nothing matches those filters"}
          hint={
            documents.length === 0
              ? "Letters issued to the team will be listed here as they go out."
              : "Try a different document type or clear the search."
          }
        />
      ) : (
        <>
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {rows.map((d) => {
              const chip = STATUS_CHIP[d.status] || STATUS_CHIP.issued;
              return (
                <div key={d.id} className="flex items-center gap-2 px-4 py-3 hover:bg-accent/50" data-test="document-row">
                  <button onClick={() => setOpen(d)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-medium text-foreground">
                      {HR_DOCUMENT_LABELS[d.type]}
                      <span className="text-muted-foreground"> · {d.memberName}</span>
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {d.referenceNo ? <span className="font-mono">{d.referenceNo}</span> : "No reference"}
                      {d.issuedOn ? ` · ${format(new Date(d.issuedOn), "dd MMM yyyy")}` : ""}
                      {d.issuedByName ? ` · issued by ${d.issuedByName}` : ""}
                      {d.lastDownloadedAt ? " · downloaded" : d.firstViewedAt ? " · read" : ""}
                    </p>
                  </button>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${chip.className}`}>
                    <chip.Icon size={12} /> {chip.label}
                  </span>
                  {canDelete && (
                    <button
                      onClick={() => handleDelete(d)}
                      disabled={deleting === d.id}
                      title="Delete this document"
                      aria-label={`Delete ${HR_DOCUMENT_LABELS[d.type]} for ${d.memberName}`}
                      data-test="document-delete"
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground" data-test="document-count">
              {filtered.length} document{filtered.length === 1 ? "" : "s"}
              {filtered.length !== documents.length ? ` of ${documents.length}` : ""}
            </p>
            {pages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={current === 0}
                  aria-label="Previous page"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent disabled:opacity-40"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-[11px] text-muted-foreground">Page {current + 1} of {pages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
                  disabled={current >= pages - 1}
                  aria-label="Next page"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent disabled:opacity-40"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {open && (
        <HrDocumentModal
          document={open}
          canSign={canSign && open.memberId === viewerId}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
