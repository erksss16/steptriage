import { satisfies } from "semver";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { z } from "zod";
import {
  tutorialSchema,
  uid,
  type Tutorial,
  type Step,
  type Check,
  type CheckResult,
  type Session,
  type Progress,
  type SessionEvent,
  type EventPayload,
  type Report,
} from "./model";
export const emptyProgress = (): Progress => ({
  results: {},
  inputs: {},
  stale: false,
  skipped: false,
});
export const success = (r?: CheckResult) =>
  !!r && ["passed", "self-confirmed"].includes(r.status);
export function runCheck(
  check: Check,
  input: string,
  confirmed = false,
): CheckResult {
  const result: CheckResult = {
    checkId: check.id,
    status: "invalid-input",
    reason: "请输入检查内容",
    checkedAt: new Date().toISOString(),
    evidenceSource: check.type === "manual" ? "manual" : "pasted-text",
  };
  if (check.type === "manual")
    return {
      ...result,
      status: confirmed ? "self-confirmed" : "failed",
      reason: confirmed ? "用户自行确认观察结果" : "尚未确认观察结果",
    };
  if (!input.trim()) return result;
  if (input.length > 50000)
    return { ...result, reason: "输入超过 50,000 字符，请仅保留相关输出" };
  if (check.type === "text-includes") {
    const pass = check.caseSensitive
      ? input.trim().includes(check.expected)
      : input.trim().toLowerCase().includes(check.expected.toLowerCase());
    return {
      ...result,
      status: pass ? "passed" : "failed",
      reason: pass
        ? `提交文本包含预期内容「${check.expected}」`
        : `未发现预期文本「${check.expected}」`,
    };
  }
  const escaped = check.prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const candidates = [
    ...input.matchAll(
      new RegExp(
        `${escaped}\\s*[vV]?(\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?)`,
        "gi",
      ),
    ),
  ];
  if (candidates.length !== 1)
    return {
      ...result,
      reason: candidates.length
        ? "发现多个候选版本，请只提交一条版本输出"
        : `无法识别版本，请提交如 ${check.prefix} 3.12.4 的完整输出`,
    };
  const version = candidates[0][1],
    pass = satisfies(version, check.range);
  return {
    ...result,
    status: pass ? "passed" : "failed",
    reason: `${version} ${pass ? "符合" : "不符合"}要求 ${check.range}`,
    normalizedValue: version,
  };
}
export function completed(step: Step, p?: Progress) {
  return (
    !!p &&
    !p.stale &&
    !p.skipped &&
    step.checks.filter((c) => c.required).length > 0 &&
    step.checks.filter((c) => c.required).every((c) => success(p.results[c.id]))
  );
}
export function available(
  t: Tutorial,
  progress: Session["progress"],
  step: Step,
) {
  return step.dependsOn.every((id) => {
    const dep = t.steps.find((s) => s.id === id);
    return (
      !!dep &&
      (completed(dep, progress[id]) ||
        (dep.optional && dep.allowSkipDependency && progress[id]?.skipped))
    );
  });
}
export function validateTutorial(value: unknown): {
  tutorial?: Tutorial;
  errors: string[];
} {
  const parsed = tutorialSchema.safeParse(value);
  if (!parsed.success)
    return {
      errors: parsed.error.issues.map(
        (i) => `${i.path.join(".")}：${i.message}`,
      ),
    };
  const t = parsed.data,
    errors: string[] = [],
    ids = t.steps.map((s) => s.id);
  const duplicates = (arr: string[], label: string) => {
    if (new Set(arr).size !== arr.length) errors.push(`${label} ID 重复`);
  };
  duplicates(ids, "步骤");
  duplicates(
    t.troubleshootingFlows.map((f) => f.id),
    "排错流程",
  );
  duplicates(
    t.environmentFields.map((f) => f.id),
    "环境字段",
  );
  duplicates(
    t.steps.flatMap((s) => s.checks.map((c) => c.id)),
    "检查点",
  );
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) {
      errors.push(`步骤 ${id} 形成循环依赖`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    t.steps.find((s) => s.id === id)?.dependsOn.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  };
  t.steps.forEach((s) => {
    if (!s.checks.some((c) => c.required))
      errors.push(`${s.title}：必须至少有一个必需检查或人工确认`);
    s.dependsOn.forEach((d) => {
      if (!ids.includes(d)) errors.push(`${s.title}：依赖 ${d} 不存在`);
      if (d === s.id) errors.push(`${s.title}：不能依赖自身`);
    });
    visit(s.id);
    if (
      s.troubleshootingFlowId &&
      !t.troubleshootingFlows.some((f) => f.id === s.troubleshootingFlowId)
    )
      errors.push(`${s.title}：排错流程不存在`);
  });
  t.troubleshootingFlows.forEach((f) => {
    const nodeIds = f.nodes.map((n) => n.id);
    duplicates(nodeIds, "节点");
    if (!nodeIds.includes(f.entryNodeId))
      errors.push(`${f.id}：入口节点不存在`);
    const reached = new Set<string>(),
      active = new Set<string>();
    const walk = (id: string) => {
      if (active.has(id)) {
        errors.push(`${f.id}：排错路线存在环`);
        return;
      }
      if (reached.has(id)) return;
      const n = f.nodes.find((n) => n.id === id);
      if (!n) {
        errors.push(`${f.id}：目标节点 ${id} 不存在`);
        return;
      }
      active.add(id);
      reached.add(id);
      if (n.type === "question") {
        duplicates(
          n.options.map((o) => o.id),
          "选项",
        );
        if (!n.options.some((o) => o.isFallback))
          errors.push(`${n.id}：缺少「以上都不符合」出口`);
        n.options.forEach((o) => walk(o.nextNodeId));
      }
      if (n.type === "fix") walk(n.nextNodeId);
      if (n.type === "end" && n.outcome === "retry-check")
        t.steps
          .filter((s) => s.troubleshootingFlowId === f.id)
          .forEach((s) => {
            if (!s.checks.some((c) => c.id === n.returnCheckId))
              errors.push(`${n.id}：返回检查点不属于步骤 ${s.title}`);
          });
      active.delete(id);
    };
    walk(f.entryNodeId);
    if (reached.size !== f.nodes.length) errors.push(`${f.id}：存在不可达节点`);
  });
  return { tutorial: errors.length ? undefined : t, errors };
}
export function createSession(t: Tutorial): Session {
  const now = new Date().toISOString();
  return {
    id: uid(),
    tutorialId: t.id,
    tutorialVersion: t.version,
    tutorialSnapshot: structuredClone(t),
    environment: { os: "Windows", python: "" },
    currentStepId: t.steps[0].id,
    startedAt: now,
    updatedAt: now,
    progress: {},
    events: [],
    notes: "",
  };
}
export function addEvent<K extends keyof EventPayload>(
  s: Session,
  type: K,
  payload: EventPayload[K],
) {
  s.events.push({
    id: uid(),
    sessionId: s.id,
    timestamp: new Date().toISOString(),
    type,
    payload,
  } as SessionEvent);
  s.updatedAt = new Date().toISOString();
}
export function invalidateDownstream(s: Session, stepId: string) {
  const queue = [stepId],
    seen = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    s.tutorialSnapshot.steps
      .filter((x) => x.dependsOn.includes(current))
      .forEach((x) => {
        if (seen.has(x.id)) return;
        seen.add(x.id);
        if (s.progress[x.id]) {
          s.progress[x.id].stale = true;
          s.progress[x.id].results = {};
          s.progress[x.id].skipped = false;
        }
        queue.push(x.id);
      });
  }
}
export function markdownDraft(source: string): Tutorial {
  const tree = unified().use(remarkParse).parse(source),
    steps: Step[] = [];
  let current: Step | undefined;
  let title = "新建教程";
  const headingText = (n: unknown): string => {
    const item = n as { value?: string; children?: unknown[] };
    return item.value ?? item.children?.map(headingText).join("") ?? "";
  };
  tree.children.forEach((node) => {
    if (node.type === "heading" && node.depth === 1)
      title = headingText(node) || title;
    if (node.type === "heading" && node.depth === 2) {
      current = {
        id: uid(),
        title: headingText(node) || "新步骤",
        body: "",
        dependsOn: steps.length ? [steps[steps.length - 1].id] : [],
        optional: false,
        allowSkipDependency: false,
        checks: [
          {
            id: uid(),
            type: "manual",
            label: "确认步骤结果",
            instructions: "请作者填写明确的完成条件",
            required: true,
          },
        ],
      };
      steps.push(current);
    } else if (current && node.position)
      current.body +=
        source.slice(node.position.start.offset, node.position.end.offset) +
        "\n\n";
  });
  if (!steps.length)
    steps.push({
      id: uid(),
      title: "开始操作",
      body: source,
      dependsOn: [],
      optional: false,
      allowSkipDependency: false,
      checks: [
        {
          id: uid(),
          type: "manual",
          label: "确认结果",
          instructions: "请作者填写明确的完成条件",
          required: true,
        },
      ],
    });
  return {
    schemaVersion: "1",
    id: uid(),
    version: "1.0.0",
    title,
    description: "从 Markdown 导入的草稿，请确认检查规则后保存。",
    category: "自定义",
    duration: "自主探索",
    environmentFields: [
      { id: "os", label: "操作系统", placeholder: "Windows / macOS / Linux" },
    ],
    steps,
    troubleshootingFlows: [],
  };
}
export function makeReport(s: Session, logs = false): Report {
  const copy = structuredClone(s);
  if (!logs) {
    Object.values(copy.progress).forEach((p) => (p.inputs = {}));
    copy.events.forEach((e) => {
      if (e.type === "check-submitted") delete e.payload.input;
    });
  }
  return {
    schemaVersion: "1",
    kind: "steptriage-report",
    session: copy,
    includesLogs: logs,
  };
}
export function reportMarkdown(report: Report) {
  const s = report.session;
  const allComplete = s.tutorialSnapshot.steps
    .filter((x) => !x.optional)
    .every((x) => completed(x, s.progress[x.id]));
  const lines = [
    `# ${s.tutorialSnapshot.title} · 复现报告`,
    "",
    `- 教程版本：${s.tutorialVersion}`,
    `- 会话：${s.id}`,
    `- 环境：${Object.entries(s.environment)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" / ")}`,
    `- 开始：${s.startedAt}`,
    `- 结束：${s.finishedAt || "尚未结束"}`,
    `- 状态：${s.finishedAt ? (allComplete ? "已完成" : "已结束，部分步骤未完成") : "未完成"}`,
  ];
  for (const step of s.tutorialSnapshot.steps) {
    const events = s.events.filter(
        (e) => "stepId" in e.payload && e.payload.stepId === step.id,
      ),
      p = s.progress[step.id];
    const state = p?.stale
      ? "需要重新确认"
      : p?.skipped
        ? "已跳过"
        : completed(step, p)
          ? "已满足"
          : "尚未满足";
    lines.push("", `## ${step.title}`, "", `- 步骤状态：${state}`);
    for (const c of step.checks) {
      const r = p?.results[c.id];
      lines.push(
        `- ${c.label} (${c.type === "manual" ? "用户自行确认" : "提交文本检查"})：${r?.reason || "未检查"}${r ? ` · ${r.checkedAt}` : ""}`,
      );
    }
    lines.push(
      `- 检查次数：${events.filter((e) => e.type === "check-submitted" || e.type === "manual-confirmed").length}`,
    );
    for (const e of events) {
      if (
        (e.type === "check-submitted" || e.type === "manual-confirmed") &&
        !success(e.payload.result)
      )
        lines.push(
          `- ${e.payload.result.status === "invalid-input" ? "历史输入无法检查" : "历史失败"}：${e.payload.result.reason} · ${e.timestamp}`,
        );
      if (e.type === "triage-option-selected")
        lines.push(`- 用户报告症状：${e.payload.label}`);
      if (e.type === "fix-attempted")
        lines.push(`- 已尝试建议：${e.payload.title}`);
      if (e.type === "triage-ended")
        lines.push(
          `- 排错结果：${e.payload.outcome === "retry-check" ? "返回检查点重试" : "尚未解决"}`,
        );
      if (
        report.includesLogs &&
        e.type === "check-submitted" &&
        e.payload.input
      )
        lines.push(
          "",
          `提交于 ${e.timestamp}`,
          "```text",
          e.payload.input.replaceAll("```", "[代码围栏]"),
          "```",
        );
    }
  }
  lines.push(
    "",
    "## 补充说明",
    "",
    s.notes || "无",
    "",
    "检查仅针对提交文本或人工观察；修复后通过不代表已证明根因。",
  );
  return lines.join("\n");
}
export function parseReport(value: unknown): Report {
  if (!value || typeof value !== "object") throw Error("报告必须为 JSON 对象");
  const r = value as Report;
  if (r.kind !== "steptriage-report" || r.schemaVersion !== "1" || !r.session)
    throw Error("不支持的报告格式");
  const resultSchema = z.object({
    checkId: z.string(),
    status: z.enum(["passed", "failed", "self-confirmed", "invalid-input"]),
    reason: z.string(),
    checkedAt: z.string().datetime(),
    evidenceSource: z.enum(["manual", "pasted-text"]),
    normalizedValue: z.string().optional(),
  });
  const eventBase = {
    id: z.string(),
    sessionId: z.string(),
    timestamp: z.string().datetime(),
  };
  const event = (type: string, payload: z.ZodTypeAny) =>
    z.object({ ...eventBase, type: z.literal(type), payload });
  const stepRef = { stepId: z.string() };
  const eventSchema = z.union([
    event("step-opened", z.object(stepRef)),
    event(
      "check-submitted",
      z.object({
        ...stepRef,
        checkId: z.string(),
        input: z.string().optional(),
        result: resultSchema,
      }),
    ),
    event(
      "manual-confirmed",
      z.object({ ...stepRef, checkId: z.string(), result: resultSchema }),
    ),
    event("triage-started", z.object({ ...stepRef, flowId: z.string() })),
    event(
      "triage-option-selected",
      z.object({
        ...stepRef,
        nodeId: z.string(),
        optionId: z.string(),
        label: z.string(),
      }),
    ),
    event(
      "fix-attempted",
      z.object({ ...stepRef, nodeId: z.string(), title: z.string() }),
    ),
    event(
      "triage-ended",
      z.object({ ...stepRef, outcome: z.enum(["retry-check", "unresolved"]) }),
    ),
    event("step-skipped", z.object(stepRef)),
    event("session-finished", z.object({ completed: z.boolean() })),
    event("input-changed", z.object({ ...stepRef, checkId: z.string() })),
  ]);
  const parsed = z
    .object({
      id: z.string().min(1),
      tutorialId: z.string(),
      tutorialVersion: z.string(),
      currentStepId: z.string(),
      startedAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
      finishedAt: z.string().datetime().optional(),
      environment: z.record(z.string()),
      notes: z.string(),
      progress: z.record(
        z.object({
          results: z.record(resultSchema),
          inputs: z.record(z.string()),
          stale: z.boolean(),
          skipped: z.boolean(),
        }),
      ),
      events: z.array(eventSchema),
    })
    .safeParse(r.session);
  if (!parsed.success)
    throw Error(
      "报告会话结构无效：" +
        parsed.error.issues.map((i) => i.path.join(".")).join("、"),
    );
  const s = r.session;
  const v = validateTutorial(s.tutorialSnapshot);
  if (v.errors.length) throw Error(v.errors.join("\n"));
  if (
    s.tutorialId !== v.tutorial!.id ||
    s.tutorialVersion !== v.tutorial!.version
  )
    throw Error("会话与教程快照版本不一致");
  for (const e of s.events) {
    if (e.sessionId !== s.id) throw Error("事件会话引用无效");
    if (
      "stepId" in e.payload &&
      !v.tutorial!.steps.some(
        (x) => x.id === ("stepId" in e.payload ? e.payload.stepId : ""),
      )
    )
      throw Error("事件步骤引用无效");
    if (e.type === "check-submitted" || e.type === "manual-confirmed") {
      const p = e.payload;
      const c = v
        .tutorial!.steps.find((x) => x.id === p.stepId)
        ?.checks.find((x) => x.id === p.checkId);
      if (!c || p.result.checkId !== c.id) throw Error("事件检查点引用无效");
      if (
        p.result.evidenceSource !==
          (c.type === "manual" ? "manual" : "pasted-text") ||
        (p.result.status === "self-confirmed" && c.type !== "manual") ||
        (p.result.status === "passed" && c.type === "manual")
      )
        throw Error("检查结果来源不一致");
    }
  }
  return r;
}
export function analytics(reports: Report[]) {
  const unique = [...new Map(reports.map((r) => [r.session.id, r])).values()];
  const rows = new Map<
    string,
    {
      stepId: string;
      title: string;
      attempts: number;
      sessions: number;
      failures: number;
      triages: number;
      recovered: number;
      unresolved: number;
    }
  >();
  for (const { session: s } of unique)
    for (const step of s.tutorialSnapshot.steps) {
      const key = `${s.tutorialId}/${s.tutorialVersion}/${step.id}`;
      const row = rows.get(key) || {
        stepId: key,
        title: step.title,
        attempts: 0,
        sessions: 0,
        failures: 0,
        triages: 0,
        recovered: 0,
        unresolved: 0,
      };
      const events = s.events.filter(
        (e) => "stepId" in e.payload && e.payload.stepId === step.id,
      );
      const checks = events.filter(
        (e) => e.type === "check-submitted" || e.type === "manual-confirmed",
      );
      if (checks.length) {
        row.sessions++;
        row.attempts += checks.length;
        if (
          checks.some(
            (e) =>
              (e.type === "check-submitted" || e.type === "manual-confirmed") &&
              e.payload.result.status === "failed",
          )
        )
          row.failures++;
      }
      const first = events.findIndex((e) => e.type === "triage-started");
      if (first >= 0) {
        row.triages++;
        if (
          events
            .slice(first + 1)
            .some(
              (e) =>
                (e.type === "check-submitted" ||
                  e.type === "manual-confirmed") &&
                success(e.payload.result),
            )
        )
          row.recovered++;
      }
      if (
        events.some(
          (e) =>
            e.type === "triage-ended" && e.payload.outcome === "unresolved",
        )
      )
        row.unresolved++;
      rows.set(key, row);
    }
  return [...rows.values()];
}
