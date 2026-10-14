import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check as CheckIcon,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Code2,
  Download,
  FileText,
  FlaskConical,
  GitBranch,
  HelpCircle,
  LayoutGrid,
  Lock,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Terminal,
  Trash2,
  Upload,
  X,
  BarChart3,
  RotateCcw,
  Save,
  GripVertical,
  AlertCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { examples } from "./examples";
import { loadState, saveState, type State } from "./storage";
import {
  uid,
  type Tutorial,
  type Session,
  type Check,
  type TriageNode,
  type Report,
} from "./core/model";
import {
  addEvent,
  analytics,
  available,
  completed,
  createSession,
  emptyProgress,
  invalidateDownstream,
  makeReport,
  markdownDraft,
  parseReport,
  reportMarkdown,
  runCheck,
  success,
  validateTutorial,
} from "./core/engine";
type Page = "library" | "player" | "editor" | "reports" | "analytics";
const icons = { Python: "Py", Git: "git", "Node.js": "JS", 自定义: "MD" };
function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
      {children}
    </ReactMarkdown>
  );
}
function download(name: string, value: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const date = (s: string) =>
  new Date(s).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className="icon-button"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export default function App() {
  const [state, setState] = useState<State>({
    tutorials: examples,
    sessions: [],
    reports: [],
  });
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState<Page>("library");
  const [sessionId, setSessionId] = useState("");
  const [draft, setDraft] = useState<Tutorial>();
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("全部教程");
  const [showHelp, setShowHelp] = useState(false);
  const [environment, setEnvironment] = useState(false);
  const [tab, setTab] = useState("content");
  const [logs, setLogs] = useState(false);
  const [reportId, setReportId] = useState("");
  const [filterVersion, setFilterVersion] = useState("");
  const [filterOs, setFilterOs] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const importMode = useRef<"tutorial" | "markdown" | "report">("tutorial");
  const saveQueue = useRef(Promise.resolve());
  useEffect(() => {
    loadState()
      .then((s) => {
        if (s) setState(s);
        setReady(true);
      })
      .catch(() => {
        setToast("无法读取浏览器存储，当前修改可能无法保存。");
        setReady(true);
      });
  }, []);
  useEffect(() => {
    if (ready)
      saveQueue.current = saveQueue.current
        .then(() => saveState(state))
        .catch(() => {
          setToast("保存失败，请及时导出教程和报告，并检查浏览器存储空间。");
        });
  }, [state, ready]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 6000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const session = state.sessions.find((s) => s.id === sessionId);
  const tutorial = session?.tutorialSnapshot;
  const step = tutorial?.steps.find((s) => s.id === session?.currentStepId);
  const progress = step && session?.progress[step.id];
  const notify = (s: string) => setToast(s);
  function updateSession(fn: (s: Session) => void) {
    setState((old) => {
      const next = structuredClone(old);
      const s = next.sessions.find((x) => x.id === sessionId);
      if (s) {
        fn(s);
        s.updatedAt = new Date().toISOString();
      }
      return next;
    });
  }
  function start(t: Tutorial, fresh = false) {
    const validation = validateTutorial(t);
    if (validation.errors.length) {
      notify(validation.errors.join("；"));
      return;
    }
    let s = !fresh
      ? state.sessions.find((s) => s.tutorialId === t.id && !s.finishedAt)
      : undefined;
    if (!s) {
      s = createSession(t);
      setState((old) => ({ ...old, sessions: [s!, ...old.sessions] }));
      setEnvironment(true);
    }
    setSessionId(s.id);
    setPage("player");
    setTab("content");
  }
  function importFile(mode: typeof importMode.current) {
    importMode.current = mode;
    fileRef.current!.accept =
      mode === "markdown"
        ? ".md,.markdown,text/markdown"
        : ".json,application/json";
    fileRef.current!.value = "";
    fileRef.current!.click();
  }
  async function readFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024)
        throw Error("文件超过 2 MB，请缩减后重新导入");
      const content = await file.text();
      if (importMode.current === "markdown") {
        setDraft(markdownDraft(content));
        setPage("editor");
        notify("已生成步骤草稿，请确认检查规则。");
        return;
      }
      const value = JSON.parse(content);
      if (importMode.current === "report") {
        const report = parseReport(value);
        setState((old) => ({
          ...old,
          reports: [
            ...old.reports.filter((r) => r.session.id !== report.session.id),
            report,
          ],
        }));
        setPage("analytics");
        notify("报告已导入；相同会话 ID 自动去重。");
      } else {
        const result = validateTutorial(value);
        if (!result.tutorial) throw Error(result.errors.join("\n"));
        setState((old) => ({
          ...old,
          tutorials: [
            ...old.tutorials.filter((t) => t.id !== result.tutorial!.id),
            result.tutorial!,
          ],
        }));
        notify("教程已导入。已有会话继续使用原快照。");
        setPage("library");
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : "无法读取文件");
    }
  }
  function openStep(id: string) {
    updateSession((s) => {
      s.currentStepId = id;
      addEvent(s, "step-opened", { stepId: id });
    });
    setTab("content");
  }
  function changeInput(checkId: string, value: string) {
    if (!step) return;
    updateSession((s) => {
      const p = (s.progress[step.id] ??= emptyProgress());
      if (p.inputs[checkId] === value) return;
      p.inputs[checkId] = value;
      if (p.results[checkId]) {
        delete p.results[checkId];
        invalidateDownstream(s, step.id);
        addEvent(s, "input-changed", { stepId: step.id, checkId });
      }
      p.skipped = false;
    });
  }
  function submit(c: Check, confirmed = false) {
    if (!step || !session || !available(tutorial!, session.progress, step))
      return;
    updateSession((s) => {
      const p = (s.progress[step.id] ??= emptyProgress());
      const r = runCheck(c, p.inputs[c.id] || "", confirmed);
      p.results[c.id] = r;
      p.stale = false;
      p.skipped = false;
      delete s.finishedAt;
      addEvent(
        s,
        c.type === "manual" ? "manual-confirmed" : "check-submitted",
        c.type === "manual"
          ? { stepId: step.id, checkId: c.id, result: r }
          : {
              stepId: step.id,
              checkId: c.id,
              input: p.inputs[c.id] || "",
              result: r,
            },
      );
      if (!success(r)) invalidateDownstream(s, step.id);
    });
  }
  function triage() {
    if (!step?.troubleshootingFlowId) return;
    updateSession((s) => {
      const f = tutorial!.troubleshootingFlows.find(
        (f) => f.id === step.troubleshootingFlowId,
      )!;
      s.triage = { stepId: step.id, flowId: f.id, nodeId: f.entryNodeId };
      addEvent(s, "triage-started", { stepId: step.id, flowId: f.id });
    });
  }
  const done = session
    ? tutorial!.steps.filter((s) => completed(s, session.progress[s.id])).length
    : 0;
  const latest = state.sessions.find((s) => !s.finishedAt);
  const totalComplete = state.sessions.filter(
    (s) =>
      s.finishedAt &&
      s.tutorialSnapshot.steps
        .filter((x) => !x.optional)
        .every((x) => completed(x, s.progress[x.id])),
  ).length;
  function openReport(id: string) {
    setReportId(id);
    setLogs(false);
    setPage("reports");
  }
  const reportSession =
    state.sessions.find((s) => s.id === reportId) ||
    session ||
    state.sessions[0];
  const chosenReports = state.reports.filter(
    (r) =>
      (!filterVersion ||
        `${r.session.tutorialId}@${r.session.tutorialVersion}` ===
          filterVersion) &&
      (!filterOs || (r.session.environment.os || "未填写") === filterOs),
  );
  const stats = analytics(chosenReports);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setPage("library")}>
          <span className="brand-icon">
            <GitBranch size={22} />
          </span>
          <span>
            StepTriage<small>教程排错实验室</small>
          </span>
        </button>
        <div className="workspace-label">
          个人工作空间 <span>LOCAL</span>
        </div>
        <nav>
          {(
            [
              { id: "library", name: "教程库", icon: BookOpen },
              { id: "player", name: "学习工作台", icon: Terminal },
              { id: "reports", name: "复现报告", icon: ClipboardList },
              { id: "analytics", name: "作者分析", icon: BarChart3 },
            ] as const
          ).map((n) => (
            <button
              key={n.id}
              aria-label={n.name}
              className={page === n.id ? "active" : ""}
              onClick={() => {
                if (n.id === "player" && !session) {
                  if (latest) {
                    setSessionId(latest.id);
                    setPage("player");
                  } else notify("请先从教程库选择一篇教程。");
                } else setPage(n.id);
              }}
            >
              <n.icon size={18} />
              {n.name}
              {n.id === "library" && (
                <span className="nav-count">{state.tutorials.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="tiny-heading">每一步，都有依据</span>
          <div className="mini-flow">
            <span />
            <i />
            <span />
            <i />
            <span />
          </div>
          <p>
            阅读 → 验证 → 排错
            <br />
            把“运行不了”变成下一步。
          </p>
          <button onClick={() => setShowHelp(true)}>
            了解工作流程 <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <span className="local-dot" />
          <div>
            数据保存在此浏览器<small>无需账号 · 无需 API Key</small>
          </div>
          <ShieldCheck size={17} />
        </div>
      </aside>
      <main className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            工作空间 <ChevronRight size={14} />
            <strong>
              {
                {
                  library: "教程库",
                  player: "学习工作台",
                  editor: "教程编辑器",
                  reports: "复现报告",
                  analytics: "作者分析",
                }[page]
              }
            </strong>
          </div>
          <div className="top-actions">
            <span className="local-chip">
              <span />
              本地模式
            </span>
            <IconButton label="使用指南" onClick={() => setShowHelp(true)}>
              <HelpCircle size={19} />
            </IconButton>
            <span className="avatar">ST</span>
          </div>
        </header>
        {!ready ? (
          <div className="empty">正在读取本地工作空间…</div>
        ) : page === "library" ? (
          <div className="page library-page">
            <div className="page-heading">
              <div>
                <div className="eyebrow">LEARN. VERIFY. MOVE FORWARD.</div>
                <h1>
                  每一步，都走得明白<span>。</span>
                </h1>
                <p>让教程中的每一步都有检查依据，让失败之后有路可走。</p>
              </div>
              <button
                className="primary"
                onClick={() => {
                  setDraft(
                    markdownDraft(
                      "# 未命名教程\n\n## 第一个步骤\n\n在这里编写操作说明。",
                    ),
                  );
                  setPage("editor");
                }}
              >
                <Plus size={17} />
                新建教程
              </button>
            </div>
            <div className="overview">
              <div>
                <span className="stat-icon blue">
                  <BookOpen size={19} />
                </span>
                <p>
                  我的教程
                  <strong>
                    {String(state.tutorials.length).padStart(2, "0")}
                    <small>篇</small>
                  </strong>
                </p>
              </div>
              <div>
                <span className="stat-icon orange">
                  <Terminal size={19} />
                </span>
                <p>
                  正在学习
                  <strong>
                    {String(
                      state.sessions.filter((s) => !s.finishedAt).length,
                    ).padStart(2, "0")}
                    <small>个流程</small>
                  </strong>
                </p>
              </div>
              <div>
                <span className="stat-icon green">
                  <CheckCircle2 size={19} />
                </span>
                <p>
                  已完成学习
                  <strong>
                    {String(totalComplete).padStart(2, "0")}
                    <small>次</small>
                  </strong>
                </p>
              </div>
              <div>
                <span className="stat-icon violet">
                  <FileText size={19} />
                </span>
                <p>
                  本地复现记录
                  <strong>
                    {String(state.sessions.length).padStart(2, "0")}
                    <small>份</small>
                  </strong>
                </p>
              </div>
            </div>
            <section className="featured">
              <div className="featured-copy">
                <div className="tag">
                  <span /> {latest ? "继续你的实验" : "从这里开始 · 推荐教程"}
                </div>
                <h2>
                  {latest?.tutorialSnapshot.title ||
                    "把第一个服务，真正跑起来。"}
                </h2>
                <p>
                  {latest
                    ? "你的步骤、检查输入和排错位置都已保存。随时回来，接着上一步。"
                    : "跟随 Python Web 服务教程，体验从环境检查到故障排查的完整学习流程。"}
                </p>
                <div className="featured-meta">
                  <span>
                    <Terminal size={14} />4 个可验证步骤
                  </span>
                  <span>
                    <GitBranch size={14} />2 条排错路线
                  </span>
                  <span>约 15 分钟</span>
                </div>
                <button
                  className="primary"
                  onClick={() =>
                    latest
                      ? (setSessionId(latest.id), setPage("player"))
                      : start(state.tutorials[0])
                  }
                >
                  {latest ? "继续学习" : "开始第一场实验"}
                  <ArrowRight size={17} />
                </button>
              </div>
              <div className="terminal-card">
                <div className="terminal-top">
                  <span className="dots">● ● ●</span>
                  <span>hello-steptriage / terminal</span>
                  <Terminal size={13} />
                </div>
                <div className="terminal-body">
                  <p>
                    <span className="prompt">❯</span> python -m flask --app app
                    run
                  </p>
                  <p className="muted"> * Serving Flask app 'app'</p>
                  <p className="muted"> * Debug mode: off</p>
                  <p className="terminal-success">
                    {" "}
                    * Running on http://127.0.0.1:5000
                  </p>
                  <div className="terminal-verified">
                    <CheckCircle2 size={16} />
                    <span>
                      预期输出已匹配<small>提交文本检查 · 服务启动</small>
                    </span>
                    <span className="verified-tag">PASS</span>
                  </div>
                  <p className="terminal-caption">一次验证，让下一步更确定。</p>
                </div>
              </div>
            </section>
            <div className="section-heading">
              <div>
                <h2>
                  你的教程库 <span>{state.tutorials.length}</span>
                </h2>
                <p>选择一条路线，开始一次有迹可循的学习。</p>
              </div>
              <div className="button-row">
                <button
                  className="secondary"
                  onClick={() => importFile("markdown")}
                >
                  <FileText size={15} />
                  导入 Markdown
                </button>
                <button
                  className="secondary"
                  onClick={() => importFile("tutorial")}
                >
                  <Upload size={15} />
                  导入教程包
                </button>
              </div>
            </div>
            <div className="library-toolbar">
              <div className="tabs">
                {["全部教程", "Python", "Git", "Node.js", "自定义"].map((c) => (
                  <button
                    className={category === c ? "selected" : ""}
                    key={c}
                    onClick={() => setCategory(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <label className="search">
                <Search size={16} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索教程…"
                />
              </label>
            </div>
            <div className="tutorial-grid">
              {state.tutorials
                .filter(
                  (t) =>
                    (category === "全部教程" || t.category === category) &&
                    `${t.title}${t.description}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                )
                .map((t) => {
                  const s = state.sessions.find(
                    (s) => s.tutorialId === t.id && !s.finishedAt,
                  );
                  const count = s
                    ? s.tutorialSnapshot.steps.filter((x) =>
                        completed(x, s.progress[x.id]),
                      ).length
                    : 0;
                  return (
                    <article className="tutorial-card" key={t.id}>
                      <div className="card-top">
                        <span
                          className={`language-icon ${t.category === "Python" ? "python" : t.category === "Git" ? "git" : "node"}`}
                        >
                          {icons[t.category as keyof typeof icons] || "MD"}
                        </span>
                        <span className="pill">
                          {examples.some((e) => e.id === t.id)
                            ? "内置教程"
                            : "我的教程"}
                        </span>
                        <IconButton
                          label="编辑教程"
                          onClick={() => {
                            setDraft(structuredClone(t));
                            setPage("editor");
                          }}
                        >
                          <Settings2 size={16} />
                        </IconButton>
                      </div>
                      <div className="card-label">
                        {t.category} <span>· v{t.version}</span>
                      </div>
                      <h3>{t.title}</h3>
                      <p>{t.description}</p>
                      <div className="card-meta">
                        <span>
                          <LayoutGrid size={13} />
                          {t.steps.length} 个步骤
                        </span>
                        <span>{t.duration}</span>
                      </div>
                      {s && (
                        <div className="card-progress">
                          <i
                            style={{
                              width: `${(count / s.tutorialSnapshot.steps.length) * 100}%`,
                            }}
                          />
                        </div>
                      )}
                      <div className="card-bottom">
                        <span className={s ? "progress-label" : ""}>
                          {s
                            ? `已完成 ${count}/${s.tutorialSnapshot.steps.length} 步`
                            : "尚未开始"}
                        </span>
                        <button onClick={() => start(t)}>
                          {s ? "继续学习" : "开始学习"}
                          <ArrowRight size={15} />
                        </button>
                      </div>
                    </article>
                  );
                })}
            </div>
            {!state.tutorials.some(
              (t) =>
                (category === "全部教程" || t.category === category) &&
                `${t.title}${t.description}`.includes(search),
            ) && (
              <div className="empty">
                未找到教程，试试其他关键词或导入教程包。
              </div>
            )}
            <div className="library-footer">
              <ShieldCheck size={15} />
              <span>
                你的操作在本机完成。StepTriage 仅检查提交的文本与人工确认结果。
              </span>
              <button onClick={() => setShowHelp(true)}>
                检查范围说明 <ArrowUpRight size={13} />
              </button>
            </div>
          </div>
        ) : page === "player" && session && tutorial && step ? (
          <>
            <div className="player-heading">
              <button
                className="text-button"
                onClick={() => setPage("library")}
              >
                <ChevronLeft size={16} />
                教程库
              </button>
              <div>
                <h2>{tutorial.title}</h2>
                <span>
                  v{session.tutorialVersion} · {done}/{tutorial.steps.length}{" "}
                  步已满足
                </span>
              </div>
              <button
                className="secondary"
                onClick={() => setEnvironment(true)}
              >
                <Settings2 size={15} />
                环境信息
              </button>
              <button
                className="secondary"
                onClick={() => openReport(session.id)}
              >
                <FileText size={15} />
                复现报告
              </button>
            </div>
            <div className="mobile-tabs tabs">
              {[
                ["steps", "步骤"],
                ["content", "正文"],
                ["checks", "验证与排错"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={tab === id ? "selected" : ""}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="player-grid">
              <aside
                className={`step-navigation mobile-${tab === "steps" ? "show" : "hide"}`}
              >
                <div className="tiny-heading">
                  学习路线{" "}
                  <span>
                    {done}/{tutorial.steps.length}
                  </span>
                </div>
                <div className="progress-track">
                  <i
                    style={{
                      width: `${(done / tutorial.steps.length) * 100}%`,
                    }}
                  />
                </div>
                {tutorial.steps.map((s, i) => {
                  const p = session.progress[s.id],
                    pass = completed(s, p),
                    locked = !available(tutorial, session.progress, s);
                  return (
                    <button
                      key={s.id}
                      className={`step-link ${step.id === s.id ? "current" : ""}`}
                      onClick={() => openStep(s.id)}
                    >
                      <span className={`step-number ${pass ? "done" : ""}`}>
                        {pass ? (
                          <CheckIcon size={15} />
                        ) : locked ? (
                          <Lock size={13} />
                        ) : (
                          String(i + 1).padStart(2, "0")
                        )}
                      </span>
                      <span>
                        {s.title}
                        <small>
                          {p?.stale
                            ? "需要重新确认"
                            : p?.skipped
                              ? "已跳过"
                              : pass
                                ? "已满足"
                                : locked
                                  ? "依赖未满足"
                                  : Object.values(p?.results || {}).some(
                                        (r) => !success(r),
                                      )
                                    ? "检查未通过"
                                    : "等待验证"}
                        </small>
                      </span>
                    </button>
                  );
                })}
                <div className="evidence-count">
                  <ShieldCheck size={17} />
                  <span>
                    检查依据
                    <small>
                      文本通过{" "}
                      {
                        Object.values(session.progress)
                          .flatMap((p) => Object.values(p.results))
                          .filter((r) => r.status === "passed").length
                      }{" "}
                      · 人工确认{" "}
                      {
                        Object.values(session.progress)
                          .flatMap((p) => Object.values(p.results))
                          .filter((r) => r.status === "self-confirmed").length
                      }
                    </small>
                  </span>
                </div>
                <button
                  className="text-button"
                  onClick={() => start(tutorial, true)}
                >
                  <RotateCcw size={14} />
                  开始新的学习会话
                </button>
              </aside>
              <article
                className={`lesson mobile-${tab === "content" ? "show" : "hide"}`}
              >
                <div className="lesson-kicker">
                  STEP{" "}
                  {String(tutorial.steps.indexOf(step) + 1).padStart(2, "0")} /{" "}
                  {String(tutorial.steps.length).padStart(2, "0")}
                  <span>{step.optional ? "可选步骤" : "必需步骤"}</span>
                </div>
                <h1>{step.title}</h1>
                {!available(tutorial, session.progress, step) && (
                  <div className="notice">
                    <Lock size={16} />
                    可以预读此步骤；完成前置步骤后才可提交检查。
                  </div>
                )}
                {progress?.stale && (
                  <div className="notice">
                    上游输入已修改，请重新检查本步骤。
                  </div>
                )}
                <div className="markdown">
                  <Markdown>{step.body}</Markdown>
                </div>
                <div className="lesson-footer">
                  <button
                    className="secondary"
                    disabled={tutorial.steps.indexOf(step) === 0}
                    onClick={() =>
                      openStep(
                        tutorial.steps[tutorial.steps.indexOf(step) - 1].id,
                      )
                    }
                  >
                    <ChevronLeft size={15} />
                    上一步
                  </button>
                  {step.optional && (
                    <button
                      className="text-button"
                      disabled={!available(tutorial, session.progress, step)}
                      onClick={() =>
                        updateSession((s) => {
                          const p = (s.progress[step.id] ??= emptyProgress());
                          p.skipped = true;
                          invalidateDownstream(s, step.id);
                          addEvent(s, "step-skipped", { stepId: step.id });
                        })
                      }
                    >
                      跳过可选步骤
                    </button>
                  )}
                  {tutorial.steps.indexOf(step) < tutorial.steps.length - 1 ? (
                    <button
                      className="primary"
                      onClick={() =>
                        openStep(
                          tutorial.steps[tutorial.steps.indexOf(step) + 1].id,
                        )
                      }
                    >
                      查看下一步
                      <ArrowRight size={15} />
                    </button>
                  ) : (
                    <button
                      className="primary"
                      disabled={
                        !tutorial.steps
                          .filter((s) => !s.optional)
                          .every((x) => completed(x, session.progress[x.id]))
                      }
                      onClick={() => {
                        updateSession((s) => {
                          s.finishedAt = new Date().toISOString();
                          addEvent(s, "session-finished", { completed: true });
                        });
                        openReport(session.id);
                      }}
                    >
                      完成并查看报告
                      <CheckIcon size={15} />
                    </button>
                  )}
                </div>
              </article>
              <aside
                className={`checks-panel mobile-${tab === "checks" ? "show" : "hide"}`}
              >
                <div className="panel-heading">
                  <ShieldCheck size={18} />
                  <h3>验证与排错</h3>
                  <span>CHECKPOINT</span>
                </div>
                <p className="panel-description">
                  提交你的操作结果，让下一步有据可依。
                </p>
                {step.checks.map((c) => {
                  const r = progress?.results[c.id];
                  return (
                    <div className="check-block" key={c.id}>
                      <div className="check-label">
                        {c.label}
                        <span>{c.required ? "必需" : "可选"}</span>
                      </div>
                      <div className="expected">
                        <small>预期结果</small>
                        {c.type === "text-includes" ? (
                          <code>{c.expected}</code>
                        ) : c.type === "version-range" ? (
                          <code>
                            {c.prefix} {c.range}
                          </code>
                        ) : (
                          <p>{c.instructions}</p>
                        )}
                      </div>
                      {c.type !== "manual" && (
                        <>
                          <label className="input-label" htmlFor={c.id}>
                            粘贴终端输出
                          </label>
                          <textarea
                            id={c.id}
                            className="output-input"
                            placeholder={
                              c.type === "version-range"
                                ? `例如 ${c.prefix} 3.12.4`
                                : "把相关输出粘贴到这里…"
                            }
                            maxLength={50000}
                            value={progress?.inputs[c.id] || ""}
                            onChange={(e) => changeInput(c.id, e.target.value)}
                          />
                        </>
                      )}
                      <button
                        className="primary full"
                        disabled={
                          !available(tutorial, session.progress, step) ||
                          !!session.finishedAt
                        }
                        onClick={() => submit(c, c.type === "manual")}
                      >
                        {c.type === "manual" ? "我已观察并确认" : "检查结果"}
                        <ArrowRight size={15} />
                      </button>
                      {r && (
                        <div
                          className={`result ${success(r) ? "pass" : "fail"}`}
                        >
                          {success(r) ? (
                            <CheckCircle2 size={17} />
                          ) : (
                            <AlertCircle size={17} />
                          )}
                          <div>
                            <strong>
                              {r.status === "self-confirmed"
                                ? "用户自行确认"
                                : r.status === "passed"
                                  ? "文本检查通过"
                                  : r.status === "invalid-input"
                                    ? "无法检查"
                                    : "检查未通过"}
                            </strong>
                            <p>{r.reason}</p>
                            <small>{date(r.checkedAt)}</small>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <button
                  className="triage-trigger"
                  disabled={!step.troubleshootingFlowId}
                  onClick={triage}
                >
                  <GitBranch size={17} />
                  <span>
                    {step.troubleshootingFlowId
                      ? "结果不符合预期？开始排错"
                      : "本步骤未配置排错路线"}
                  </span>
                  <ChevronRight size={15} />
                </button>
                {session.triage?.stepId === step.id &&
                  (() => {
                    const flow = tutorial.troubleshootingFlows.find(
                      (f) => f.id === session.triage!.flowId,
                    )!;
                    const n = flow.nodes.find(
                      (n) => n.id === session.triage!.nodeId,
                    )!;
                    return (
                      <div className="triage-box">
                        <div className="tiny-heading">
                          排错路线 <GitBranch size={14} />
                        </div>
                        <h4>
                          {n.type === "question"
                            ? n.question
                            : n.type === "fix"
                              ? n.title
                              : n.outcome === "retry-check"
                                ? "回到检查点，验证修复结果"
                                : "暂时还没有解决"}
                        </h4>
                        {n.type === "question" ? (
                          n.options.map((o) => (
                            <button
                              className="triage-option"
                              key={o.id}
                              onClick={() =>
                                updateSession((s) => {
                                  addEvent(s, "triage-option-selected", {
                                    stepId: step.id,
                                    nodeId: n.id,
                                    optionId: o.id,
                                    label: o.label,
                                  });
                                  s.triage!.nodeId = o.nextNodeId;
                                })
                              }
                            >
                              {o.label}
                              <ChevronRight size={14} />
                            </button>
                          ))
                        ) : n.type === "fix" ? (
                          <>
                            <div className="markdown">
                              <Markdown>{n.instructions}</Markdown>
                            </div>
                            <button
                              className="secondary full"
                              onClick={() =>
                                updateSession((s) => {
                                  addEvent(s, "fix-attempted", {
                                    stepId: step.id,
                                    nodeId: n.id,
                                    title: n.title,
                                  });
                                  s.triage!.nodeId = n.nextNodeId;
                                })
                              }
                            >
                              已尝试，继续
                              <ArrowRight size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            <p>
                              {n.outcome === "retry-check"
                                ? "建议已记录。请重新提交输出检查，修复建议本身不证明根因。"
                                : "可以在复现报告中补充现象，供教程作者分析。"}
                            </p>
                            <button
                              className="secondary full"
                              onClick={() =>
                                updateSession((s) => {
                                  addEvent(s, "triage-ended", {
                                    stepId: step.id,
                                    outcome: n.outcome,
                                  });
                                  delete s.triage;
                                })
                              }
                            >
                              {n.outcome === "retry-check"
                                ? "返回检查点"
                                : "记录为未解决"}
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })()}
                <div className="scope-note">
                  <ShieldCheck size={14} />
                  <p>
                    检查仅针对提交文本。浏览器不会读取本机文件或自动执行命令。
                  </p>
                </div>
              </aside>
            </div>
          </>
        ) : page === "editor" && draft ? (
          <Editor
            draft={draft}
            setDraft={setDraft}
            onImport={() => importFile("markdown")}
            onSave={() => {
              const v = validateTutorial(draft);
              if (!v.tutorial) {
                notify(v.errors.join("；"));
                return;
              }
              setState((s) => ({
                ...s,
                tutorials: [
                  ...s.tutorials.filter((t) => t.id !== draft.id),
                  v.tutorial!,
                ],
              }));
              notify("教程已保存，已有学习会话保持原快照。");
            }}
            onExport={() => {
              const v = validateTutorial(draft);
              if (!v.tutorial) {
                notify(v.errors.join("；"));
                return;
              }
              download(
                `${draft.id}.steptriage.json`,
                JSON.stringify(v.tutorial, null, 2),
              );
            }}
            onPreview={() => {
              const v = validateTutorial(draft);
              if (!v.tutorial) {
                notify(v.errors.join("；"));
                return;
              }
              start(v.tutorial, true);
            }}
          />
        ) : page === "reports" ? (
          <div className="page">
            <div className="page-heading">
              <div>
                <div className="eyebrow">REPRODUCTION RECORD</div>
                <h1>把经历，变成线索。</h1>
                <p>失败、尝试和结果，都留在同一份记录里。</p>
              </div>
              <button
                className="secondary"
                onClick={() => importFile("report")}
              >
                <Upload size={15} />
                导入报告
              </button>
            </div>
            {!reportSession ? (
              <div className="empty">
                <ClipboardList size={36} />
                <h3>还没有学习记录</h3>
                <p>开始一篇教程后，这里会生成你的复现报告。</p>
                <button className="primary" onClick={() => setPage("library")}>
                  前往教程库
                  <ArrowRight size={15} />
                </button>
              </div>
            ) : (
              <>
                <div className="report-toolbar">
                  <select
                    aria-label="选择学习会话"
                    value={reportSession.id}
                    onChange={(e) => setReportId(e.target.value)}
                  >
                    {state.sessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.tutorialSnapshot.title} · {date(s.startedAt)}
                      </option>
                    ))}
                  </select>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={logs}
                      onChange={(e) => setLogs(e.target.checked)}
                    />
                    包含原始日志
                  </label>
                  <button
                    className="secondary"
                    onClick={() =>
                      download(
                        `${reportSession.id}.md`,
                        reportMarkdown(makeReport(reportSession, logs)),
                        "text/markdown",
                      )
                    }
                  >
                    <Download size={15} />
                    Markdown
                  </button>
                  <button
                    className="primary"
                    onClick={() =>
                      download(
                        `${reportSession.id}.report.json`,
                        JSON.stringify(
                          makeReport(reportSession, logs),
                          null,
                          2,
                        ),
                      )
                    }
                  >
                    <Download size={15} />
                    导出 JSON
                  </button>
                </div>
                {logs && (
                  <div className="notice">
                    原始日志可能含路径、账号或令牌，请检查下方预览后再分享。
                  </div>
                )}
                <div className="report-grid">
                  <div className="report-preview markdown">
                    <Markdown>
                      {reportMarkdown(makeReport(reportSession, logs))}
                    </Markdown>
                  </div>
                  <div className="report-aside">
                    <h3>补充说明</h3>
                    <p>记录未解决的现象或你尝试过的其他方法。</p>
                    <textarea
                      value={reportSession.notes}
                      onChange={(e) =>
                        setState((old) => ({
                          ...old,
                          sessions: old.sessions.map((s) =>
                            s.id === reportSession.id
                              ? { ...s, notes: e.target.value }
                              : s,
                          ),
                        }))
                      }
                      placeholder="发生了什么？还有哪些线索？"
                    />
                    <button
                      className="secondary full"
                      onClick={() => {
                        const r = makeReport(reportSession, logs);
                        setState((s) => ({
                          ...s,
                          reports: [
                            ...s.reports.filter(
                              (x) => x.session.id !== r.session.id,
                            ),
                            r,
                          ],
                        }));
                        notify("报告已加入作者分析。");
                      }}
                    >
                      加入作者分析
                      <BarChart3 size={15} />
                    </button>
                    {!reportSession.finishedAt && (
                      <button
                        className="text-button"
                        onClick={() => {
                          setState((old) => ({
                            ...old,
                            sessions: old.sessions.map((s) => {
                              if (s.id !== reportSession.id) return s;
                              const next = structuredClone(s);
                              next.finishedAt = new Date().toISOString();
                              addEvent(next, "session-finished", {
                                completed: false,
                              });
                              return next;
                            }),
                          }));
                          notify("已结束会话，未满足的步骤仍按实际结果记录。");
                        }}
                      >
                        结束本次会话
                      </button>
                    )}
                    <div className="scope-note">
                      未结束的会话标记为“未完成”，不推断用户放弃。默认导出不含原始日志。
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : page === "analytics" ? (
          <div className="page">
            <div className="page-heading">
              <div>
                <div className="eyebrow">AUTHOR INSIGHTS</div>
                <h1>找到下一处改进。</h1>
                <p>从学习者的复现报告中，发现教程真正的卡点。</p>
              </div>
              <button className="primary" onClick={() => importFile("report")}>
                <Upload size={16} />
                导入复现报告
              </button>
            </div>
            <div className="analytics-filters">
              <label>
                教程与版本
                <select
                  value={filterVersion}
                  onChange={(e) => setFilterVersion(e.target.value)}
                >
                  <option value="">所有版本（分开统计）</option>
                  {[
                    ...new Set(
                      state.reports.map(
                        (r) =>
                          `${r.session.tutorialId}@${r.session.tutorialVersion}`,
                      ),
                    ),
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                操作系统
                <select
                  value={filterOs}
                  onChange={(e) => setFilterOs(e.target.value)}
                >
                  <option value="">所有环境</option>
                  {[
                    ...new Set(
                      state.reports.map(
                        (r) => r.session.environment.os || "未填写",
                      ),
                    ),
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <span>
                样本量 <strong>{chosenReports.length}</strong> 个独立会话
              </span>
            </div>
            {!chosenReports.length ? (
              <div className="empty">
                <BarChart3 size={36} />
                <h3>每份报告，都是改进的起点</h3>
                <p>导入 JSON 复现报告，或在复现报告页选择“加入作者分析”。</p>
              </div>
            ) : (
              <>
                <div className="analytics-card">
                  <h3>步骤失败比例</h3>
                  <p>
                    出现过失败的会话数 / 尝试该步骤的会话数 ·
                    不同教程版本分开统计
                  </p>
                  {stats.map((r, i) => (
                    <div className="bar-row" key={i}>
                      <span>
                        {r.title}
                        <small>{r.stepId}</small>
                      </span>
                      <div className="bar-track">
                        <i
                          style={{
                            width: `${r.sessions ? (r.failures / r.sessions) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <strong>
                        {r.sessions
                          ? Math.round((r.failures / r.sessions) * 100)
                          : 0}
                        %
                      </strong>
                      <small>n = {r.sessions}</small>
                    </div>
                  ))}
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>步骤</th>
                        <th>平均检查次数</th>
                        <th>排错后通过</th>
                        <th>明确未解决</th>
                        <th>样本量</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.map((r, i) => (
                        <tr key={i}>
                          <td>
                            {r.title}
                            <small>{r.stepId}</small>
                          </td>
                          <td>
                            {r.sessions
                              ? (r.attempts / r.sessions).toFixed(1)
                              : "—"}
                          </td>
                          <td>
                            {r.triages
                              ? `${Math.round((r.recovered / r.triages) * 100)}% (${r.recovered}/${r.triages})`
                              : "—"}
                          </td>
                          <td>{r.unresolved}</td>
                          <td>{r.sessions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="analytics-card">
                  <h3>环境分组</h3>
                  {[
                    ...new Set(
                      chosenReports.map(
                        (r) => r.session.environment.os || "未填写",
                      ),
                    ),
                  ].map((os) => (
                    <p key={os}>
                      {os}{" "}
                      <strong>
                        {
                          chosenReports.filter(
                            (r) =>
                              (r.session.environment.os || "未填写") === os,
                          ).length
                        }
                      </strong>{" "}
                      个会话
                    </p>
                  ))}
                </div>
                <p className="scope-note">
                  图表仅描述用户提交的报告。排错后通过表示时间上的先后关系，不证明修复建议与结果之间的因果关系。
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="empty">从教程库开始一次学习。</div>
        )}
      </main>
      <input
        type="file"
        ref={fileRef}
        hidden
        onChange={(e) => readFile(e.target.files?.[0])}
      />
      {toast && (
        <div className="toast" role="status">
          <AlertCircle size={18} />
          <span>{toast}</span>
          <IconButton label="关闭提示" onClick={() => setToast("")}>
            <X size={15} />
          </IconButton>
        </div>
      )}
      {showHelp && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
          >
            <IconButton label="关闭" onClick={() => setShowHelp(false)}>
              <X size={18} />
            </IconButton>
            <span className="brand-icon">
              <FlaskConical />
            </span>
            <h2 id="help-title">让失败之后，有路可走。</h2>
            <p>选择教程，在自己的终端或浏览器中操作，再回来提交结果。</p>
            <ol>
              <li>阅读步骤，按说明完成本机操作。</li>
              <li>提交文本，或按明确条件自行确认。</li>
              <li>遇到失败，选择症状并尝试排错建议。</li>
              <li>重新检查，导出报告，帮助作者改进教程。</li>
            </ol>
            <div className="notice">
              StepTriage
              无法读取本机文件，也不会执行教程命令。文本匹配只说明提交内容符合规则；人工观察始终标记为“用户自行确认”。数据保存在当前浏览器，清理站点数据会删除记录，请定期导出。
            </div>
            <button className="primary full" onClick={() => setShowHelp(false)}>
              明白了，开始探索
              <ArrowRight size={16} />
            </button>
          </section>
        </div>
      )}
      {environment && session && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="env-title"
          >
            <IconButton label="关闭" onClick={() => setEnvironment(false)}>
              <X size={18} />
            </IconButton>
            <h2 id="env-title">先记录你的实验环境</h2>
            <p>环境信息由你填写，将随复现报告一起保存。</p>
            {tutorial?.environmentFields.map((f) => (
              <label className="field" key={f.id}>
                {f.label}
                <input
                  value={session.environment[f.id] || ""}
                  placeholder={f.placeholder}
                  onChange={(e) =>
                    updateSession((s) => (s.environment[f.id] = e.target.value))
                  }
                />
              </label>
            ))}
            <button
              className="primary full"
              onClick={() => setEnvironment(false)}
            >
              保存环境，开始学习
              <ArrowRight size={16} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
function Editor({
  draft,
  setDraft,
  onSave,
  onExport,
  onImport,
  onPreview,
}: {
  draft: Tutorial;
  setDraft: (t: Tutorial) => void;
  onSave: () => void;
  onExport: () => void;
  onImport: () => void;
  onPreview: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [view, setView] = useState("body");
  const step = draft.steps[Math.min(index, draft.steps.length - 1)];
  const errors = validateTutorial(draft).errors;
  function mutate(fn: (t: Tutorial) => void) {
    const next = structuredClone(draft);
    fn(next);
    setDraft(next);
  }
  function changeStep(fn: (s: Tutorial["steps"][number]) => void) {
    mutate((t) => fn(t.steps.find((s) => s.id === step.id)!));
  }
  const flow = draft.troubleshootingFlows.find(
    (f) => f.id === step.troubleshootingFlowId,
  );
  function changeNode(id: string, fn: (n: TriageNode) => void) {
    mutate((t) =>
      fn(
        t.troubleshootingFlows
          .find((f) => f.id === flow!.id)!
          .nodes.find((n) => n.id === id)!,
      ),
    );
  }
  return (
    <div className="page editor-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">AUTHOR WORKSPACE</div>
          <h1>把经验，写成可验证的路线。</h1>
          <p>检查规则和排错建议均由作者确认后保存。</p>
        </div>
        <div className="button-row">
          <button className="secondary" onClick={onImport}>
            <Upload size={15} />
            导入 Markdown
          </button>
          <button className="secondary" onClick={onPreview}>
            试走教程
            <ArrowUpRight size={15} />
          </button>
          <button className="primary" onClick={onSave}>
            <Save size={15} />
            保存教程
          </button>
        </div>
      </div>
      <div className="editor-meta">
        <label className="field">
          教程标题
          <input
            value={draft.title}
            onChange={(e) => mutate((t) => (t.title = e.target.value))}
          />
        </label>
        <label className="field short">
          内容版本
          <input
            value={draft.version}
            onChange={(e) => mutate((t) => (t.version = e.target.value))}
          />
        </label>
        <label className="field">
          简介
          <input
            value={draft.description}
            onChange={(e) => mutate((t) => (t.description = e.target.value))}
          />
        </label>
        <button className="secondary" onClick={onExport}>
          <Download size={15} />
          导出教程包
        </button>
      </div>
      <details className="environment-editor">
        <summary>适用环境字段 · {draft.environmentFields.length} 项</summary>
        {draft.environmentFields.map((f, i) => (
          <div className="button-row" key={i}>
            <input
              aria-label="环境字段 ID"
              value={f.id}
              onChange={(e) =>
                mutate((t) => (t.environmentFields[i].id = e.target.value))
              }
            />
            <input
              aria-label="环境字段名称"
              value={f.label}
              onChange={(e) =>
                mutate((t) => (t.environmentFields[i].label = e.target.value))
              }
            />
            <IconButton
              label="删除环境字段"
              onClick={() => mutate((t) => t.environmentFields.splice(i, 1))}
            >
              <Trash2 size={15} />
            </IconButton>
          </div>
        ))}
        <button
          className="text-button"
          onClick={() =>
            mutate((t) =>
              t.environmentFields.push({ id: uid(), label: "软件版本" }),
            )
          }
        >
          <Plus size={14} />
          添加字段
        </button>
      </details>
      <div className="editor-grid">
        <aside className="editor-steps">
          <div className="tiny-heading">步骤结构</div>
          {draft.steps.map((s, i) => (
            <div
              className={`editor-step ${s.id === step.id ? "selected" : ""}`}
              key={s.id}
            >
              <button onClick={() => setIndex(i)}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                {s.title}
              </button>
              <div>
                <IconButton
                  label="向上移动"
                  onClick={() => {
                    if (i > 0) {
                      mutate((t) => {
                        [t.steps[i - 1], t.steps[i]] = [
                          t.steps[i],
                          t.steps[i - 1],
                        ];
                      });
                      setIndex(i - 1);
                    }
                  }}
                >
                  <ChevronLeft size={13} />
                </IconButton>
                <IconButton
                  label="向下移动"
                  onClick={() => {
                    if (i < draft.steps.length - 1) {
                      mutate((t) => {
                        [t.steps[i + 1], t.steps[i]] = [
                          t.steps[i],
                          t.steps[i + 1],
                        ];
                      });
                      setIndex(i + 1);
                    }
                  }}
                >
                  <ChevronRight size={13} />
                </IconButton>
                <IconButton
                  label="删除步骤"
                  onClick={() => {
                    if (draft.steps.length > 1) {
                      mutate((t) => t.steps.splice(i, 1));
                      setIndex(Math.max(0, i - 1));
                    }
                  }}
                >
                  <Trash2 size={13} />
                </IconButton>
              </div>
            </div>
          ))}
          <button
            className="secondary full"
            onClick={() => {
              mutate((t) =>
                t.steps.push({
                  id: uid(),
                  title: "新步骤",
                  body: "",
                  dependsOn: [],
                  optional: false,
                  allowSkipDependency: false,
                  checks: [
                    {
                      id: uid(),
                      type: "manual",
                      label: "观察结果",
                      instructions: "填写明确的完成条件",
                      required: true,
                    },
                  ],
                }),
              );
              setIndex(draft.steps.length);
            }}
          >
            <Plus size={15} />
            添加步骤
          </button>
          <div className="scope-note">
            步骤 ID 稳定保存，修改标题和排序不影响引用。删除步骤后请修复依赖。
          </div>
        </aside>
        <div className="editor-main">
          <div className="tabs">
            {[
              ["body", "正文与依赖"],
              ["checks", "检查点"],
              ["triage", "排错路线"],
              ["graph", "流程预览"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={view === id ? "selected" : ""}
                onClick={() => setView(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {view === "body" ? (
            <>
              <label className="field">
                步骤标题
                <input
                  value={step.title}
                  onChange={(e) =>
                    changeStep((s) => (s.title = e.target.value))
                  }
                />
              </label>
              <div className="dependency-fields">
                <label>
                  前置依赖
                  <select
                    multiple
                    value={step.dependsOn}
                    onChange={(e) =>
                      changeStep(
                        (s) =>
                          (s.dependsOn = Array.from(
                            e.target.selectedOptions,
                          ).map((o) => o.value)),
                      )
                    }
                  >
                    {draft.steps
                      .filter((s) => s.id !== step.id)
                      .map((s) => (
                        <option value={s.id} key={s.id}>
                          {s.title}
                        </option>
                      ))}
                  </select>
                  <small>按 Ctrl / Command 多选或取消</small>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={step.optional}
                    onChange={(e) =>
                      changeStep((s) => (s.optional = e.target.checked))
                    }
                  />
                  可选步骤
                </label>
                {step.optional && (
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={step.allowSkipDependency}
                      onChange={(e) =>
                        changeStep(
                          (s) => (s.allowSkipDependency = e.target.checked),
                        )
                      }
                    />
                    跳过后允许满足依赖
                  </label>
                )}
              </div>
              <div className="editor-split">
                <label className="field">
                  Markdown 正文
                  <textarea
                    className="markdown-source"
                    value={step.body}
                    onChange={(e) =>
                      changeStep((s) => (s.body = e.target.value))
                    }
                    placeholder="写下操作命令、预期现象与注意事项…"
                  />
                </label>
                <div>
                  <div className="input-label">实时预览</div>
                  <div className="markdown editor-preview">
                    <Markdown>{step.body || "预览将在这里显示。"}</Markdown>
                  </div>
                </div>
              </div>
            </>
          ) : view === "checks" ? (
            <>
              <p className="muted">
                至少配置一个必需检查点。人工确认请描述具体可观察的条件。
              </p>
              {step.checks.map((c, i) => (
                <div className="config-card" key={c.id}>
                  <div className="button-row">
                    <strong>检查点 {i + 1}</strong>
                    <select
                      aria-label="检查类型"
                      value={c.type}
                      onChange={(e) =>
                        changeStep((s) => {
                          const base = {
                            id: c.id,
                            label: c.label,
                            required: c.required,
                          };
                          s.checks[i] =
                            e.target.value === "manual"
                              ? {
                                  ...base,
                                  type: "manual",
                                  instructions: "填写观察条件",
                                }
                              : e.target.value === "text-includes"
                                ? {
                                    ...base,
                                    type: "text-includes",
                                    expected: "预期文本",
                                    caseSensitive: true,
                                  }
                                : {
                                    ...base,
                                    type: "version-range",
                                    prefix: "Python",
                                    range: ">=3.10.0 <4.0.0",
                                  };
                        })
                      }
                    >
                      <option value="text-includes">文本包含</option>
                      <option value="version-range">版本范围</option>
                      <option value="manual">人工确认</option>
                    </select>
                    <IconButton
                      label="删除检查点"
                      onClick={() => changeStep((s) => s.checks.splice(i, 1))}
                    >
                      <Trash2 size={15} />
                    </IconButton>
                  </div>
                  <label className="field">
                    名称
                    <input
                      value={c.label}
                      onChange={(e) =>
                        changeStep((s) => (s.checks[i].label = e.target.value))
                      }
                    />
                  </label>
                  {c.type === "manual" ? (
                    <label className="field">
                      观察条件
                      <textarea
                        value={c.instructions}
                        onChange={(e) =>
                          changeStep((s) => {
                            const x = s.checks[i];
                            if (x.type === "manual")
                              x.instructions = e.target.value;
                          })
                        }
                      />
                    </label>
                  ) : c.type === "text-includes" ? (
                    <>
                      <label className="field">
                        预期文本
                        <input
                          value={c.expected}
                          onChange={(e) =>
                            changeStep((s) => {
                              const x = s.checks[i];
                              if (x.type === "text-includes")
                                x.expected = e.target.value;
                            })
                          }
                        />
                      </label>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={c.caseSensitive}
                          onChange={(e) =>
                            changeStep((s) => {
                              const x = s.checks[i];
                              if (x.type === "text-includes")
                                x.caseSensitive = e.target.checked;
                            })
                          }
                        />
                        区分大小写
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="field">
                        软件前缀
                        <input
                          value={c.prefix}
                          onChange={(e) =>
                            changeStep((s) => {
                              const x = s.checks[i];
                              if (x.type === "version-range")
                                x.prefix = e.target.value;
                            })
                          }
                        />
                      </label>
                      <label className="field">
                        版本范围
                        <input
                          value={c.range}
                          onChange={(e) =>
                            changeStep((s) => {
                              const x = s.checks[i];
                              if (x.type === "version-range")
                                x.range = e.target.value;
                            })
                          }
                        />
                      </label>
                    </>
                  )}
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={c.required}
                      onChange={(e) =>
                        changeStep(
                          (s) => (s.checks[i].required = e.target.checked),
                        )
                      }
                    />
                    必需检查
                  </label>
                </div>
              ))}
              <button
                className="secondary"
                onClick={() =>
                  changeStep((s) =>
                    s.checks.push({
                      id: uid(),
                      type: "text-includes",
                      label: "新检查点",
                      expected: "预期文本",
                      required: true,
                      caseSensitive: true,
                    }),
                  )
                }
              >
                <Plus size={15} />
                添加检查点
              </button>
            </>
          ) : view === "triage" ? (
            <>
              {!flow ? (
                <div className="empty">
                  <GitBranch size={30} />
                  <p>为失败后的学习者配置一条排错路线。</p>
                  <button
                    className="primary"
                    onClick={() =>
                      mutate((t) => {
                        const id = uid();
                        t.steps.find(
                          (s) => s.id === step.id,
                        )!.troubleshootingFlowId = id;
                        t.troubleshootingFlows.push({
                          id,
                          entryNodeId: "question",
                          nodes: [
                            {
                              id: "question",
                              type: "question",
                              question: "你看到了什么现象？",
                              options: [
                                {
                                  id: uid(),
                                  label: "出现已知错误",
                                  nextNodeId: "fix",
                                },
                                {
                                  id: uid(),
                                  label: "以上都不符合",
                                  nextNodeId: "unresolved",
                                  isFallback: true,
                                },
                              ],
                            },
                            {
                              id: "fix",
                              type: "fix",
                              title: "修复建议",
                              instructions: "请填写具体操作和原因",
                              nextNodeId: "retry",
                            },
                            {
                              id: "retry",
                              type: "end",
                              outcome: "retry-check",
                              returnCheckId: step.checks[0]?.id,
                            },
                            {
                              id: "unresolved",
                              type: "end",
                              outcome: "unresolved",
                            },
                          ],
                        });
                      })
                    }
                  >
                    创建排错路线
                  </button>
                </div>
              ) : (
                <>
                  <label className="field">
                    入口节点
                    <select
                      value={flow.entryNodeId}
                      onChange={(e) =>
                        mutate(
                          (t) =>
                            (t.troubleshootingFlows.find(
                              (f) => f.id === flow.id,
                            )!.entryNodeId = e.target.value),
                        )
                      }
                    >
                      {flow.nodes.map((n) => (
                        <option key={n.id}>{n.id}</option>
                      ))}
                    </select>
                  </label>
                  {flow.nodes.map((n) => (
                    <div className="config-card" key={n.id}>
                      <div className="button-row">
                        <strong>
                          {n.type === "question"
                            ? "问题"
                            : n.type === "fix"
                              ? "修复建议"
                              : "结束"}{" "}
                          · {n.id}
                        </strong>
                        <IconButton
                          label="删除节点"
                          onClick={() =>
                            mutate((t) => {
                              const f = t.troubleshootingFlows.find(
                                (f) => f.id === flow.id,
                              )!;
                              f.nodes = f.nodes.filter((x) => x.id !== n.id);
                            })
                          }
                        >
                          <Trash2 size={14} />
                        </IconButton>
                      </div>
                      {n.type === "question" ? (
                        <>
                          <label className="field">
                            问题
                            <input
                              value={n.question}
                              onChange={(e) =>
                                changeNode(n.id, (x) => {
                                  if (x.type === "question")
                                    x.question = e.target.value;
                                })
                              }
                            />
                          </label>
                          {n.options.map((o, i) => (
                            <div className="option-config" key={o.id}>
                              <input
                                aria-label="选项文字"
                                value={o.label}
                                onChange={(e) =>
                                  changeNode(n.id, (x) => {
                                    if (x.type === "question")
                                      x.options[i].label = e.target.value;
                                  })
                                }
                              />
                              <select
                                aria-label="目标节点"
                                value={o.nextNodeId}
                                onChange={(e) =>
                                  changeNode(n.id, (x) => {
                                    if (x.type === "question")
                                      x.options[i].nextNodeId = e.target.value;
                                  })
                                }
                              >
                                {flow.nodes.map((x) => (
                                  <option key={x.id}>{x.id}</option>
                                ))}
                              </select>
                              <label className="checkbox-label">
                                <input
                                  type="checkbox"
                                  checked={!!o.isFallback}
                                  onChange={(e) =>
                                    changeNode(n.id, (x) => {
                                      if (x.type === "question")
                                        x.options[i].isFallback =
                                          e.target.checked;
                                    })
                                  }
                                />
                                兜底
                              </label>
                              <IconButton
                                label="删除选项"
                                onClick={() =>
                                  changeNode(n.id, (x) => {
                                    if (x.type === "question")
                                      x.options.splice(i, 1);
                                  })
                                }
                              >
                                <X size={14} />
                              </IconButton>
                            </div>
                          ))}
                          <button
                            className="text-button"
                            onClick={() =>
                              changeNode(n.id, (x) => {
                                if (x.type === "question")
                                  x.options.push({
                                    id: uid(),
                                    label: "新选项",
                                    nextNodeId: flow.nodes[0].id,
                                  });
                              })
                            }
                          >
                            <Plus size={14} />
                            添加选项
                          </button>
                        </>
                      ) : n.type === "fix" ? (
                        <>
                          <label className="field">
                            标题
                            <input
                              value={n.title}
                              onChange={(e) =>
                                changeNode(n.id, (x) => {
                                  if (x.type === "fix")
                                    x.title = e.target.value;
                                })
                              }
                            />
                          </label>
                          <label className="field">
                            操作说明
                            <textarea
                              value={n.instructions}
                              onChange={(e) =>
                                changeNode(n.id, (x) => {
                                  if (x.type === "fix")
                                    x.instructions = e.target.value;
                                })
                              }
                            />
                          </label>
                          <label className="field">
                            下一节点
                            <select
                              value={n.nextNodeId}
                              onChange={(e) =>
                                changeNode(n.id, (x) => {
                                  if (x.type === "fix")
                                    x.nextNodeId = e.target.value;
                                })
                              }
                            >
                              {flow.nodes.map((x) => (
                                <option key={x.id}>{x.id}</option>
                              ))}
                            </select>
                          </label>
                        </>
                      ) : (
                        <>
                          <label className="field">
                            结束方式
                            <select
                              value={n.outcome}
                              onChange={(e) =>
                                changeNode(n.id, (x) => {
                                  if (x.type === "end") {
                                    x.outcome = e.target.value as
                                      "retry-check" | "unresolved";
                                    if (x.outcome === "retry-check")
                                      x.returnCheckId = step.checks[0]?.id;
                                    else delete x.returnCheckId;
                                  }
                                })
                              }
                            >
                              <option value="retry-check">返回检查点</option>
                              <option value="unresolved">尚未解决</option>
                            </select>
                          </label>
                          {n.outcome === "retry-check" && (
                            <label className="field">
                              返回检查点
                              <select
                                value={n.returnCheckId}
                                onChange={(e) =>
                                  changeNode(n.id, (x) => {
                                    if (x.type === "end")
                                      x.returnCheckId = e.target.value;
                                  })
                                }
                              >
                                {step.checks.map((c) => (
                                  <option value={c.id} key={c.id}>
                                    {c.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                  <div className="button-row">
                    {(["question", "fix", "end"] as const).map((type) => (
                      <button
                        className="secondary"
                        key={type}
                        onClick={() =>
                          mutate((t) => {
                            const f = t.troubleshootingFlows.find(
                                (x) => x.id === flow.id,
                              )!,
                              id = uid().slice(0, 8);
                            f.nodes.push(
                              type === "question"
                                ? {
                                    id,
                                    type,
                                    question: "新的问题",
                                    options: [
                                      {
                                        id: uid(),
                                        label: "匹配症状",
                                        nextNodeId: f.entryNodeId,
                                      },
                                      {
                                        id: uid(),
                                        label: "以上都不符合",
                                        nextNodeId: f.entryNodeId,
                                        isFallback: true,
                                      },
                                    ],
                                  }
                                : type === "fix"
                                  ? {
                                      id,
                                      type,
                                      title: "修复建议",
                                      instructions: "填写操作说明",
                                      nextNodeId: f.entryNodeId,
                                    }
                                  : { id, type, outcome: "unresolved" },
                            );
                          })
                        }
                      >
                        <Plus size={14} />
                        {type === "question"
                          ? "问题"
                          : type === "fix"
                            ? "修复"
                            : "结束"}
                        节点
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <h3>步骤依赖图</h3>
              <div className="workflow-preview">
                {draft.steps.map((s) => (
                  <div className="flow-node" key={s.id}>
                    {s.dependsOn.length > 0 && (
                      <small>
                        {s.dependsOn
                          .map(
                            (id) =>
                              draft.steps.find((x) => x.id === id)?.title ||
                              `缺失：${id}`,
                          )
                          .join(" + ")}
                        <ArrowRight size={14} />
                      </small>
                    )}
                    <strong>{s.title}</strong>
                    <span>
                      {s.checks.length} 个检查点 ·{" "}
                      {s.optional ? "可选" : "必需"}
                    </span>
                  </div>
                ))}
              </div>
              <h3>当前步骤排错路线</h3>
              {flow ? (
                <div className="workflow-preview">
                  {flow.nodes.map((n) => (
                    <div className="flow-node" key={n.id}>
                      <small>{n.id}</small>
                      <strong>
                        {n.type === "question"
                          ? n.question
                          : n.type === "fix"
                            ? n.title
                            : n.outcome === "retry-check"
                              ? "返回检查点"
                              : "尚未解决"}
                      </strong>
                      <span>
                        {n.type === "question"
                          ? n.options
                              .map((o) => `${o.label} → ${o.nextNodeId}`)
                              .join(" / ")
                          : n.type === "fix"
                            ? `→ ${n.nextNodeId}`
                            : "终点"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p>未配置排错流程。</p>
              )}
            </>
          )}
          {errors.length > 0 ? (
            <div className="validation-errors">
              <strong>发布前需要修复 {errors.length} 项配置</strong>
              {errors.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          ) : (
            <div className="validation-ok">
              <CheckCircle2 size={16} />
              结构校验通过，请试走确认实际操作与检查规则。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
