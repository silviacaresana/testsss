#!/bin/sh
set -eu

echo "[verifiche-lab] Applico lo schema Prisma…"
./node_modules/.bin/prisma db push --skip-generate

if [ "${SEED_DEMO:-false}" = "true" ]; then
  echo "[verifiche-lab] Seed dimostrativo (idempotente)…"
  ./node_modules/.bin/tsx prisma/seed.ts
fi

echo "[verifiche-lab] Avvio Next.js sulla porta ${PORT:-3000}…"
exec ./node_modules/.bin/next start -p "${PORT:-3000}"
