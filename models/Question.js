/**
 * Question Model & Schema Definition
 * CyberArena Production Assessment Engine
 *
 * Enforces a strict two-tiered, plain-text clue system for every question:
 * - level_1: Slightly easier: A gentle nudge or conceptual hint pointing in the right direction.
 * - level_2: Completely easier: Direct walkthrough or explicit instruction to easily understand and solve.
 */

const QuestionSchema = {
  id: {
    type: String,
    required: true,
    description: "Unique alphanumeric question identifier (e.g. r1q01, r2p01, r3q1)"
  },
  prompt: {
    type: String,
    required: false,
    description: "Question prompt, puzzle description, or challenge text"
  },
  clues: {
    level_1: {
      type: String,
      required: true,
      description: "Slightly easier: A gentle nudge or conceptual hint."
    },
    level_2: {
      type: String,
      required: true,
      description: "Completely easier: Direct walkthrough or explicit instruction."
    }
  }
};

/**
 * Validates that an individual question complies with the strict two-tiered clue schema.
 * @param {Object} q The question object to validate
 * @returns {boolean} True if valid; throws an Error if invalid.
 */
function validateQuestion(q) {
  if (!q || typeof q !== 'object') {
    throw new Error('Question must be a valid non-null object');
  }
  if (!q.id || typeof q.id !== 'string' || !q.id.trim()) {
    throw new Error('Question is missing required field: id');
  }
  if (!q.clues || typeof q.clues !== 'object') {
    throw new Error(`Question [${q.id}] is missing required 'clues' object`);
  }
  if (!q.clues.level_1 || typeof q.clues.level_1 !== 'string' || !q.clues.level_1.trim()) {
    throw new Error(`Question [${q.id}] requires non-empty clues.level_1 (Slightly easier: A gentle nudge or conceptual hint)`);
  }
  if (!q.clues.level_2 || typeof q.clues.level_2 !== 'string' || !q.clues.level_2.trim()) {
    throw new Error(`Question [${q.id}] requires non-empty clues.level_2 (Completely easier: Direct walkthrough or explicit instruction)`);
  }
  return true;
}

/**
 * Validates an entire questions dataset containing round1, round2, and round3.
 * @param {Object} dataset The dataset containing round1, round2, and round3
 * @returns {{ valid: boolean, totalQuestions: number, errors: string[] }}
 */
function validateQuestionsDataset(dataset) {
  const errors = [];
  let totalQuestions = 0;

  if (!dataset || typeof dataset !== 'object') {
    return { valid: false, totalQuestions: 0, errors: ['Dataset must be an object'] };
  }

  // Round 1
  if (Array.isArray(dataset.round1)) {
    dataset.round1.forEach((q, idx) => {
      totalQuestions++;
      try {
        validateQuestion(q);
      } catch (err) {
        errors.push(`Round 1 Question #${idx + 1} (${q?.id || 'unknown'}): ${err.message}`);
      }
    });
  } else {
    errors.push("Dataset missing required 'round1' array");
  }

  // Round 2
  if (Array.isArray(dataset.round2)) {
    dataset.round2.forEach((q, idx) => {
      totalQuestions++;
      try {
        validateQuestion(q);
      } catch (err) {
        errors.push(`Round 2 Puzzle #${idx + 1} (${q?.id || 'unknown'}): ${err.message}`);
      }
    });
  } else {
    errors.push("Dataset missing required 'round2' array");
  }

  // Round 3
  const r3Questions = dataset.round3 && (dataset.round3.questions || dataset.round3);
  if (Array.isArray(r3Questions)) {
    r3Questions.forEach((q, idx) => {
      totalQuestions++;
      try {
        validateQuestion(q);
      } catch (err) {
        errors.push(`Round 3 Question #${idx + 1} (${q?.id || 'unknown'}): ${err.message}`);
      }
    });
  } else {
    errors.push("Dataset missing required 'round3.questions' array");
  }

  return {
    valid: errors.length === 0,
    totalQuestions,
    errors
  };
}

module.exports = {
  QuestionSchema,
  validateQuestion,
  validateQuestionsDataset
};
