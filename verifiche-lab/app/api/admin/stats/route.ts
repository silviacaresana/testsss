import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const guarded = await guardApi(request, { admin: true, csrf: false });
  if ("response" in guarded) return guarded.response;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    users,
    teachers,
    admins,
    tests,
    approvedTests,
    curricula,
    publishedCurricula,
    bankEntries,
    exports,
    runsThisMonth,
    costThisMonth,
    recentRuns,
    recentTests,
    recentAudit,
    topTopics,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "teacher" } }),
    prisma.user.count({ where: { role: "admin" } }),
    prisma.test.count(),
    prisma.test.count({ where: { status: "approvata" } }),
    prisma.curriculum.count(),
    prisma.curriculum.count({ where: { status: "pubblicato" } }),
    prisma.itemBankEntry.count(),
    prisma.export.count(),
    prisma.generationRun.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.generationRun.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { costEstimate: true } }),
    prisma.generationRun.count({ where: { createdAt: { gte: last30 }, status: { not: "ok" } } }),
    prisma.test.findMany({
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        subject: true,
        year: true,
        status: true,
        updatedAt: true,
        author: { select: { name: true } },
      },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: { select: { name: true } } },
    }),
    prisma.item.groupBy({
      by: ["topicId"],
      where: { topicId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { topicId: "desc" } },
      take: 5,
    }),
  ]);

  const topicIds = topTopics.map((row) => row.topicId).filter((id): id is string => Boolean(id));
  const topics = topicIds.length
    ? await prisma.topic.findMany({
        where: { id: { in: topicIds } },
        select: { id: true, code: true, name: true, curriculum: { select: { subject: true, year: true } } },
      })
    : [];
  const topicMap = new Map(topics.map((topic) => [topic.id, topic]));

  return NextResponse.json({
    stats: {
      users,
      teachers,
      admins,
      tests,
      approvedTests,
      curricula,
      publishedCurricula,
      bankEntries,
      exports,
      runsThisMonth,
      costThisMonth: Math.round((costThisMonth._sum.costEstimate ?? 0) * 10000) / 10000,
      failedRunsLast30: recentRuns,
    },
    recentTests: recentTests.map((test) => ({
      ...test,
      updatedAt: test.updatedAt.toISOString(),
      authorName: test.author.name,
    })),
    recentAudit: recentAudit.map((row) => ({
      id: row.id,
      action: row.action,
      entity: row.entity,
      userName: row.user?.name ?? "Sistema",
      createdAt: row.createdAt.toISOString(),
    })),
    topTopics: topTopics.map((row) => {
      const topic = row.topicId ? topicMap.get(row.topicId) : undefined;
      return {
        id: row.topicId,
        code: topic?.code ?? "—",
        name: topic?.name ?? "Argomento eliminato",
        subject: topic?.curriculum.subject ?? "",
        year: topic?.curriculum.year ?? 0,
        uses: row._count._all,
      };
    }),
  });
}
