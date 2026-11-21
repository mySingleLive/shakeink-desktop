# 角色识别提速与进度计数 测试用例（239）

日期：2026-10-30。方案见 `docs/238-roster-speed-plan.md`。全部自动化用例使用合成夹具（`tests/helpers/novel-import-wizard-fixture.ts`）与隔离临时目录，不接触真实数据与 Key。

## 主进程会话用例（`tests/unit/novel-import-wizard-session.test.ts`）

| ID | 名称 | 步骤 | 预期 |
| --- | --- | --- | --- |
| RS-01 | 识别批次并行且有上限 | 正文切成 ≥40 个识别批次（小预算模型或长正文）；roster 处理器记录并发并延迟返回 | 最大并发 =16（批次 ≥16 时）；全部批次各发一次；最终候选完整；`coverage['roster:character']` 覆盖全部工作单元 |
| RS-02 | 识别过程中计数递增 | RS-01 设置下逐批放行结果，期间轮询 `view.wizard.rosterFound` | 步骤为 running 时出现 ≥3 个不同且单调不减的值；最终值等于合并后候选数（无资料文件时） |
| RS-03 | 失败停止并只重发未完成批次 | 第 k 批抛 `Rate Limit Reached`，其余正常 | 步骤 failed，错误文案同 NIW-C22；在途请求被取消；已成功批次的覆盖已落盘；`wizard-redetect` 只发送未覆盖单元，完成后候选完整 |
| RS-04 | 暂停中止在途识别 | 识别中 `pause` | 所有在途 roster 请求收到 `cancelAi`；`active===0`；phase=paused；迟到结果不写入 stash/coverage；`resume` 后只发送未覆盖批次并完成 |
| RS-05 | 来源核对次数受控 | 统计 `verifySources` 调用 | 每次识别运行调用次数与批次数无关（开始与结束各一次，不随 59 批增长） |
| RS-06 | 原有识别用例不变 | NIW-C21a/C21/C22/C23/C24 | 全部通过 |

## 服务端用例（`tests/unit/novel-import-ai.test.ts` 或新文件 `tests/unit/novel-import-roster-ai.test.ts`）

| ID | 名称 | 步骤 | 预期 |
| --- | --- | --- | --- |
| RA-01 | 无 evidence 的条目本地定位 | 角色 roster 返回 `{name,aliases,roleType}`，名称出现在第 2 个单元 | 通过校验；`evidence.unitId` 为第 2 个单元，quote 为原文中的名称 |
| RA-02 | 名称仅以别名出现 | name 不在原文，别名在第 1 单元 | 定位到第 1 单元，quote 为该别名 |
| RA-03 | 原文不存在的名称被丢弃 | name 与别名都不在任何单元 | 条目被丢弃，不报错 |
| RA-04 | 模型给出可定位 evidence 时保留 | 条目带正确 `{unitId,quote}` | 保持模型的 unitId/quote |
| RA-05 | 模型 evidence 无法定位时回退本地定位 | evidence 引文不存在但名称在原文 | 改用本地定位结果，不丢弃 |
| RA-06 | 其他字段约束不变 | roleType 非法、多余字段、名称为空 | 仍判结构无效 |
| RA-07 | 场景/物品/世界观同样适用 | 三类各一条无 evidence 条目 | 均定位成功；`parent`/`itemType`/`settings` 原样保留 |
| RA-08 | touches 仍要求 evidence | touches 条目缺 evidence | 结构无效 |

## 提示与思考选项用例

| ID | 名称 | 预期 |
| --- | --- | --- |
| WP-01（更新） | roster 契约描述清单字段 | 契约含 name/aliases 及各类特有字段；不含 `artifacts:[`；**不再要求 evidence/quote** |
| WP-04 | roster 契约不要求逐字引文 | 契约不含"逐字摘取"；touches 契约仍含 quote 与 evidence |
| RT-01 | DeepSeek 识别请求关闭思考 | `importRosterModel(resolved)`（或等效函数）对 provider=deepseek 的模型返回 `providerOptions.deepseek.thinking.type==='disabled'` |
| RT-02 | 其他供应商用最低档位 | anthropic/openai 推理模型取最低显式档位；无档位模型 `providerOptions` 不变 |
| RT-03 | 非 roster 请求不变 | entity/analyze/review 请求的 providerOptions 与改动前一致 |

## 分批快速路径（`tests/unit/novel-import-session.test.ts` 或新文件）

| ID | 名称 | 预期 |
| --- | --- | --- |
| SB-01 | 快速路径与逐单元算法批次相同 | 随机单元长度（含接近预算边界）下，两种算法产出的批次单元 id 序列完全相同 |
| SB-02 | 元数据超限时回退 | 构造某批请求体超过 `characters*3` | 回退逐单元算法，行为与改动前一致（含"单个导入任务及完整元数据超过模型预算"错误） |

## 界面用例（`tests/browser/novel-import-wizard.test.ts`）

| ID | 名称 | 预期 |
| --- | --- | --- |
| RB-01 | 运行态显示计数 | `detect-char` running、`rosterFound=12`：显示"正在识别角色"与"已识别 12 个角色"，该行 `aria-live=polite` |
| RB-02 | 未返回结果时显示 0 | `rosterFound` 缺省：显示"已识别 0 个角色" |
| RB-03 | 其他类别文案 | `detect-scene` running、`rosterFound=3`："已识别 3 个场景" |

## 全量回归

- `npm test`、`npm run typecheck`、浏览器用例 `node --import tsx --test tests/browser/novel-import-wizard.test.ts`；与基线失败名单比对，不新增失败。

## 真实目标系统验证（RR）

隔离数据根 + LotmVerification.app Electron（见记忆 lotm-isolated-runtime），DeepSeek-V4.1-Flash，新会话导入《诡秘之主》全书。

| ID | 名称 | 预期 |
| --- | --- | --- |
| RR-01 | 识别时长 | 日志记录 `detect-char` 进入 running 至 waiting 的时间 ≤60 s |
| RR-02 | 计数可见并递增 | 识别期间至少 3 张截图显示"已识别 N 个角色"，N 递增；记录 `rosterFound` 序列 |
| RR-03 | 结果可用 | 识别完成为 waiting（非 failed），候选数 >0；主角"克莱恩·莫雷蒂"及上次结果中出场章数前 20 的角色召回情况记录在验证文档 |

## 审核处理（`docs/239-roster-speed-cases-review.md`）后的实际用例

- RS-01 分两种夹具运行：16k 上下文（旧预算，40 批）与 262,144 上下文（v2 预算，断言 `budgetPolicy` 与 `executionBudget.version===2`）。并发上限 15；不重复发送任何单元。
- RS-03：失败后断言 coverage 恰好等于成功批次单元的并集，stash 条目对应成功批次；重新识别后所有成功批次两两不相交且覆盖全部单元。
- RS-04：记录暂停时在途的 operationId，断言 `cancelAi` 恰好收到这些；暂停后 coverage 与 stash 与暂停前快照相同。RS-04b：迟到 AbortError 不使步骤失败。
- RS-05：一次识别恰好核对来源 2 次。RS-05b：结尾核对失败时步骤失败、不生成清单、已完成覆盖保留；来源仍变化时重新识别仍失败；恢复后重新识别成功。
- RS-06（`novel-import-wizard.test.ts`）：合并别名不超过 50。RS-07：两批返回顺序互换，候选 id/名称/别名/证据单元完全相同。
- RF-01：运行中计数只含正文名称（39），完成后资料独有的名字进入清单（41）。
- RA-09：每个返回条目都有指向请求单元的 evidence。RT-03：OpenAI `store:false` 合并保留；DeepSeek 走 Anthropic 协议时不改选项。WP-04：roster 完整提示不含 evidence/quote/逐字，touches/entity 保留。
- 未覆盖：长任务名额绕过（需替换服务端 `generateImportAiJson`，本轮由真实运行侧面验证）、`close()` 后重启续跑（由 NIW 既有恢复用例与 RS-04 覆盖续跑逻辑）、保存失败分支。
