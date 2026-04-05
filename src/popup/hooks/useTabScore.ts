/**
 * React hook: listens for SCORE_UPDATE messages from the active tab's
 * content script and exposes the latest ScoreBreakdown.
 *
 * The score is computed by the Score Agent (Phase 5).
 * In Phase 3 this hook is wired up but score will be null until Phase 5.
 */

import { useState, useEffect } from 'react';
import type { ScoreBreakdown, MessageType } from '@/shared/types';

interface UseTabScoreReturn {
  score: ScoreBreakdown | null;
}

export function useTabScore(): UseTabScoreReturn {
  const [score, setScore] = useState<ScoreBreakdown | null>(null);

  useEffect(() => {
    const listener = (message: MessageType) => {
      if (message.type === 'SCORE_UPDATE') {
        setScore(message.payload);
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  return { score };
}
