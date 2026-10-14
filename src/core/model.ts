import { z } from "zod";
import { validRange } from "semver";
const id = z
  .string()
  .min(1)
  .max(150)
  .refine(
    (v) => !["__proto__", "constructor", "prototype"].includes(v),
    "保留名称不能作为 ID",
  );
const base = { id, label: z.string().min(1), required: z.boolean() };
export const checkSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("text-includes"),
    expected: z.string().min(1),
    caseSensitive: z.boolean(),
  }),
  z.object({
    ...base,
    type: z.literal("version-range"),
    range: z.string().refine((v) => !!validRange(v), "无效的版本范围"),
    prefix: z.string().min(1),
  }),
  z.object({
    ...base,
    type: z.literal("manual"),
    instructions: z.string().min(1),
  }),
]);
export const nodeSchema = z.discriminatedUnion("type", [
  z.object({
    id,
    type: z.literal("question"),
    question: z.string().min(1),
    options: z
      .array(
        z.object({
          id,
          label: z.string().min(1),
          nextNodeId: id,
          isFallback: z.boolean().optional(),
        }),
      )
      .min(2),
  }),
  z.object({
    id,
    type: z.literal("fix"),
    title: z.string().min(1),
    instructions: z.string().min(1),
    nextNodeId: id,
  }),
  z.object({
    id,
    type: z.literal("end"),
    outcome: z.enum(["retry-check", "unresolved"]),
    returnCheckId: id.optional(),
  }),
]);
export const tutorialSchema = z.object({
  schemaVersion: z.literal("1"),
  id,
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  title: z.string().min(1),
  description: z.string(),
  category: z.string().default("自定义"),
  duration: z.string().default("自主探索"),
  environmentFields: z.array(
    z.object({ id, label: z.string(), placeholder: z.string().optional() }),
  ),
  steps: z
    .array(
      z.object({
        id,
        title: z.string().min(1),
        body: z.string(),
        dependsOn: z.array(id),
        optional: z.boolean(),
        allowSkipDependency: z.boolean().default(false),
        checks: z.array(checkSchema).min(1),
        troubleshootingFlowId: id.optional(),
      }),
    )
    .min(1),
  troubleshootingFlows: z.array(
    z.object({ id, entryNodeId: id, nodes: z.array(nodeSchema).min(1) }),
  ),
});
export type Tutorial = z.infer<typeof tutorialSchema>;
export type Step = Tutorial["steps"][number];
export type Check = z.infer<typeof checkSchema>;
export type TriageNode = z.infer<typeof nodeSchema>;
export type CheckResult = {
  checkId: string;
  status: "passed" | "failed" | "self-confirmed" | "invalid-input";
  reason: string;
  checkedAt: string;
  evidenceSource: "pasted-text" | "manual";
  normalizedValue?: string;
};
export type EventPayload = {
  "step-opened": { stepId: string };
  "check-submitted": {
    stepId: string;
    checkId: string;
    input?: string;
    result: CheckResult;
  };
  "manual-confirmed": { stepId: string; checkId: string; result: CheckResult };
  "triage-started": { stepId: string; flowId: string };
  "triage-option-selected": {
    stepId: string;
    nodeId: string;
    optionId: string;
    label: string;
  };
  "fix-attempted": { stepId: string; nodeId: string; title: string };
  "triage-ended": { stepId: string; outcome: "retry-check" | "unresolved" };
  "step-skipped": { stepId: string };
  "session-finished": { completed: boolean };
  "input-changed": { stepId: string; checkId: string };
};
export type SessionEvent = {
  [K in keyof EventPayload]: {
    id: string;
    sessionId: string;
    timestamp: string;
    type: K;
    payload: EventPayload[K];
  };
}[keyof EventPayload];
export type Progress = {
  results: Record<string, CheckResult>;
  inputs: Record<string, string>;
  stale: boolean;
  skipped: boolean;
};
export type Session = {
  id: string;
  tutorialId: string;
  tutorialVersion: string;
  tutorialSnapshot: Tutorial;
  environment: Record<string, string>;
  currentStepId: string;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  progress: Record<string, Progress>;
  events: SessionEvent[];
  triage?: { stepId: string; flowId: string; nodeId: string };
  notes: string;
};
export type Report = {
  schemaVersion: "1";
  kind: "steptriage-report";
  session: Session;
  includesLogs: boolean;
};
export const uid = () => crypto.randomUUID();
