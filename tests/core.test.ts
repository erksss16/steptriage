import { describe, it, expect } from "vitest";
import { examples } from "../src/examples";
import {
  runCheck,
  validateTutorial,
  completed,
  available,
  createSession,
  addEvent,
  emptyProgress,
  invalidateDownstream,
  markdownDraft,
  makeReport,
  parseReport,
  analytics,
  reportMarkdown,
} from "../src/core/engine";
import type { Check } from "../src/core/model";
describe("检查引擎", () => {
  const check: Check = {
    id: "version",
    type: "version-range",
    label: "Python",
    prefix: "Python",
    range: ">=3.10.0 <4.0.0",
    required: true,
  };
  it("无法识别与范围失败分开记录", () => {
    expect(runCheck(check, "no version").status).toBe("invalid-input");
    expect(runCheck(check, "Python 3.9.9").status).toBe("failed");
  });
  it("正确处理范围边界", () => {
    expect(runCheck(check, "Python 3.10.0").status).toBe("passed");
    expect(runCheck(check, "Python 4.0.0").status).toBe("failed");
    expect(runCheck(check, "Python 3.12.4").normalizedValue).toBe("3.12.4");
  });
  it("拒绝含多个候选版本的日志", () =>
    expect(runCheck(check, "Python 3.10.0 Python 3.12.0").status).toBe(
      "invalid-input",
    ));
  it("支持大小写规则，保留内部空白", () => {
    const c: Check = {
      id: "text",
      label: "文本",
      type: "text-includes",
      expected: "Hello World",
      caseSensitive: true,
      required: true,
    };
    expect(runCheck(c, " hello world ").status).toBe("failed");
    expect(
      runCheck({ ...c, caseSensitive: false }, " hello world ").status,
    ).toBe("passed");
    expect(runCheck(c, "Hello  World").status).toBe("failed");
  });
  it("人工确认不会标成文本通过", () => {
    expect(
      runCheck(
        {
          id: "manual",
          type: "manual",
          label: "观察",
          instructions: "看到页面",
          required: true,
        },
        "",
        true,
      ).status,
    ).toBe("self-confirmed");
  });
});
describe("结构与工作流", () => {
  it("三篇内置教程有效", () =>
    examples.forEach((t) => expect(validateTutorial(t).errors).toEqual([])));
  it("拒绝缺失、自我和循环依赖", () => {
    const t = structuredClone(examples[0]);
    t.steps[0].dependsOn = ["missing", t.steps[0].id, t.steps[3].id];
    const errors = validateTutorial(t).errors.join();
    expect(errors).toContain("不存在");
    expect(errors).toContain("自身");
    expect(errors).toContain("循环");
  });
  it("拒绝不存在的排错节点和不可达节点", () => {
    const t = structuredClone(examples[0]);
    const n = t.troubleshootingFlows[0].nodes[1];
    if (n.type === "fix") n.nextNodeId = "missing";
    t.troubleshootingFlows[0].nodes.push({
      id: "orphan",
      type: "end",
      outcome: "unresolved",
    });
    expect(validateTutorial(t).errors.join()).toContain("不存在");
    expect(validateTutorial(t).errors.join()).toContain("不可达");
  });
  it("失败不能完成步骤，下游输入变更使结果过期", () => {
    const s = createSession(examples[0]),
      step = s.tutorialSnapshot.steps[0];
    s.progress[step.id] = emptyProgress();
    s.progress[step.id].results[step.checks[0].id] = runCheck(
      step.checks[0],
      "Python 3.9.0",
    );
    expect(completed(step, s.progress[step.id])).toBe(false);
    expect(
      available(s.tutorialSnapshot, s.progress, s.tutorialSnapshot.steps[1]),
    ).toBe(false);
    s.progress[step.id].results[step.checks[0].id] = runCheck(
      step.checks[0],
      "Python 3.12.0",
    );
    expect(
      available(s.tutorialSnapshot, s.progress, s.tutorialSnapshot.steps[1]),
    ).toBe(true);
    const downstream = s.tutorialSnapshot.steps[1];
    s.progress[downstream.id] = emptyProgress();
    s.progress[downstream.id].results[downstream.checks[0].id] = runCheck(
      downstream.checks[0],
      "",
      true,
    );
    invalidateDownstream(s, step.id);
    expect(completed(downstream, s.progress[downstream.id])).toBe(false);
  });
  it("教程更新不影响已创建的会话", () => {
    const t = structuredClone(examples[0]),
      s = createSession(t);
    t.version = "2.0.0";
    t.steps[0].title = "已更改";
    expect(s.tutorialSnapshot.version).toBe("1.0.0");
    expect(s.tutorialSnapshot.steps[0].title).not.toBe("已更改");
  });
  it("Markdown 的代码围栏中标题不被拆分", () => {
    const t = markdownDraft(
      "# 教程\n\n## 一\n\n```md\n## 不是步骤\n```\n\n## 二\n\n内容",
    );
    expect(t.steps).toHaveLength(2);
    expect(t.steps[0].body).toContain("## 不是步骤");
    expect(validateTutorial(t).errors).toEqual([]);
  });
  it("教程包导出再导入一致", () => {
    const t = examples[0];
    expect(validateTutorial(JSON.parse(JSON.stringify(t))).tutorial).toEqual(t);
  });
});
describe("报告与分析", () => {
  it("无法识别的输入保留尝试记录，但不计为规则不符合", () => {
    const s = createSession(examples[0]);
    const step = s.tutorialSnapshot.steps[0],
      c = step.checks[0];
    addEvent(s, "check-submitted", {
      stepId: step.id,
      checkId: c.id,
      input: "unknown",
      result: runCheck(c, "unknown"),
    });
    expect(analytics([makeReport(s)])[0]).toMatchObject({
      attempts: 1,
      sessions: 1,
      failures: 0,
    });
  });
  function fixture() {
    const s = createSession(examples[0]),
      step = s.tutorialSnapshot.steps[0],
      c = step.checks[0];
    addEvent(s, "check-submitted", {
      stepId: step.id,
      checkId: c.id,
      input: "secret",
      result: runCheck(c, "Python 3.9.0"),
    });
    addEvent(s, "triage-started", { stepId: step.id, flowId: "test" });
    addEvent(s, "check-submitted", {
      stepId: step.id,
      checkId: c.id,
      input: "Python 3.12.4",
      result: runCheck(c, "Python 3.12.4"),
    });
    s.progress[step.id] = {
      ...emptyProgress(),
      inputs: { [c.id]: "secret" },
      results: { [c.id]: runCheck(c, "Python 3.12.4") },
    };
    return s;
  }
  it("成功保留失败历史，重复报告去重", () => {
    const r = makeReport(fixture());
    const stats = analytics([r, r]);
    expect(stats[0]).toMatchObject({
      sessions: 1,
      attempts: 2,
      failures: 1,
      triages: 1,
      recovered: 1,
    });
    expect(r.session.events).toHaveLength(3);
  });
  it("默认去除原始日志，完整报告可重新导入", () => {
    const s = fixture(),
      r = makeReport(s);
    expect(JSON.stringify(r)).not.toContain("secret");
    expect(JSON.stringify(makeReport(s, true))).toContain("secret");
    expect(parseReport(JSON.parse(JSON.stringify(r)))).toEqual(r);
    expect(reportMarkdown(r)).toContain("历史失败");
  });
  it("拒绝错误报告格式", () => {
    expect(() => parseReport({ kind: "oops" })).toThrow();
  });
  it("拒绝伪造的人工自动通过事件", () => {
    const r = makeReport(fixture());
    const e = r.session.events[0];
    if (e.type === "check-submitted") {
      e.payload.result.status = "self-confirmed";
      e.payload.result.evidenceSource = "manual";
    }
    expect(() => parseReport(r)).toThrow("来源不一致");
  });
  it("不同版本默认分开统计", () => {
    const a = makeReport(fixture()),
      b = makeReport(fixture());
    b.session.tutorialVersion = "2.0.0";
    b.session.tutorialSnapshot.version = "2.0.0";
    const rows = analytics([a, b]);
    expect(rows).toHaveLength(8);
    expect(rows[0].stepId).toContain("1.0.0");
    expect(rows[4].stepId).toContain("2.0.0");
  });
});
