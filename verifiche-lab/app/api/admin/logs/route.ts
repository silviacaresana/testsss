import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api";
import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const guarded = await guardApi(request, { admin: true, csrf: false });
  if ("response" in guarded) return guarded.response;

  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "generazioni";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize") ?? 25)));
  const q = (url.searchParams.get("q") ?? "").trim();

  if (type === "audit") {
    const where = q
      ? {
          OR: [
            { action: { contains: q } },
            { entity: { contains: q } },
            { user: { name: { contains: q } } },
          ],
        }
      : {};
    const [total, rows] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { name: true, email: true } } },
      }),
    ]);
    return NextResponse.json({
      type,
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      audit: rows.map((row) => ({
        id: row.id,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        meta: parseJson<Record<string, unknown>>(row.metaJson, {}),
        userName: row.user?.name ?? "Sistema",
        userEmail: row.user?.email ?? "",
        createdAt: row.createdAt.toISOString(),
      })),
    });
  }

  const where = q
    ? {
        OR: [
          { provider: { contains: q } },
          { model: { contains: q } },
          { user: { name: { contains: q } } },
          { test: { title: { contains: q } } },
        ],
      }
    : {};
  const [total, rows] = await Promise.all([
    prisma.generationRun.count({ where }),
    prisma.generationRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { name: true } },
        test: { select: { id: true, title: true } },
      },
    }),
  ]);

  return NextResponse.json({
    type,
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    runs: rows.map((row) => ({
      id: row.id,
      userName: row.user.name,
      testId: row.test?.id ?? null,
      testTitle: row.test?.title ?? null,
      provider: row.provider,
      model: row.model,
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      costEstimate: row.costEstimate,
      durationMs: row.durationMs,
      status: row.status,
      errors: parseJson<string[]>(row.errorsJson, []),
      promptExcerpt: row.promptExcerpt ?? "",
      createdAt: row.createdAt.toISOString(),
    })),
  });
}
