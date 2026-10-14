import type { Tutorial, Check } from "./core/model";
const text = (id: string, label: string, expected: string): Check => ({
  id,
  type: "text-includes",
  label,
  expected,
  caseSensitive: true,
  required: true,
});
const manual = (id: string, instructions: string): Check => ({
  id,
  type: "manual",
  label: "确认观察结果",
  instructions,
  required: true,
});
function example(
  id: string,
  title: string,
  description: string,
  category: string,
  duration: string,
  content: { title: string; body: string; check: Check }[],
): Tutorial {
  const steps = content.map((s, i) => ({
    id: `${id}-${i}`,
    title: s.title,
    body: s.body,
    dependsOn: i ? [`${id}-${i - 1}`] : [],
    optional: false,
    allowSkipDependency: false,
    checks: [s.check],
    troubleshootingFlowId: i === 2 ? `${id}-triage` : undefined,
  }));
  return {
    schemaVersion: "1",
    id,
    version: "1.0.0",
    title,
    description,
    category,
    duration,
    environmentFields: [
      { id: "os", label: "操作系统", placeholder: "Windows / macOS / Linux" },
      { id: "software", label: "软件版本", placeholder: "例如 Python 3.12.4" },
    ],
    steps,
    troubleshootingFlows: [
      {
        id: `${id}-triage`,
        entryNodeId: "symptom",
        nodes: [
          {
            id: "symptom",
            type: "question",
            question: "你的输出更接近哪种情况？",
            options: [
              {
                id: "missing",
                label: "命令或模块不存在",
                nextNodeId: "install",
              },
              {
                id: "port",
                label: "端口占用 / 权限或环境错误",
                nextNodeId: "environment",
              },
              {
                id: "other",
                label: "以上都不符合",
                nextNodeId: "unresolved",
                isFallback: true,
              },
            ],
          },
          {
            id: "install",
            type: "fix",
            title: "检查当前软件与依赖环境",
            instructions:
              "确认命令使用的是本教程准备的软件环境。重新执行前面的环境检查和依赖安装，再尝试当前命令。\n\nPython 可用 `python -m pip --version` 检查 pip 所属环境；不要仅凭命令名称判断。",
            nextNodeId: "retry",
          },
          {
            id: "environment",
            type: "fix",
            title: "检查端口、路径与权限",
            instructions:
              "阅读错误中指定的端口或路径。先停止自己启动的重复进程，检查当前工作目录与文件权限，再执行原命令。\n\n不要结束不认识的系统进程。",
            nextNodeId: "retry",
          },
          {
            id: "retry",
            type: "end",
            outcome: "retry-check",
            returnCheckId: content[2].check.id,
          },
          { id: "unresolved", type: "end", outcome: "unresolved" },
        ],
      },
    ],
  };
}
export const examples: Tutorial[] = [
  example(
    "python-web",
    "启动你的第一个 Python Web 服务",
    "从检查环境到看到 Hello StepTriage，走通一次可验证的本地服务启动流程。",
    "Python",
    "约 15 分钟",
    [
      {
        title: "检查 Python 环境",
        body: "## 先确认，我们使用同一个环境\n\n在本机终端运行下面的命令，将完整输出粘贴到右侧检查面板。\n\n```bash\npython --version\n```\n\n需要 **Python 3.10 或更高的 3.x 版本**。macOS / Linux 上可能需要使用 `python3`。\n\n> 后续命令中的 python 应使用同一个解释器。",
        check: {
          id: "py-version",
          type: "version-range",
          label: "Python 版本",
          range: ">=3.10.0 <4.0.0",
          prefix: "Python",
          required: true,
        },
      },
      {
        title: "创建项目与虚拟环境",
        body: "## 给项目一个独立的空间\n\n```bash\nmkdir hello-steptriage\ncd hello-steptriage\npython -m venv .venv\n```\n\n激活虚拟环境：\n\n**Windows PowerShell**\n```powershell\n.venv\\Scripts\\Activate.ps1\n```\n\n**macOS / Linux**\n```bash\nsource .venv/bin/activate\n```\n\n然后安装 Flask：\n```bash\npython -m pip install flask\n```",
        check: manual(
          "py-env",
          "终端已激活 .venv，且 Flask 安装命令完成，没有错误。",
        ),
      },
      {
        title: "编写并启动服务",
        body: '## 让第一个请求有回应\n\n在项目目录创建 `app.py`，写入以下内容：\n\n```python\nfrom flask import Flask\n\napp = Flask(__name__)\n\n@app.get("/")\ndef hello():\n    return "Hello StepTriage"\n```\n\n启动本地服务：\n\n```bash\npython -m flask --app app run\n```\n\n保持终端打开。将启动输出粘贴到右侧，验证是否出现本地服务地址。\n\n> Flask 开发服务器只用于本地练习，不用于生产部署。',
        check: text(
          "py-server",
          "服务启动输出",
          "Running on http://127.0.0.1:5000",
        ),
      },
      {
        title: "访问并验证页面",
        body: "## 在浏览器中见到它\n\n打开 [http://127.0.0.1:5000](http://127.0.0.1:5000)。\n\n页面应显示：\n\n```text\nHello StepTriage\n```\n\n如果无法访问，请回到上一步确认终端仍在运行，然后检查地址和端口。\n\n完成后可以在终端按 `Ctrl+C` 停止服务。",
        check: manual(
          "py-page",
          "浏览器页面显示 Hello StepTriage，且没有出现错误页面。",
        ),
      },
    ],
  ),
  example(
    "git-first",
    "完成第一次 Git 提交",
    "初始化仓库、跟踪文件，理解并验证你的第一次版本记录。",
    "Git",
    "约 10 分钟",
    [
      {
        title: "检查 Git",
        body: "运行命令并提交输出：\n```bash\ngit --version\n```",
        check: {
          id: "git-version",
          type: "version-range",
          label: "Git 版本",
          prefix: "git version",
          range: ">=2.30.0 <3.0.0",
          required: true,
        },
      },
      {
        title: "创建练习仓库",
        body: "在新的练习目录执行：\n```bash\nmkdir git-lab\ncd git-lab\ngit init\n```\n创建 README.md，写入一行介绍。",
        check: manual(
          "git-init",
          "练习目录中已有 .git 目录和 README.md 文件。",
        ),
      },
      {
        title: "提交文件",
        body: '为当前仓库配置你的提交身份：\n```bash\ngit config user.name "Your Name"\ngit config user.email "you@example.com"\ngit add README.md\ngit commit -m "Initial commit"\ngit log -1 --format=%s\n```\n提交最后一条命令的输出。',
        check: text("git-commit", "提交信息", "Initial commit"),
      },
      {
        title: "确认工作区",
        body: "执行：\n```bash\ngit status\n```\n确认工作区干净，没有未提交的变更。",
        check: text("git-clean", "工作区状态", "nothing to commit"),
      },
    ],
  ),
  example(
    "node-package",
    "安装并使用一个 Node 包",
    "建立小型 Node 项目，验证依赖安装和模块调用。",
    "Node.js",
    "约 12 分钟",
    [
      {
        title: "确认 Node.js",
        body: "运行：\n```bash\nnode --version\n```\n检查时请在输出前补充 Node，例如 `Node v22.14.0`。",
        check: {
          id: "node-version",
          type: "version-range",
          prefix: "Node",
          label: "Node.js 版本",
          range: ">=20.0.0 <25.0.0",
          required: true,
        },
      },
      {
        title: "初始化项目",
        body: "```bash\nmkdir node-lab\ncd node-lab\nnpm init -y\n```",
        check: manual("node-init", "项目目录中存在 package.json 文件。"),
      },
      {
        title: "安装依赖",
        body: "```bash\nnpm install picocolors\nnpm ls picocolors\n```\n提交最后一条命令的输出。",
        check: text("node-install", "依赖列表", "picocolors@"),
      },
      {
        title: "调用模块",
        body: "```bash\nnode -e \"console.log(require('picocolors').green('Hello StepTriage'))\"\n```",
        check: text("node-call", "模块输出", "Hello StepTriage"),
      },
    ],
  ),
];
