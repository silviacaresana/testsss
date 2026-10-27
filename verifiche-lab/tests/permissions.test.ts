import { describe, expect, it } from "vitest";
import { canAccessTest, canEditTest } from "@/lib/tests/repository";
import { canEditCurriculum } from "@/lib/curriculum/service";

const teacher = { id: "teacher-1", role: "teacher" as const };
const otherTeacher = { id: "teacher-2", role: "teacher" as const };
const admin = { id: "admin-1", role: "admin" as const };

describe("permessi sulle verifiche", () => {
  const ownTest = { authorId: "teacher-1", isTemplate: false };

  it("consente al docente di accedere alle proprie verifiche", () => {
    expect(canAccessTest(teacher, ownTest)).toBe(true);
    expect(canEditTest(teacher, ownTest)).toBe(true);
  });

  it("impedisce l'accesso alle verifiche private di altri docenti", () => {
    expect(canAccessTest(otherTeacher, ownTest)).toBe(false);
    expect(canEditTest(otherTeacher, ownTest)).toBe(false);
  });

  it("rende visibili le verifiche modello a tutto il dipartimento", () => {
    expect(canAccessTest(otherTeacher, { ...ownTest, isTemplate: true })).toBe(true);
    expect(canEditTest(otherTeacher, { authorId: ownTest.authorId })).toBe(false);
  });

  it("consente all'amministratore di accedere e modificare tutto", () => {
    expect(canAccessTest(admin, ownTest)).toBe(true);
    expect(canEditTest(admin, ownTest)).toBe(true);
  });
});

describe("permessi sui programmi", () => {
  it("blocca la modifica di un programma pubblicato anche all'autore", () => {
    expect(canEditCurriculum(teacher, { authorId: "teacher-1", status: "pubblicato" })).toBe(false);
  });

  it("consente all'autore di modificare una bozza", () => {
    expect(canEditCurriculum(teacher, { authorId: "teacher-1", status: "bozza" })).toBe(true);
  });

  it("impedisce a un altro docente di modificare il programma", () => {
    expect(canEditCurriculum(otherTeacher, { authorId: "teacher-1", status: "bozza" })).toBe(false);
  });

  it("consente all'amministratore di modificare qualsiasi programma", () => {
    expect(canEditCurriculum(admin, { authorId: "teacher-1", status: "pubblicato" })).toBe(true);
  });
});
