import { test, expect } from "@playwright/test";
test("失败 → 排错 → 成功 → 刷新恢复 → 报告导入", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "每一步，都走得明白。" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/library-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "开始第一场实验" }).click();
  await page.getByRole("button", { name: "保存环境，开始学习" }).click();
  await page.getByLabel("粘贴终端输出").fill("Python 3.12.4");
  await page.getByRole("button", { name: "检查结果", exact: true }).click();
  await expect(page.getByText("文本检查通过")).toBeVisible();
  await page.getByRole("button", { name: "查看下一步" }).click();
  await page.getByRole("button", { name: "我已观察并确认" }).click();
  await page.getByRole("button", { name: "查看下一步" }).click();
  await page.getByLabel("粘贴终端输出").fill("Error: Address already in use");
  await page.getByRole("button", { name: "检查结果", exact: true }).click();
  await expect(
    page.getByText("未发现预期文本", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "结果不符合预期？开始排错" }).click();
  await page.getByRole("button", { name: "端口占用 / 权限或环境错误" }).click();
  await page.reload();
  await page.getByRole("button", { name: "继续学习" }).first().click();
  await expect(
    page.getByRole("heading", { name: "检查端口、路径与权限" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "已尝试，继续" }).click();
  await page.getByRole("button", { name: "返回检查点", exact: true }).click();
  await page
    .getByLabel("粘贴终端输出")
    .fill("Running on http://127.0.0.1:5000");
  await page.getByRole("button", { name: "检查结果", exact: true }).click();
  await expect(page.getByText("文本检查通过")).toBeVisible();
  await page.screenshot({
    path: "test-results/player-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "查看下一步" }).click();
  await page.getByRole("button", { name: "我已观察并确认" }).click();
  await page.getByRole("button", { name: "完成并查看报告" }).click();
  await expect(page.getByText("历史失败", { exact: false })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 JSON" }).click();
  const download = await downloadPromise;
  const file = await download.path();
  expect(file).toBeTruthy();
  await page.getByRole("button", { name: "导入报告", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles(file!);
  await expect(
    page.getByRole("heading", { name: "步骤失败比例" }),
  ).toBeVisible();
  await expect(page.getByText("100%").first()).toBeVisible();
});
test("编辑器保存、导出、导入和移动端", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "新建教程", exact: true }).click();
  await page.getByLabel("教程标题", { exact: true }).fill("自定义练习");
  await page.getByLabel("简介", { exact: true }).fill("用于验证编辑器");
  await page
    .getByLabel("Markdown 正文")
    .fill("## 操作\n\n执行练习，然后确认。");
  await page.getByRole("button", { name: "检查点", exact: true }).click();
  await page.getByLabel("观察条件").fill("看到练习完成文字");
  await page.getByRole("button", { name: "保存教程", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出教程包" }).click();
  const file = await (await downloadPromise).path();
  await page
    .getByRole("button", { name: "教程库", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "导入教程包" }).click();
  await page.locator("input[type=file]").setInputFiles(file!);
  await expect(page.getByRole("heading", { name: "自定义练习" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/library-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
