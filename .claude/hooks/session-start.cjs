// ── SessionStart hook (wired in .claude/settings.json) ──
// Why: CLAUDE.md loads into every session by itself, but two things it asks for did not
// happen unless the agent remembered them: reading HANDOFF.md (an unfinished task, §34)
// and noticing that another session is working in this same tree (§28, "check for
// parallel work"). Whatever this script prints is added to Claude's context at startup,
// resume, /clear and after compaction, so both are in front of the agent before its
// first step. It never fails a session: every git call is guarded and it always exits 0.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const HANDOFF_MAX_CHARS = 20000;

function git(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", timeout: 4000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

const lines = ["[DTS-OS session start — printed by .claude/hooks/session-start.cjs]"];

const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
if (branch !== null) {
  const head = git(["rev-parse", "--short", "HEAD"]) || "?";
  const status = git(["status", "--porcelain"]);
  const changed = status ? status.split("\n").filter(Boolean).length : 0;
  // Counted against the LAST fetch only — no network here; `git fetch` before pulling (§28).
  const behind = git(["rev-list", "--count", "HEAD..origin/main"]);
  let repo = `Repo: ${branch} @ ${head}`;
  repo += changed
    ? ` · ${changed} uncommitted file(s) — another session may be working in this tree; never revert or commit files you did not change`
    : " · working tree clean";
  if (behind && behind !== "0") repo += ` · ${behind} commit(s) behind origin/main as of the last fetch`;
  lines.push(repo);
}

const handoffPath = path.join(root, "HANDOFF.md");
if (fs.existsSync(handoffPath)) {
  let text = fs.readFileSync(handoffPath, "utf8");
  const cut = text.length > HANDOFF_MAX_CHARS;
  if (cut) text = text.slice(0, HANDOFF_MAX_CHARS);
  lines.push(
    "",
    "HANDOFF.md EXISTS — an unfinished task (CLAUDE.md §34). Continue it before anything else, unless the owner's message asks for something different:",
    "----- HANDOFF.md -----",
    text,
    cut ? "----- (cut here — Read HANDOFF.md for the rest) -----" : "----- end of HANDOFF.md -----"
  );
} else {
  lines.push("No HANDOFF.md — no unfinished task is waiting.");
}

lines.push("Every development request follows CLAUDE.md §30 (Change Protocol) and §29 (Rules); the owner may start one with /dev <task>.");

process.stdout.write(lines.join("\n") + "\n");
process.exit(0);
