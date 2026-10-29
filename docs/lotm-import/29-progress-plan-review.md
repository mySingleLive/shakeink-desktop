# 小包进度与旧草稿文案方案独审

日期：2026-10-28。审核者：独立子代理 `lotm_volume3_source_cont2`。结论：**28 的技术方案与复用既有用例的设计通过，可进入补断言 RED/TDD。** 这不是实现审核、测试通过或真实运行验收；本审核未实施、未运行测试，未读取真实 journal、数据库、生成产物或最低语义清单。

审核材料为 `28-progress-healing-plan.md`、`desktop/main/novel-import.ts` 的 `semanticAnalyzeUnits` / `semanticWorkflow` / `step` 及直接依赖的 `checkpoint`、`save`、`ai`、`stageRequests`，`NovelImportDialog.tsx` 的 `ProgressScreen`，既有 E02/E03/E04/E05 和 NI-U05。未独立确认 28 所述 B2/B3 运行数字或截图；它们不是本次只读审核的证据结论。

## 技术判断与实现边界

- 当前成功叶在主进程 621 行同一 `checkpoint` 内合并 artifacts、conflicts 和去重 coverage；637 行只在整个 kind 前后更新 step，故中途叶成功没有相应计数更新。把对应 step 的 `completed` / `total` 加入这个已有回调，能让同一份持久化快照和同一轮变更通知携带两者。不能在回调外先改计数，也不能调用另带 checkpoint 的 `step()` 再保存一次。
- `checkpoint` 在串行队列内先校验当前 session/epoch，再执行更新；`save` 写临时文件、sync 后 rename，再通知界面。这一修复应沿用已有持久化边界；本结论不把它扩大成对所有保存故障的通用内存事务保证。
- `completed` 从此次提交后的该 kind 去重 coverage 得出，不能用请求数、叶次数、递归深度或 artifacts 数。`total` 必须是完整 `workingImportUnits(s).length`，不能用 `semanticAnalyzeUnits` 收到的 `units.length`：该参数在恢复时是尚未覆盖的剩余单元，递归中又会缩成子包。
- 只同步计数，保留 step 原状态及 skipped 保护。`kindStep` 对 scene/item 和 settings 多 kind 的共享步骤仍显示当前处理 kind，不能把几个 kind 的 coverage 相加。所有校验、合并、锁定验证必须继续先于计数提交；失败父包、无关错误、单单元失败、暂停/取消、epoch 变化及迟到响应均无新计数提交。
- UI 当前 114 行直接输出 `step.label`。按 `step.key === 'body'` 在渲染处投影为“导入正文”即可，不修改步骤对象、journal、历史授权、语义输入、预算或来源。其它步骤依旧使用原 label；确认页已是新文案。
- 不应触碰 `cap` 的本执行局部收缩、证据错误白名单、模型调用、请求/证据/锁/来源结构、授权、预算、历史正文和覆盖恢复逻辑。本次没有理由改动推断内容或扩大诊断实施范围。

## 对既有用例补断言的核准细则

| 既有用例 | 应补的有效断言与时机 |
|---|---|
| E03 | 右叶开始处理时读取已持久化快照，左叶 coverage 长度等于 step.completed，step.total 等于完整 working units；右叶失败后的快照仍相等。正常 close/reopen 后、继续发送前再次确认，最终 done 计数等于全量；保留既有不重放、来源 hash 和发布断言。旧实现中间计数为 0，因此新断言能产生有意义的 RED。 |
| E05 | 在 held 的右包未返回时，先核对左叶已提交 coverage/step/完整 total；pause 触发迟到响应并排空后，三者不变且未发布。保留既有 artifacts 数断言。不能只在最终 done 后查计数。 |
| E02 / E04 | 保留预算冻结、实际请求大小与上下文、来源等值、白名单/单单元停止/授权变化/冲突中止断言。补最终 done 全量和失败无信用的计数一致性；失败父包不得单独增长进度。E02 的最终 done 断言本身不是本缺陷的 RED，因为旧代码结尾本就更新。 |
| NI-U05 | 在既有 running fixture 中注入 body.key + 旧 body.label，断言真实 React 运行页显示“导入正文”，旧名称不可见，并保留 pause/resume、收起恢复、取消保留和完成关闭的全部行为。断言原 fixture 步骤 label 未被组件改写，其它步骤 label 不变；可在原流程更新计数验证展示，不新建复制 UI 实现的镜像测试。 |

这些是 28 预期的具体落点，不要求新造测试文件或重复实现渲染规则。应先运行补断言的既有用例并保留真实 RED，再做最小实现、独立代码审核和定向 GREEN。测试均为合成协议/React 验证，不能称真实长书 UI 已验证。

## 后续真实验证

按 28 从正常暂停/退出到 B4 构建身份、同一原 session 恢复继续的证据链验证；旧 journal 的 body.label 可仍为旧值，但 UI 应显示新名称，真实成功叶后应能观察已提交计数增长。不得手改真实 journal 或清掉既有结果来得到截图。生产源码变更后必须使用实际构建身份，不能把旧 B3 包当当前源码验证。

第三卷来源阅读在此次技术审核前冻结于第 48 章之后；未读取真实产物。本次方案通过不改变任何全书语义项目的 NOT RUN 状态，也不抵扣其它尚未完成的验收。
