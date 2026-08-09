import { describe, expect, it } from "vitest";
import { maskStudentId, parseLinkedStudents } from "./linked-students";

const STUDENT_ID = "71111111-1111-4111-8111-111111111111";
const ISO = "2026-08-09T00:00:00.000Z";

describe("guardian linked students", () => {
  it("parses and sorts the minimal active-student shape", () => {
    expect(parseLinkedStudents([
      { student_user_id: STUDENT_ID, display_name: " 학생 A ", linked_at: ISO },
    ])).toEqual([{ studentUserId: STUDENT_ID, displayName: "학생 A", linkedAt: ISO }]);
  });

  it("drops malformed rows and masks duplicate-name identifiers", () => {
    expect(parseLinkedStudents([{ student_user_id: "bad", display_name: "학생", linked_at: ISO }])).toEqual([]);
    expect(maskStudentId(STUDENT_ID)).toBe("71111111…1111");
  });
});
