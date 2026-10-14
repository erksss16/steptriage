# StepTriage 

让教程中的每一步都有检查依据，让失败之后有路可走。
支持 Markdown 教程、结果检查、故障分支和复现报告。

纯前端应用，无需账号或 API Key。教程、学习会话与报告保存在当前浏览器的 IndexedDB。

## 本地开发

需要 Node.js 22.12+（22.x）、24.x 或 26+。

```bash
npm install
npm run dev
```

打开终端显示的本地地址。

Windows 可直接运行 `start.cmd`。当前机器的全局 npm 入口异常时，可使用 `node D:\node\node_modules\npm\bin\npm-cli.js` 代替 `npm`；启动脚本不经过 npm。

```bash
npm test
npm run test:e2e
npm run build
npm run preview
```

`dist/` 可以部署到静态托管服务，构建使用相对资源路径。无需服务端、数据库服务器或环境变量。

浏览器端到端测试默认使用已安装的 Microsoft Edge；可在 `playwright.config.ts` 中修改浏览器通道。

## 流程

1. 在教程库开始 Python Web 服务教程，填写环境。
2. 提交 `Python 3.12.4`，完成人工环境确认。
3. 在启动服务步骤提交错误输出，查看失败原因。
4. 选择排错路线，尝试建议，返回原检查点。
5. 提交 `Running on http://127.0.0.1:5000`。
6. 刷新页面，从教程库继续学习，检查输入和排错位置仍保留。
7. 确认页面结果，导出 JSON 或 Markdown 报告。
8. 将 JSON 报告导入作者分析，查看失败比例和排错后通过情况。

另内置 Git 首次提交与 Node 包安装教程。作者可导入 Markdown，按真正的二级标题生成步骤，通过表单修改依赖、三类检查和排错节点。保存前检查缺失引用、循环、不可达节点与兜底出口。

## 代码结构

- `src/core/model.ts`：教程 Schema、会话、检查结果及事件类型。
- `src/core/engine.ts`：独立检查、工作流、Markdown、报告和统计逻辑。
- `src/storage.ts`：IndexedDB 存储与串行保存。
- `src/App.tsx`：教程库、工作台、作者表单、复现报告和分析界面。
- `src/examples.ts`：三篇内置教程。
- `tests/core.test.ts`：核心规则测试。

详细说明见 [教程格式](docs/tutorial-format.md)、[作者指南](docs/authoring-guide.md)、[架构](docs/architecture.md) 和 [限制](docs/limitations.md)。

## 检查边界

StepTriage 不读取本机文件，不自动执行教程命令。文本匹配只说明用户提交的文本符合规则；人工观察记录为 `self-confirmed`。修复后通过不证明根因。报告默认去除原始日志，分享前仍应阅读预览及补充说明。

浏览器数据不自动同步，清理站点数据会删除工作空间，请导出备份。作者统计只描述导入报告并按会话 ID 去重，不代表全部用户。

MIT License。欢迎通过 Issue 描述复现步骤，贡献指南见 [CONTRIBUTING.md](CONTRIBUTING.md)。
