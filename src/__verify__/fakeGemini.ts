// THROWAWAY — a fake Gemini: every call returns fixed content after a short delay.
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
export type SectionType = 'mainFrame' | 'header' | 'poster' | 'voiceOver' | 'veo';
export const DEFAULT_POSTER_CONCEPT_COUNT = 3;
export const extractBusinessNameFromInfo = (info: any) => info?.name || '';
export const transliterateToEnglish = async (t: string) => t;

export const generateAdAssets = async (_f: unknown, _files: unknown, onProgress: (s: string, p: number) => void, options: any = {}) => {
  onProgress('Extracting business intelligence...', 10);
  await wait(150);
  const result = {
    businessInfo: { name: 'Sri Sai Motors', contactNumbers: ['9848012345'] },
    mainFramePrompts: ['Frame one.', 'Frame two.', 'Frame three.', 'Frame four.'],
    headerPrompt: 'VIDEO BOTTOM LABEL', posterPrompt: 'POSTER',
    voiceOverScript: '0-8: శ్రీ సాయి మోటార్స్‌లో మీ బైక్‌కి పూర్తి సర్వీస్.\n8-16: ఒరిజినల్ స్పేర్ పార్ట్స్ mariyu అనుభవం ఉన్న మెకానిక్స్.\n16-24: అదే రోజు డెలివరీ, నమ్మకమైన ధరలు.\n24-32: మరిన్ని వివరాల కోసం స్క్రీన్‌పై ఉన్న నంబర్‌కు ఇప్పుడే కాల్ చేయండి.',
    veoPrompts: ['Veo one.', 'Veo two.', 'Veo three.', 'Veo four.'],
    hasProductImages: false, productImageCount: 0, stockImagePrompts: null,
    scriptQa: { score: 8.6, passed: true, drafts: 2, scores: { facts: 10, language: 9, persuasion: 8, clarity: 8, relevance: 9, speakability: 8 }, notes: [] },
  };
  options.onPartialResult?.(result);
  onProgress('Finalizing...', 100);
  return result;
};
export const generateStockImagePrompts = async () => { await wait(400); return [{ id: 1, clip: 1, concept: 'The bay', prompt: 'A service bay.' }]; };
export const generateOverlayTexts = async () => { await wait(600); return [{ clip: 1, text: 'SAME-DAY SERVICE', soundEffect: 'whoosh', imagePrompt: 'Premium 3D text.', imageDesign: 'steel' }]; };
export const regenerateVeoForClips = async (_s: string, _f: unknown, frames: string[]) => { await wait(500); return frames.map((_, index) => ({ index, prompt: `New veo ${index + 1}.` })); };
export const writeVideoPosterPrompt = async () => 'POSTER';
export const buildVideoBottomLabel = () => 'VIDEO BOTTOM LABEL';
export const generatePosterConcepts = async () => { throw new Error('not in this harness'); };
export const refinePosterConcept = async () => { throw new Error('not in this harness'); };
export const refineStockImagePrompt = async (p: string) => p;
export const refineOverlayImagePrompt = async () => ({});
export const refineSection = async (_s: unknown, c: string) => c;
export const refineVoiceOver = async ({ script }: { script: string }) => ({ script, changed: [], understood: '' });
export const refineVeoPrompts = async ({ prompts }: { prompts: string[] }) => ({ prompts, changed: [], rejected: [], understood: '', notApplied: '' });
