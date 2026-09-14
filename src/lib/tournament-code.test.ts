import { describe, expect, it } from "vitest";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  codeSpaced,
  normalizeCode,
} from "./tournament-code";

describe("normalizeCode", () => {
  it("accepts a code as it comes out of the database", () => {
    expect(normalizeCode("FKA429")).toBe("FKA429");
  });

  it("uppercases, because a link gets typed in lower case", () => {
    expect(normalizeCode("fka429")).toBe("FKA429");
  });

  it("ignores the spacing the code is printed with", () => {
    expect(normalizeCode("F K A 4 2 9")).toBe("FKA429");
    expect(normalizeCode("FKA-429")).toBe("FKA429");
    expect(normalizeCode("  fka429  ")).toBe("FKA429");
  });

  it("rejects the characters people misread, rather than guessing", () => {
    // Guessing 0 -> O would hand somebody a DIFFERENT event if both existed.
    for (const code of ["FKA420", "FKAO29", "FKA1I9", "FKAI29"]) {
      expect(normalizeCode(code), `${code} is not a code`).toBeNull();
    }
  });

  it("rejects anything that is not exactly six characters", () => {
    expect(normalizeCode("FKA42")).toBeNull();
    expect(normalizeCode("FKA4299")).toBeNull();
    expect(normalizeCode("")).toBeNull();
    expect(normalizeCode(null)).toBeNull();
    expect(normalizeCode(undefined)).toBeNull();
  });

  it("has an alphabet the generator and the check constraint agree on", () => {
    expect(CODE_ALPHABET).toHaveLength(32);
    expect(CODE_ALPHABET).not.toMatch(/[01OI]/);
    expect(CODE_LENGTH).toBe(6);
    for (const character of CODE_ALPHABET) {
      const code = character.repeat(CODE_LENGTH);
      expect(normalizeCode(code)).toBe(code);
    }
  });
});

describe("codeSpaced", () => {
  it("spells the code out, so it is not read as a word", () => {
    expect(codeSpaced("FKA429")).toBe("F K A 4 2 9");
  });
});
