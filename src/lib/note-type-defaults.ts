import type { NoteTypeJson } from "@/lib/validation";

/**
 * Factory for the default Anki Basic NoteType used by `/decks/new`.
 * Returns a fresh object on every call — callers may mutate.
 */
export function createBasicNoteTypeJson(): NoteTypeJson {
  return {
    name: "Basic",
    fields: [
      { name: "Front", ord: 0 },
      { name: "Back", ord: 1 },
    ],
    templates: [
      {
        name: "Card 1",
        ord: 0,
        qfmt: "{{Front}}",
        afmt: "{{FrontSide}}<hr>{{Back}}",
      },
    ],
  };
}

/**
 * Factory for a QA-type NoteType (question / answer).
 * Returns a fresh object on every call — callers may mutate.
 */
export function createQaNoteTypeJson(): NoteTypeJson {
  return {
    name: "QA",
    fields: [
      { name: "Question", ord: 0 },
      { name: "Answer", ord: 1 },
    ],
    templates: [
      {
        name: "Card 1",
        ord: 0,
        qfmt: "{{Question}}",
        afmt: "{{FrontSide}}<hr>{{Answer}}",
      },
    ],
  };
}

/**
 * Factory for a single-choice NoteType (one correct answer from A/B/C/D).
 * Returns a fresh object on every call — callers may mutate.
 */
export function createChoiceNoteTypeJson(): NoteTypeJson {
  return {
    name: "Choice",
    fields: [
      { name: "Question", ord: 0 },
      { name: "A", ord: 1 },
      { name: "B", ord: 2 },
      { name: "C", ord: 3 },
      { name: "D", ord: 4 },
      { name: "CorrectAnswer", ord: 5 },
      { name: "Explanation", ord: 6 },
    ],
    templates: [
      {
        name: "Card 1",
        ord: 0,
        qfmt: "{{Question}}<br>A. {{A}}<br>B. {{B}}<br>C. {{C}}<br>D. {{D}}",
        afmt: "{{FrontSide}}<hr>{{CorrectAnswer}}<br>{{Explanation}}",
      },
    ],
  };
}

/**
 * Factory for a multiple-choice NoteType (CorrectAnswer holds comma-separated letters).
 * Returns a fresh object on every call — callers may mutate.
 */
export function createMultiChoiceNoteTypeJson(): NoteTypeJson {
  return {
    name: "MultiChoice",
    fields: [
      { name: "Question", ord: 0 },
      { name: "A", ord: 1 },
      { name: "B", ord: 2 },
      { name: "C", ord: 3 },
      { name: "D", ord: 4 },
      { name: "CorrectAnswer", ord: 5 },
      { name: "Explanation", ord: 6 },
    ],
    templates: [
      {
        name: "Card 1",
        ord: 0,
        qfmt: "{{Question}}<br>A. {{A}}<br>B. {{B}}<br>C. {{C}}<br>D. {{D}}",
        afmt: "{{FrontSide}}<hr>{{CorrectAnswer}}<br>{{Explanation}}",
      },
    ],
  };
}

/**
 * Factory for a fill-in-the-blank (cloze) NoteType.
 * Returns a fresh object on every call — callers may mutate.
 */
export function createFillNoteTypeJson(): NoteTypeJson {
  return {
    name: "Fill",
    fields: [
      { name: "Text", ord: 0 },
      { name: "Answer", ord: 1 },
    ],
    templates: [
      {
        name: "Card 1",
        ord: 0,
        qfmt: "{{Text}}",
        afmt: "{{FrontSide}}<hr>{{Answer}}",
      },
    ],
  };
}

/**
 * Factory for a true/false (judge) NoteType.
 * Returns a fresh object on every call — callers may mutate.
 */
export function createJudgeNoteTypeJson(): NoteTypeJson {
  return {
    name: "Judge",
    fields: [
      { name: "Statement", ord: 0 },
      { name: "Verdict", ord: 1 },
      { name: "Explanation", ord: 2 },
    ],
    templates: [
      {
        name: "Card 1",
        ord: 0,
        qfmt: "{{Statement}}",
        afmt: "{{FrontSide}}<hr>{{Verdict}}<br>{{Explanation}}",
      },
    ],
  };
}
