import AIPlatformApp from "@/components/ai-platform/AIPlatformApp";

/**
 * Standalone ad creation — the whole app for an external creator.
 *
 * Renders the same AI ad tool the team uses, but without any assignment attached: an external
 * creator generates ads for their own business freely. Everything they create is saved to
 * `ai_generations` (keyed by their uid), which the tech admin can review as history.
 */
export default function CreateAd() {
  return (
    <div className="-m-4 md:-m-6">
      {/* onClose is a no-op here — there's nowhere to go back to; this page *is* their home. */}
      <AIPlatformApp onClose={() => {}} />
    </div>
  );
}
