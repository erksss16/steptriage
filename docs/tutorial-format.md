# 教程包格式

文件建议命名为 `name.steptriage.json`。根对象包含 `schemaVersion: "1"`、稳定 `id`、内容 `version`、标题、简介、环境字段、步骤和排错流程。内容版本采用 `x.y.z`。

以 `src/examples.ts` 和 `src/core/model.ts` 为规范及完整示例。步骤 ID、检查点 ID 应全局唯一，排错节点 ID 在各流程内唯一。标题、排序和内容版本的变化不能改变已有逻辑实体的 ID。

步骤通过 `dependsOn` 表示前置依赖。至少配置一个 `required: true` 的检查点。可选步骤被跳过时，只有 `allowSkipDependency: true` 才满足下游依赖。

检查类型：`text-includes`（预期文本、大小写规则）、`version-range`（软件前缀、semver 范围）、`manual`（具体观察条件）。文本仅去除首尾空白，不折叠内部空白。版本输入必须在指定前缀后有唯一的三段版本。

排错节点：`question`（选项和目标）、`fix`（说明和下一个节点）、`end`（重试或未解决）。每个问题至少一个 `isFallback` 兜底出口。图不能有环、缺失引用或不可达节点；重试终点的检查点必须属于当前步骤。

导入上限 2 MB。Markdown 不执行原始 HTML，不打包图片资源。JSON 报告的 `kind` 为 `steptriage-report`，包含固定教程快照与事件历史。
