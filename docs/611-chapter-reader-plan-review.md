# 611 · 作品正文阅读排版 技术方案审核

审核对象：`docs/611-chapter-reader-plan.md` 第一版。独立子代理审核，未修改文件。结论：**有条件通过**，中 1–中 4 必改，中 5 需在用例中覆盖或豁免。

## 中

1. 章首/章末的 `p` 会命中 `globals.css:466` `.markdown-body.novel p`（缩进 2em、段距 .45em）及方案 §4.7 的段落规则。正文规则应限定为 `.chapter-reader [data-block] p`，或在章首/章末显式重置。
2. 空正文时没有 `[data-block]`，`preview-selection.ts:9` `previewBodyRoots` 回退到 `.markdown-body > div`（即 innerRef），章首在其中，Cmd+A（`text.selectAll`）会选中并复制章首。需在 `preview-selection.ts:5` 的 `ui` 选择器加章首/章末标记，或空正文不渲染章首。
3. `@container` 查询不能改容器自身，「窄面板外层背景同书页」不会生效。改为书页 `min-height:100%` 铺满，或把 `container-type` 放到外层包裹。分屏预览列通常 < 820px，会走窄布局，用例需写明。
4. 评论浮钮固定 `left:10px`、宽 26px（`CommentablePreview.tsx:330/437`，`globals.css:856`），窄面板左内边距 26px 时会压住正文约 10px。窄面板左内边距需 ≥ 40px。
5. Esc 结论成立：`DesktopCommandController.tsx:23/116` 在存在 `[role="dialog"]` 时放行 Esc 不 `preventDefault`，Base UI Popover 弹出层 `role:'dialog'`（`PopoverPopup.js:91`）。副作用：`:93` 弹出框打开期间拦掉非 `text.` 的原生菜单命令，`:121` 快捷键按模态处理。方案未提，需用例覆盖并认定可接受，或豁免。

## 低

- 外部点击关闭与 R11 一致；点在窗口拖拽区（`desktop.css:180`）或原生菜单不产生指针事件，不会关闭，需写入交付说明。
- `contentClassName` 经 twMerge 合并；desktop.css 不在 layer 内可覆盖 Tailwind 工具类；必须保留 `relative`（浮钮定位基准）。
- 层叠：globals 的 `.markdown-body` 规则在 `@layer components`（`globals.css:409`），desktop.css 不在 layer，重置必生效；`.desktop-markdown-editor .chapter-reader.markdown-body`（0,3,0）高于 `desktop.css:178`（0,2,0）。
- 分屏按比例同步滚动（`MarkdownEditor.tsx:295`），章首高度带来小偏差，可接受。
- 流式生成时也会显示「本章完」，建议 `readOnly` 时隐藏章末。
- 卷名自带「第一卷」时显示「第一卷 小丑」，否则「第一卷 · 卷名」；阿拉伯数字「第1章」原样保留。用例需覆盖。
- localStorage 落在 `数据根/session`（`desktop/main/index.ts:375`、`session-directory.ts:10`），跟随数据根；目录迁移后是否保留需验证或写入交付说明。
- reuse-manifest 已有漂移：`CommentablePreview.tsx` 当前 `dcf56d…`≠台账 `24754b…`（c4cf283 改过）；`ChapterContentPanel.tsx` 当前 `78c9d3…`≠`90a5e3…`。更新时保留原 `sha256`、加 `currentSha256`，`reason` 说明旧漂移。
- `reader` 的 `useMemo` 依赖 ReactNode 效果有限，不影响正确性（`PreviewBlock` 按 html memo）。

## 逐项

- R1–R12 均有路径。设计稿中未写进方案：`.reader-body letter-spacing:.02em`；元信息/章末无衬线；左对齐时装饰线变 48px 印章色短线；色块选中环；玄墨色块描边。
- 选区（中 2 除外）、评论高亮（`CommentablePreview.tsx:223`）、伏笔（`preview-references.tsx:34`）、右键菜单（`isPreviewBodyTarget`）、`editor.focus`（`MarkdownEditor.tsx:141`）不受影响；孤儿气泡排在「本章完」之前可接受。
- 范围：`CommentablePreview` 唯一调用方是 `MarkdownEditor.tsx:415`；其他 9 个 `MarkdownEditor` 调用方不传 `reader`。建议对大纲面板做 DOM 比对。
- §7：问题 1 同意（设置里显式选非衬线时以设置为准，写入交付说明）；问题 2 同意（写明不随导出配置迁移、跟随数据根）；问题 3 同意不可选，但这是对批准稿 `.chapter-head{user-select:text}` 的偏离，需记入台账和交付说明；真实理由是评论/伏笔锚点取不到跨章首选区（`readPreviewSelection` 返回 null），复制有 `copySpanningSelection` 兜底（`DesktopCommandController.tsx:59`）。
- 持久化即时保存，离线，无 HTTP，未违反 AGENTS.md/boundaries。
- traceability 只追加 `CR-611` 正确。
