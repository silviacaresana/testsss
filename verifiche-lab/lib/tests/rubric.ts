import { z } from "zod";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { getEditableTest, getTestForUser, serializeTest } from "@/lib/tests/repository";
import { toJson } from "@/lib/utils";

export const rubricUpdateSchema = z.object({
  indicators: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
  levels: z
    .array(
      z.object({
        level: z.number().int().min(1).max(6),
        label: z.string().trim().min(1).max(60),
        descriptor: z.string().trim().min(3).max(500),
      }),
    )
    .min(2)
    .max(6),
  itemMapping: z.record(z.array(z.string())).optional(),
  gradeScaleId: z.string().nullable().optional(),
  sufficiencyThreshold: z.number().min(0).max(100).optional(),
});

export type RubricUpdate = z.infer<typeof rubricUpdateSchema>;

export async function updateRubric(testId: string, user: SessionUser, input: RubricUpdate) {
  const test = await getEditableTest(testId, user);
  const indicators = [...new Set(input.indicators)];
  const levels = [...input.levels].sort((a, b) => a.level - b.level);
  const mapping: Record<string, string[]> = {};
  for (const item of test.items) {
    const requested = (input.itemMapping?.[item.id] ?? []).filter((name) => indicators.includes(name));
    mapping[item.id] = requested.length > 0 ? requested : [indicators[0]];
  }

  await prisma.$transaction(async (tx) => {
    await tx.rubric.upsert({
      where: { testId },
      create: {
        testId,
        indicatorsJson: toJson(indicators),
        levelsJson: toJson(levels),
        itemMappingJson: toJson(mapping),
      },
      update: {
        indicatorsJson: toJson(indicators),
        levelsJson: toJson(levels),
        itemMappingJson: toJson(mapping),
      },
    });
    const scalePatch: { gradeScaleId?: string | null } = {};
    if (input.gradeScaleId !== undefined) scalePatch.gradeScaleId = input.gradeScaleId;
    if (Object.keys(scalePatch).length > 0) {
      await tx.test.update({ where: { id: testId }, data: scalePatch });
    }
    if (input.sufficiencyThreshold !== undefined && test.gradeScaleId) {
      await tx.gradeScale.update({
        where: { id: test.gradeScaleId },
        data: { sufficiencyThreshold: input.sufficiencyThreshold },
      });
    }
    if (test.status === "approvata") {
      await tx.test.update({ where: { id: testId }, data: { status: "bozza" } });
    }
  });

  await prisma.auditLog
    .create({
      data: {
        userId: user.id,
        action: "modifica-griglia",
        entity: "Test",
        entityId: testId,
        metaJson: toJson({ indicators, levels: levels.length }),
      },
    })
    .catch(() => undefined);

  const updated = await getTestForUser(testId, user);
  return serializeTest(updated);
}
