# 611 · 作品正文阅读排版 代码审核

独立子代理审核未提交改动（不含 `docs/requirements-traceability.json`），未修改文件。审核时单元 10/10、浏览器 19/19、`tsc --noEmit` 通过。结论：**补完中 1、中 2 并完成真实目标验证后可合入**；无高级问题。

已核对无问题：未传 `reader` 时其他调用方 DOM 与改动前一致（`modeSwitch` JSX 逐字相同、`{...undefined}` 不展开、`cn` 输出相同、`className` 原本未传）；逐键重渲染不重置块 DOM（header/footer 在块数组之外，`PreviewBlock` 按 html memo，高亮 effect 幂等）；CSS 作用域无外泄、优先级正确；store 延迟访问 `localStorage`、经 sanitize；Popover 写法与 `ItemLevelPicker` 一致；设计偏离已在方案 §8 记录。

## 中

1. CR611-51 可能空过：`writes.every(w => w === "")` 无写入时恒真。应在 Cmd+C 前断言选区不含章首、焦点在预览；或在非空正文下断言写入以「甲段」开头且不含章首。
2. CR611-41~45 只验证关闭，未验证「点击照常生效」。至少补一条（如点工具条评论开关后状态翻转）。
3. 真实目标未运行，`real-target-report.json` 不存在；评论气泡/composer 在书页内继承 18px、行高 1.95、衬线和阅读色，需在真实截图中确认。

## 低

4. 模式切换时 `modeSwitch` 换父节点被重挂载，焦点丢到 body（`MarkdownEditor.tsx:370-372`）。`reader` 存在时固定使用包装层。
5. 章首 `<header>` 成为 banner 地标（`ChapterReader.tsx:28`）。改 `div role="group"` 或 `section`。
6. 整 store 订阅（`ChapterReader.tsx:25/58/105`）。改 `useShallow` 选择器。
7. `countChineseWords(content)` 每次渲染重复计算（`ChapterContentPanel.tsx:279`）。`useMemo`。
8. `chapterHeading`：「第一节课」「第一回合」被拆开（节/回后应要求分隔符或结尾）；`replace(" · ")` 只替换一处；分隔符缺「—」「｜」「，」。
9. 无障碍：触发按钮 `aria-label` 与可见文字不一致；三组按钮缺 `role="group"`+`aria-labelledby`；开关行文字不可点击（设计稿整行可点）。
10. CR611-55c 依赖 250ms 计时。先等段落钮隐藏，再在 h1 内移动后断言。
11. CR611-04 容差 16px 可收紧到 1px（`no-scrollbar`）；CR-59 用合成 `MarkdownEditor`（`plain`）而非真实 `WorldPanel`/`SettingContentEditor`，需台账注明或替换；CRU-09 只读源码，浏览器 CR611-55/51 覆盖实际行为。
12. `.chapter-reader, .chapter-reader[data-reader-size="18"]` 写法多余，可简化。
