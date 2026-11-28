# 612 · 正文框选 AI 助手工具栏 代码审核记录

审核方式：独立子代理只读审核工作区改动（2026-11-29），主代理逐条核对后修复并补测试。

## 结论与处理

| 级别 | 问题 | 处理 | 验证 |
|---|---|---|---|
| 阻断 | Monaco 选区装饰的 effect 依赖 `tick`，每次编辑都按原始偏移重建，作者在选区外编辑后跟踪失效，替换误判冲突（`useSelectionAiLayer.tsx`） | effect 只在任务或编辑器实例变化时创建装饰，种子取最新跟踪范围；另加文本差分跟踪（预览视图及视图切换后使用） | 新增浏览器用例「SA-73/74 (edit view)」「SA-74 (preview)」；把 `tick` 加回依赖时用例失败，去掉后通过 |
| 重要 | 撤销在 `flush`/`beforeCommit` 抛错时也调用 `commitFailed()`，会解除冲突流程的暂停 | 只有 `beforeCommit` 成功后失败才恢复 | 代码核对 |
| 重要 | `applyCommit` 在 `receiveCommit` 后无条件 `resume()`，提交在途时又有输入会用旧版本自动保存 | 不再自行 resume，交给 `receiveCommit` 成功路径 | 代码核对（`ChapterContentPanel.tsx:144` 为唯一成功路径 resume） |
| 重要 | 预览与 Monaco 共用 `bridge.open`，互相覆盖；分屏切到编辑后「添加评论」不可用 | 改为按视图登记 `openers.edit / openers.preview`，各自只清理自己 | 新增「code review 4」用例：分屏中 Monaco 选区的评论框开在 Monaco 内；离开分屏后仍可用 |
| 重要 | 编辑器重新登记时 context key 未重建，默认 Cmd/Ctrl+Z 不再接管 | `WeakMap` 缓存每个实例的 context key | 代码核对；SA-79/79b 通过 |
| 建议 | `addCommand` 的 Cmd/Ctrl+Z 无视改绑 | 上下文键仅在 `text.undo` 仍绑定 Cmd/Ctrl+Z 时为 true；改绑后由桌面命令路径（`setMonacoUndoOverride`）接管 | SA-79b |
| 建议 | 连点「替换」可能卡在 conflict | 改用 ref 防重复；只在仍有任务时进入 conflict | 新增「double click on 替换」用例 |
| 建议 | `start()` 在 flush 期间关闭仍会开始生成 | flush 后核对 anchor 未变 | 代码核对 |
| 建议 | 预览 effect 每次渲染序列化全文 | 暂未改：签名比较与既有评论高亮 effect 同款，20 万字上限内成本可接受；如真实目标中观察到卡顿再优化 | — |

审核确认正确的部分：提交事务顺序（回执 → 锁章 → CAS → 选区校验）、「AI X前」额外修订与撤销的版本对应、生成路由不写库且断连中止、日志不含正文、`loadCharacterAttributeNames` 语义不变、Escape 与 `ai.stop` 互斥、复用真实组件、无 HTTP 监听。
