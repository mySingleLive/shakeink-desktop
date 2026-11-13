# 540 · 导入校验提速、自动修复与保存作品测试用例

对应方案 `docs/539-import-verify-save-plan.md`（以其审核结论修订后的版本为准）。编号 VS-xx。除标注“真实 E2E”外，都在 `tests/unit` 中用受控模型（fixture）执行，不访问网络。

## A. 复核通道与回复规范化（`desktop/service/novel-import-ai.ts`）

| 编号 | 场景 | 期望 |
|---|---|---|
| VS-01 | `wizard-review-v1` 复核请求（semanticVersion 1，phase review，无 intent） | `lightImportGeneration` 为真：DeepSeek 关闭思考，在导入通道运行；`validateSemanticRequest` 接受该通道 |
| VS-02 | 同通道用于 analyze 或带 intent 的请求 | 抛出“导入调度通道无效” |
| VS-03 | 回复中 `conflicts[0].kind` 为“设定”，`source.artifactId` 指向本包角色资料 | 规范化后 kind 为 `character`，解析通过（复现截图错误 conflicts.0.kind） |
| VS-04 | kind 非法且 artifactId 不在本包 | 该条丢弃，`reviewRepairs.droppedConflicts=1`，其余条目保留 |
| VS-05 | type 非法、field 缺失、candidate 缺 text、多余键、缺 id/hash/status | 补齐或去除后通过；服务端重算 id/hash |
| VS-06 | evidence 中一项无法定位、一项可定位 | 保留可定位项；全部不可定位时整条丢弃并计数 |
| VS-07 | 回复带 `missingTargets` 或 `artifacts` | 规范化去除，不报越权 |
| VS-08 | 非该通道请求的回复带 `reviewRepairs` | 抛出越权 |
| VS-09 | 非向导复核与仅场景复核 | 不经规范化，行为与提示文本不变（金样本 `legacy-scene:review/////` 不变） |

## B. 并行复核调度（`desktop/main/novel-import.ts`）

| 编号 | 场景 | 期望 |
|---|---|---|
| VS-10 | 向导全量目标进入第21步 | 复核请求全部带 `executionLane:'wizard-review-v1'`；不发 `reviewFactPackets` 分片请求；按章对齐，单包不跨章切分（除非单章超预算） |
| VS-11 | 并发度 | 同时在途的复核请求数 >1 且 ≤`WIZARD_LINE_CONCURRENCY` |
| VS-12 | 包上下文 | 每包 artifacts 为本包被引用资料的精简片段，并带 reviewProjection；长 text 截断时带 textRange；超长 fact 不发送 |
| VS-13 | 一包第 1、2 次返回结构错误，第 3 次成功 | 该包结果提交，无失败包，一致性复核通过 |
| VS-14 | 一包 3 次都失败（非授权类） | 该包记入 `w.verify.failedPackets`（attempts 3）；其它包照常提交；一致性复核行失败并显示 [修复]；步骤 waiting |
| VS-15 | 授权或模型变化类错误 | 立即停止，不重试，不新发包 |
| VS-16 | 恢复 | 已在 `coverage.review` 中的单元在 [修复] 或重启后不重发 |
| VS-17 | 仅场景目标的向导会话 | 仍走原 `reviewWaves`，请求与原用例一致（既有场景复核用例全部通过） |
| VS-18 | 场景归属 | 复核包带场景片段与 projection 时，`ownershipReviewed` 得到记账 |

## C. 自动修复（以正文为准）

| 编号 | 场景 | 期望 |
|---|---|---|
| VS-20 | 复核报告角色 text 与正文矛盾，定向复核通过 | 资料 text 改为 candidate.value，冲突 resolved（resolution `auto-body`），decision 写入，语义检查点 inputHash 与 decisionHash 一致；校验页显示“已自动修复 1 处设定” |
| VS-21 | 定向复核 3 次都仍报矛盾 | 资料不变，冲突 pending，attempts 3，`repairable` 为真，一致性复核行显示 [修复] |
| VS-22 | 修复值未通过 `validateImportSemanticArtifact` | 计为失败一次，不写回 |
| VS-23 | 冲突指向原资料（origin source）、body-body 冲突、截断字段 | 不自动修，保持 pending，显示“处理矛盾” |
| VS-24 | 关系指向未导入角色、设定世界未导入、讲述卡引用不存在事件、触点无法定位 | 确定性修复生效，记入 dropped，校验页列出，相应检查通过 |
| VS-25 | 某章缺细纲 | 自动补生成；3 次失败后细纲行失败并显示 [修复] |

## D. [修复] 按钮

| 编号 | 场景 | 期望 |
|---|---|---|
| VS-30 | VS-14 状态点击 [修复]，模型恢复正常 | 失败包重跑成功，一致性复核通过，检查全部通过 |
| VS-31 | 连续点击 [修复] 4 次以上，模型持续失败 | 每次都执行（不限次数），每次重新给 3 次 |
| VS-32 | 复核运行中 | [修复]、[保存作品] 禁用，动作被拒 |
| VS-33 | 非 verify 步骤调用 `wizard-verify-repair` | 被拒，会话不变（快照回滚） |

## E. 保存作品

| 编号 | 场景 | 期望 |
|---|---|---|
| VS-40 | 有失败项（VS-14、VS-21、VS-25）时点击 [保存作品] | 成功，phase completed；pending 冲突记为 kept；未修复字段保留导入结果；缺细纲的章 outline 为空 |
| VS-41 | 全部通过时保存 | 与现有 NIW-C61 一致 |
| VS-42 | 发布内容一致性 | 发布事务中的角色、场景、物品、世界/设定、伏笔、爽点/泪点、主题、文风、金手指、世界线事件、讲述卡、卷章正文、细纲，与保存前会话 artifacts（剔除被丢弃项）逐类数量、名称一致；正文逐章相等 |
| VS-43 | 非向导会话 | 保存仍要求冲突解决、细纲完整、场景归属完整（既有用例不变） |
| VS-44 | UI | 校验结束、未运行时 [保存作品] 可点击；有问题时提示“仍有未通过项，保存时只保留已成功导入的内容”；一致性复核失败行显示 [修复] |

## F. 真实 E2E 与全量

| 编号 | 场景 | 期望 |
|---|---|---|
| VS-50 | 真实 E2E：`/private/tmp/shakeink-verify-539/launch-verify.mjs <label>`，诡秘之主第一卷，默认 11 类目标，全新会话 | 进入 verify 到结果出现 ≤120000 ms；`verify-completed.json` 记录检查、失败包、修复数 |
| VS-51 | 同一运行中无条件点击 [保存作品] | phase completed；`work-readback.json` 各类数量与会话一致，`chapters.bodyEqual` 与 `outlineEqual` 为真 |
| VS-52 | 右侧导航 | 截图中出现作品，展开后可见设定、角色、场景、物品、世界线、叙事线、大纲、正文分组 |
| VS-53 | 全量 | Node 24 下 `npm test` 全部通过；`npm run build:desktop` 成功 |
