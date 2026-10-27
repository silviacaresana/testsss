import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardApi, jsonError } from "@/lib/api";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const guarded = await guardApi(request, { csrf: false });
  if ("response" in guarded) return guarded.response;
  const { user } = guarded;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const status = url.searchParams.get("status") ?? "";
  const track = url.searchParams.get("track") ?? "";
  const subject = url.searchParams.get("subject") ?? "";
  const year = Number(url.searchParams.get("year") ?? 0);
  const scope = url.searchParams.get("scope") ?? "mine";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(60, Math.max(5, Number(url.searchParams.get("pageSize") ?? 20)));

  const where: Prisma.TestWhereInput = {};
  if (user.role !== "admin" || scope !== "all") {
    where.OR = [{ authorId: user.id }, { isTemplate: true }];
  }
  if (q) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      { OR: [{ title: { contains: q } }, { classLabel: { contains: q } }] },
    ];
  }
  if (status) where.status = status;
  if (track) where.track = track;
  if (subject) where.subject = subject;
  if (year >= 1 && year <= 5) where.year = year;

  const [total, rows] = await Promise.all([
    prisma.test.count({ where }),
    prisma.test.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        title: true,
        track: true,
        year: true,
        subject: true,
        classLabel: true,
        examDate: true,
        durationMin: true,
        totalPoints: true,
        status: true,
        versionLabel: true,
        isTemplate: true,
        parentTestId: true,
        updatedAt: true,
        aiProvider: true,
        author: { select: { name: true } },
        _count: { select: { items: true } },
        items: { select: { points: true, estimatedMin: true } },
      },
    }),
  ]);

  return NextResponse.json({
    tests: rows.map((row) => {
      const points = Math.round(row.items.reduce((acc, item) => acc + item.points, 0) * 100) / 100;
      const minutes = row.items.reduce((acc, item) => acc + item.estimatedMin, 0);
      return {
        id: row.id,
        title: row.title,
        track: row.track,
        year: row.year,
        subject: row.subject,
        classLabel: row.classLabel,
        examDate: row.examDate ? row.examDate.toISOString() : null,
        durationMin: row.durationMin,
        totalPoints: row.totalPoints,
        points,
        minutes,
        balanced: Math.abs(points - row.totalPoints) < 0.0001,
        timeInTolerance: Math.abs(minutes - row.durationMin) <= row.durationMin * 0.1,
        status: row.status,
        versionLabel: row.versionLabel,
        isTemplate: row.isTemplate,
        parentTestId: row.parentTestId,
        updatedAt: row.updatedAt.toISOString(),
        authorName: row.author.name,
        itemCount: row._count.items,
        aiProvider: row.aiProvider,
      };
    }),
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

export async function POST() {
  return jsonError("Usa POST /api/tests/generate per creare una verifica.", 405);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { allow: "GET" } });
}
