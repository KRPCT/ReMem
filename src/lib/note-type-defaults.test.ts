import { describe, it, expect } from "vitest";
import { noteTypeJsonSchema } from "./validation";
import { validatePlaceholders } from "./templates";
import {
  createBasicNoteTypeJson,
  createQaNoteTypeJson,
  createChoiceNoteTypeJson,
  createMultiChoiceNoteTypeJson,
  createFillNoteTypeJson,
  createJudgeNoteTypeJson,
} from "./note-type-defaults";

/** Returns the set of declared field names for a factory output. */
function fieldNames(factory: () => ReturnType<typeof createBasicNoteTypeJson>): Set<string> {
  return new Set(factory().fields.map((f) => f.name));
}

/** Asserts schema parse + fresh-object contract + placeholder validity for a factory. */
function assertFactory(factory: () => ReturnType<typeof createBasicNoteTypeJson>) {
  it("passes noteTypeJsonSchema", () => {
    expect(() => noteTypeJsonSchema.parse(factory())).not.toThrow();
  });

  it("returns distinct objects on each call (fresh-object contract)", () => {
    const a = factory();
    const b = factory();
    expect(a).not.toBe(b);
  });

  it("has no undefined {{Placeholder}} in qfmt", () => {
    const nt = factory();
    const allowed = fieldNames(factory);
    for (const tmpl of nt.templates) {
      expect(validatePlaceholders(tmpl.qfmt, allowed)).toBeNull();
    }
  });

  it("has no undefined {{Placeholder}} in afmt", () => {
    const nt = factory();
    const allowed = fieldNames(factory);
    for (const tmpl of nt.templates) {
      expect(validatePlaceholders(tmpl.afmt, allowed)).toBeNull();
    }
  });
}

describe("createBasicNoteTypeJson", () => {
  assertFactory(createBasicNoteTypeJson);
});

describe("createQaNoteTypeJson", () => {
  assertFactory(createQaNoteTypeJson);
});

describe("createChoiceNoteTypeJson", () => {
  assertFactory(createChoiceNoteTypeJson);
});

describe("createMultiChoiceNoteTypeJson", () => {
  assertFactory(createMultiChoiceNoteTypeJson);
});

describe("createFillNoteTypeJson", () => {
  assertFactory(createFillNoteTypeJson);
});

describe("createJudgeNoteTypeJson", () => {
  assertFactory(createJudgeNoteTypeJson);
});
