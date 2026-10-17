import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { query, queryOne } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { effectiveRoles, hasPermission } from "@/lib/roles";
import { z } from "zod";

const itemSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().trim().min(1).max(300),
  type: z.enum(["check", "yesno", "number", "text"]),
  required: z.boolean().default(true),
});
const templateSchema = z.object({
  title: z.string().trim().min(1).max(150),
  description: z.string().max(1000).default(""),
  role: z.enum(["MANAGER", "CASHIER", "COOK", "STOCKKEEPER"]),
  schedule: z.enum(["daily", "manual"]),
  active: z.boolean().default(true),
  items: z.array(itemSchema).min(1).max(100).refine(items => new Set(items.map(i => i.id)).size === items.length, "Повторяются ID пунктов"),
});
const answerSchema = z.record(z.string(), z.union([z.boolean(), z.number().finite(), z.string().max(3000)]));
const deny = () => NextResponse.json({ error: "Нет доступа" }, { status: 403 });
const invalid = (error: string) => NextResponse.json({ error }, { status: 400 });
const failure = (e: unknown) => {
  if ((e as Error).message === "UNAUTHORIZED") return deny();
  console.error("Checklists API:", e);
  return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
};
const canEdit = (user: Parameters<typeof hasPermission>[0]) => hasPermission(user, "reports");
const canRun = (user: Parameters<typeof effectiveRoles>[0], role: string) =>
  effectiveRoles(user).some(r => r === "ADMIN" || r === "OWNER" || r === "MANAGER" || r === role);

export async function GET() {
  try {
    const user = await requireAdmin("checklists");
    const templates = await query('SELECT * FROM checklist_templates ORDER BY updated_at DESC');
    const runs = await query('SELECT * FROM checklist_runs WHERE work_date >= CURRENT_DATE - 30 ORDER BY updated_at DESC LIMIT 500');
    return NextResponse.json({
      templates: templates.filter(t => canEdit(user) || canRun(user, t.role as string)),
      runs: runs.filter(r => canEdit(user) || r.actor_id === user.id),
      canEdit: canEdit(user),
    });
  } catch (e) { return failure(e); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin("checklists");
    const body = await request.json();
    if (body.action === "saveTemplate") {
      if (!canEdit(user)) return deny();
      const parsed = templateSchema.safeParse(body.template);
      if (!parsed.success) return invalid("Проверьте поля и пункты чек-листа");
      const t = parsed.data;
      const id = typeof body.id === "string" ? body.id : uuid();
      const result = await query(
        `INSERT INTO checklist_templates (id,title,description,role,schedule,active,items)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description,
         role=EXCLUDED.role,schedule=EXCLUDED.schedule,active=EXCLUDED.active,
         items=EXCLUDED.items,updated_at=now()
         RETURNING id`,
        [id,t.title,t.description,t.role,t.schedule,t.active,JSON.stringify(t.items)]
      );
      return NextResponse.json({ id: result[0].id });
    }
    if (body.action === "start") {
      if (typeof body.templateId !== "string") return invalid("Не указан шаблон");
      const template = await queryOne('SELECT * FROM checklist_templates WHERE id=$1 AND active=true', [body.templateId]);
      if (!template) return invalid("Шаблон недоступен");
      if (!canRun(user, template.role as string)) return deny();
      const run = await queryOne(
        `INSERT INTO checklist_runs(id,template_id,actor_id,work_date,title,items)
         VALUES($1,$2,$3,CURRENT_DATE,$4,$5)
         ON CONFLICT(template_id,actor_id,work_date) DO UPDATE SET updated_at=checklist_runs.updated_at
         RETURNING *`,
        [uuid(),template.id,user.id,template.title,JSON.stringify(template.items)]
      );
      return NextResponse.json({ run });
    }
    if (body.action === "answer") {
      if (typeof body.runId !== "string") return invalid("Не указан запуск");
      const parsed = answerSchema.safeParse(body.answers);
      if (!parsed.success) return invalid("Недопустимые ответы");
      const run = await queryOne('SELECT * FROM checklist_runs WHERE id=$1', [body.runId]);
      if (!run) return invalid("Проверка не найдена");
      if (run.actor_id !== user.id && !canEdit(user)) return deny();
      if (run.completed_at) return invalid("Завершённый чек-лист нельзя изменить");
      const items = itemSchema.array().safeParse(run.items);
      if (!items.success) return invalid("Некорректный шаблон проверки");
      const answers = parsed.data;
      for (const [key,value] of Object.entries(answers)) {
        const item = items.data.find(i => i.id === key);
        if (!item) return invalid("Неизвестный пункт");
        if (item.type === "check" && typeof value !== "boolean" ||
            item.type === "yesno" && typeof value !== "boolean" ||
            item.type === "number" && typeof value !== "number" ||
            item.type === "text" && typeof value !== "string") return invalid("Неверный тип ответа");
      }
      if (body.complete === true && items.data.some(item => item.required && (answers[item.id] === undefined || answers[item.id] === ""))) {
        return invalid("Заполните все обязательные пункты");
      }
      const updated = await queryOne(
        `UPDATE checklist_runs SET answers=$2, completed_at=CASE WHEN $3 THEN now() ELSE null END,
         updated_at=now() WHERE id=$1 AND completed_at IS NULL RETURNING *`,
        [run.id,JSON.stringify(answers),body.complete === true]
      );
      return NextResponse.json({ run: updated });
    }
    return invalid("Неизвестное действие");
  } catch (e) { return failure(e); }
}
