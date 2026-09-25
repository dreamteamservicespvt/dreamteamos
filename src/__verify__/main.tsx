// THROWAWAY — mounts the real AdGen studio against a fixture job, for the browser check.
import '@/index.css';
import { createRoot } from 'react-dom/client';
import { useAuthStore } from '@/store/authStore';
import AIPlatformApp from '@/components/ai-platform/AIPlatformApp';

useAuthStore.setState({ user: { uid: 'u1', name: 'Ravi Kumar', role: 'tech_member', email: 'r@x' } as any, loading: false } as any);

const job = {
  id: 'a1', assignedTo: 'u1', assignedBy: 'admin', category: 'promotional', clipCount: 4, includesEndCredits: true,
  duration: '32s', pricePerUnit: 0, totalPrice: 0, uniqueId: 'P42', accessCode: '1234', displayTitle: 'Sri Sai Motors',
  businessName: 'Sri Sai Two Wheeler Service Centre', status: 'in_progress', sessions: [], totalDurationSeconds: 0,
  date: '2026-09-25', modelGender: 'female', attireType: 'professional', aspectRatio: '9:16', language: 'Telugu',
  realLocationProvided: false,
};

createRoot(document.getElementById('root')!).render(
  <AIPlatformApp assignment={job as any} assignmentId="a1" onClose={() => {}} onComplete={() => {}} />,
);
