import { requireUser } from "@/lib/auth/session";
import { CurriculumImport } from "@/components/curriculum/curriculum-import";

export const dynamic = "force-dynamic";

export const metadata = { title: "Nuovo programma" };

export default async function NewCurriculumPage() {
  await requireUser();
  return <CurriculumImport />;
}
