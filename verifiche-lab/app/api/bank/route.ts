import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { guardApi, jsonError, zodError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { bankAccessFilter, listTags, serializeBankEntry } from "@/lib/bank/service";
import { toJson } from "@/lib/utils";

export const runtime = "nodejs";

const createSchema = z.object({
  prompt: z.string().trim().min(5).max(4000),
  type: z
    .enum(["multiple_choice", "true_false", "short_answer", "open_answer", "exercise", "problem", "graph", "lab_data", "proof"])
    .default("exercise"),
  points: z.coerce.number().min(0.5).max(30).default(4),
  difficulty: z.coerce.number().int().min(1).max(5).default(3),
  estimatedMin: z.coerce.number().int().min(1).max(60).default(6),
  solutionSteps: z.array(z.string().max(1000)).max(20).default([]),
  gradingCriteria: z.array(z.string().max(500)).max(20).default([]),
  options: z.array(z.string().max(500)).max(8).default([]),
  correctOption: z.number().int().min(0).max(7).nullable().optional(),
  visibility: z.enum(["privato", "dipartimento", "pubblico interno"]).default("dipartimento"),
  tags: z.array(z.string().trim().max(40)).max(20).default([]),
  notes: z.string().max(1000).default(""),
});

export async function GET(request: Request) {
  const guarded = await guardApi(request, { csrf: false });
  if ("response" in guarded) return guarded.response;
  const { user } = guarded;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const visibility = url.searchParams.get("visibility") ?? "";
  const tag = (url.searchParams.get("tag") ?? "").trim();
  const mine = url.searchParams.get("mine") === "1";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") ?? 18)));

  const and: Prisma.ItemBankEntryWhereInput[] = [bankAccessFilter(user)];
  if (mine) and.push({ ownerId: user.id });
  if (visibility) and.push({ visibility });
  if (tag) and.push({ tagsJson: { contains: `"${tag.replace(/"/g, '\\"')}"` } });
  if (q) {
    and.push({
      OR: [
        { itemSnapshotJson: { contains: q } },
        { notes: { contains: q } },
        { tagsJson: { contains: q } },
      ],
    });
  }
  const where: Prisma.ItemBankEntryWhereInput = { AND: and };

  const [total, rows, tags] = await Promise.all([
    prisma.itemBankEntry.count({ where }),
    prisma.itemBankEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { owner: { select: { name: true } } },
    }),
    listTags(),
  ]);

  return NextResponse.json({
    entries: rows.map((row) => serializeBankEntry(row, user)),
    tags,
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

export async function POST(request: Request) {
  const guarded = await guardApi(request);
  if ("response" in guarded) return guarded.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Corpo della richiesta non valido.");
  }
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) return zodError(parsed.error);
  const data = parsed.data;

  const entry = await prisma.itemBankEntry.create({
    data: {
      itemSnapshotJson: toJson({
        prompt: data.prompt,
        type: data.type,
        points: data.points,
        difficulty: data.difficulty,
        estimatedMin: data.estimatedMin,
        solutionSteps: data.solutionSteps,
        gradingCriteria: data.gradingCriteria,
        options: data.options,
        correctOption: data.correctOption ?? null,
        commonErrors: [],
        hints: [],
        answerSpace: "lined",
        figureSpec: null,
        topicId: null,
        objectives: [],
      }),
      visibility: data.visibility,
      ownerId: guarded.user.id,
      tagsJson: toJson(data.tags),
      notes: data.notes,
    },
    include: { owner: { select: { name: true } } },
  });

  return NextResponse.json({ entry: serializeBankEntry(entry, guarded.user) }, { status: 201 });
}
