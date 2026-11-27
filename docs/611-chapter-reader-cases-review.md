# 611 · 作品正文阅读排版 测试用例审核

审核对象：`docs/611-chapter-reader-cases.md` 第一版。独立子代理审核，未修改文件。结论：**有条件通过**；必改高 1–3、中 4–8、中 10；中 9、中 11 建议实现前补上。

## 高

1. CR-59 测错对象。仓库没有 `ChapterOutlinePanel`；`chapter-outline` 对应 `OutlineProjectionPanel`（`registry.tsx:74`），大纲正文走 `MarkdownPreview`（`PlanningWorkspace.tsx:1620`），内层类无 `relative`（`MarkdownPreview.tsx:26`）。真正走 `CommentablePreview` 的其他调用方是 `CandidatePanel.tsx:221`（`novel`+`commentsTarget`）、`WorldPanel.tsx:163`、`SettingContentEditor.tsx:95`。`git stash` 采基线会收走工作区未提交改动（台账常驻未提交条目）。建议断言无阅读类/属性 + 按 `globals.css:469`、`desktop.css:178` 断言固定值；或用 `git worktree` 在 HEAD 采基线。
2. CR-52 无法提交评论：`CommentComposer` 在 `!ready` 时禁用（`CommentComposer.tsx:29/65`），`ready` 需要 `CommentDraftAccount`（`comment-drafts.tsx:22`）。夹具要挂。
3. CR-05/09 字体字号断言会白过：`--desktop-body-*` 由 `DesktopApp.tsx:187-189` 写入，夹具未挂；`--font-noto-serif` 也未定义。夹具应用 `desktopFontFamily('serif',true)` 设置变量并设成非默认值（16px/1.8）证明覆盖；补「正文字体设为 system 时以设置为准」。

## 中

4. CR-48 `ai.stop` 是 renderer 命令（`ChatPanel.tsx:1701`），不经过 `window.desktop.command`，断言必然成立。应注册 enabled 的 `ai.stop` 探针。
5. CR-49 夹具无 `file.save`（只在 `DesktopApp.tsx:85` 注册）。注册探针；打开期间探针 0 次，并派发非 `text.` 的 `desktop:command` 断言被丢弃（`DesktopCommandController.tsx:93`）；关闭后两者各执行一次。
6. CR-03 保存状态在 `idle` 时为 null（`use-autosave.tsx:89`），需先编辑触发保存。
7. CR-58 需写明结束事件：`candidate-ready` 会打开候选稿历史并隐藏编辑器（`ChapterContentPanel.tsx:191/278`）。用挂起的 ReadableStream，以 `content-committed` + version 递增结束，并配随后 GET 的新章节。
8. CR-60 写成「或」。版本历史（`ChapterHistory.tsx:171`）与候选稿对比（`:205-206`）都要测，夹具缺 `/versions` 桩。
9. R2 只测了选区。补：跨章首选区无「添加评论」、「标注伏笔」禁用；悬停章首无段落评论钮；章首右键不弹正文菜单（`isPreviewBodyTarget`）；伏笔引用 `.foreshadow-mark` 仍在正文。
10. 台账 `CR-01`~`CR-04` 已被占用（`requirements-traceability.json:6636-6639`），换前缀如 `CR611-xx`。映射缺 CR-08/31/52–54、CRU、CRR-01/02/03/06/07、§6。`deviations` 还应列 §7.1、§8.4、§8.9。补 reuse-manifest `currentSha256` 核对项。
11. 真实目标证据会把导入原文带进仓库。CRR-07 只记 sha256 与 version；截图放 `~/shakeink-test-roots/…-evidence/611/`，仓库只放报告；报告不得含 `state.json`/bootstrap；Node 24 构建，运行期间不构建，CRR-05 用 `app.quit` 正常退出。

## 低

- 数值核对全部正确（35.1/36/13.5/0.36/28.8px、hex→RGB、WRITTEN→「已生成」、菜单名）。
- CR-05 补 `margin-top:0px`；CR-02 可补章节号 16.128px。
- 工具条字数用 `toLocaleString()`，需 ≥1000 字的章节；「·」若用 `::before` 不在 textContent 中，按分项文本断言。
- CR-46/56/57 需 Monaco worker 路由（照 `text-shortcuts.test.ts`）。
- bootstrap 用 `{...defaultState, platform:'darwin'}`。
- CR-51 期望改为「无写入或写入空串」；先聚焦预览并用 CDP 发键。
- store 单元：内存 localStorage 桩须先于 store 导入。
- CRR-06 窄面板与分屏各截一张；CRR-02 写明主题切换方式。
- 设计细节缺测：色块选中环、玄墨色块描边、元信息/章末 `--font-ui`、面包屑单行省略、玄墨 `box-shadow` 非 none。
