/**
 * TypeScript Type Definitions for CyberArena Question Database Schema
 * Enforces strict two-tiered plain-text clue requirements.
 */

export interface QuestionClues {
  /**
   * Slightly easier: A gentle nudge or conceptual hint.
   * It points the candidate in the right direction without giving away the exact method.
   */
  level_1: string;

  /**
   * Completely easier: Direct walkthrough or explicit instruction.
   * Acts as a clear walkthrough so the candidate can easily understand exactly how to solve the challenge.
   */
  level_2: string;
}

export interface Round1Question {
  id: string;
  q: string;
  options: string[];
  answer: number;
  clues: QuestionClues;
}

export interface Round2Puzzle {
  id: string;
  type: string;
  body: string;
  mono: string | null;
  answers: string[];
  clues: QuestionClues;
}

export interface Round3Question {
  id: string;
  label: string;
  answers: string[];
  clues: QuestionClues;
}

export type Question = Round1Question | Round2Puzzle | Round3Question;

export interface CyberArenaDataset {
  meta: {
    event: string;
    rounds: {
      "1": { minutes: number; items: number };
      "2": { minutes: number; items: number };
      "3": { minutes: number; items: number };
    };
  };
  round1: Round1Question[];
  round2: Round2Puzzle[];
  round3: {
    caseTitle: string;
    caseIntro: string;
    evidence: Array<{ id: string; label: string; lines: string[]; note: string | null }>;
    questions: Round3Question[];
  };
}
