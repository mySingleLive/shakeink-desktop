# 529 · 场景清单片段压缩用例（522 第三步，方案 528 修订 1 + 复审补充）

合成数据，不含真实正文或 Key。单元测试：`tests/unit/novel-import-scene-fragment-compact.test.ts`；金样沿用 `tests/fixtures/novel-import-prompt-golden.json` 与 `novel-import-request-trace.json`。

| 编号 | 场景 | 期望 |
| --- | --- | --- |
| SC-01 金样 | 旧会话（无 `sceneFragmentLayout`）与 legacy 开关 | 两份金样 `--check` 均通过（逐字节不变）。 |
| SC-02 会话门 | 新建向导会话（1M、v2）；legacy 开关；非向导；`append` 追加；旧日志 resume；`sceneFragmentLayout:'other'` 或无 `budgetPolicy` 的日志 | 仅第一项写入 `'compact-v1'`，并计入 `importScopeHash`/`importPlanHash`；其余不写入、哈希不变；最后一项加载被拒。526 的 `promptLayout` 可独立为缺省。 |
| SC-03 字段附加 | 新会话中场景 roster（`mode:'roster'`）、`sceneParentTargets` 请求、links/cleanup/ownership、角色 roster | 仅场景 roster 带 `sceneFragmentRefs:{version:1,width:12}`；其余不带。 |
| SC-04 线上编码 | 新布局场景 roster 载荷 | 每单元 `fragments` 为 `[index,text,ref]` 三元组数组，`index` 与内部编号一致；ref 匹配 `^ef[0-9a-f]{12}$`；载荷不含 `sceneFragmentRefs` 键；内部 `SceneRosterReferencedFragment` 结构不变。 |
| SC-05 ref 派生 | 同一单元两次建表；不同单元相同文本 | ref 确定、跨单元不同；12 位 ref 不是任何 v1 16 位 ref 的前缀（新域标签）。 |
| SC-06 位宽与回退 | `sceneRosterFragmentWidth`：正常包；人为注入 12 位碰撞的包（测试钩子替换摘要） | 正常返回 12；碰撞时整包返回 16，载荷、zod、原生 schema、提示词示例均为 16 位；16 位仍重复时抛原错误。 |
| SC-07 解析 | 新布局：12 位 ref、16 位 ref、`{unitIndex,fromFragment,toFragment}`、`{unitId,quote}` | 12 位解析成功；16 位被拒（“ref 无效”，按布局生成的未知样例）；跨片编号与原文 quote 照旧可用。 |
| SC-08 schema | 新旧布局原生 schema 的 `ef` 模式 | 新：`^ef[0-9a-f]{12}$`；旧：`^ef[0-9a-f]{16}$`；与 zod 正则一致。 |
| SC-09 分批不变 | 同一合成正文，新旧会话场景 roster 的 `stage()` | 批的单元 id 序列逐项相同；新载荷长度 ≤ 旧载荷长度（性质测试：100 组随机单元集合）。 |
| SC-10 预算 | 片段很少的包、全 `<` 的包 | 新布局 `ai()` 不报“超过预算”；fit 判定同时对旧请求与真实请求成立。 |
| SC-11 纠错/修复 | 新布局首代 invalid、定点修复（targeted）、bound 修复、根结构恢复 | 展示的 `sourceRef` 与目录同为 12 位并能被同一表解析；纠错预算按旧布局等价长度判定（与旧布局下是否附带 focus 一致）。 |
| SC-12 控制焦点 | 新布局下控制焦点验证器 | 使用传入的同一表，结果与旧布局一致。 |
| SC-13 提示词 | 新布局契约文案 | 描述 fragments 为 `[编号,原文,ref]`，示例 ref 位宽与本包一致，不写位数；旧布局文案与金样一致；`service:807` 常量分类覆盖新文案。 |
| SC-14 服务端校验 | `sceneFragmentRefs` 出现在非场景 roster、`semanticVersion` 缺省、`width` 非 12/16、多余键 | 生成与模型解析前拒绝，固定错误、不含 id。 |
| SC-15 主进程断言 | 调用方传入与快照不一致的 `sceneFragmentRefs` | `ai()` 在 `options.ai` 前抛错。 |
| SC-16 日志 | 调试开启 | `import-usage` 含 `refWidth`（12/16/null）；`scene-roster-ref-invalid` 计数行只含计数；最长行 ≤768 字节。 |
| SC-17 回归 | 全量 `npm test`、`typecheck`、`build:desktop` | 失败清单与 `~/shakeink-test-roots/evidence-522/test-failures-after-524.txt` 按名称比较无新增。 |
| SC-SIM 离线 | 真实构造函数对 ss-r2 会话的全部场景 roster 批 | 新载荷总字符 ≤ 旧的 60%；12 位碰撞次数（期望 0）。 |
| SC-REAL 真实首跑 | 第一卷，新会话（新隔离根或清空 drafts），角色+场景+物品+世界观；驱动对步骤/任务“重新识别/重试”≤3 次 | 场景识别成功；场景 roster 折算费用较 ss-r2 下降 ≥30%（命中/未命中分列）；场景条目数与 ss-r2 比 ±15%，未决数与 cleanup 排除数同报；场景 roster 纠错代次率 ≤ ss-r2+5pp；ref 无效计数、跨片备选次数、`refWidth` 分布同报；不达标关闭 `compact-v1`。 |

## 审核修订（`529-scene-roster-fragment-compaction-cases-review.md` 1–16，替代上表对应期望）

- **SC-07（高1）拆为：** SC-07a 未知 12 位 ref → resolve 文案（service:96），ref 无效计数 +1；SC-07b 16 位 ref 发到 12 位包 → 字段级文案（service:249），计数 +1；SC-07c 12 位 ref 发到回退 16 位包 → 字段级文案，计数 +1；SC-07d `pendingReference`（service:95）冻结保留语义不变；跨片编号与原文 quote 照旧可用。
- **SC-03（高2）：** 以 fixture 捕获请求断言——带字段：首轮（main:718）、`importSceneOmissions`（main:1228）、折半重试子批（main:738-746）；不带：`sceneParentTargets`（main:823、836）、links、cleanup、ownership、非场景 roster。
- **SC-REAL（高3）门槛定值（基线 ss-r2，筛选 `phase=analyze,intent=roster,kind=scene,mode=roster`）：** 折算费用 = Σmiss + 0.1×Σhit，基线 2.49M，门槛 ≤1.74M（−30%）；纠错率 = 含 `generation>1` 行的不同 op 数 ÷ 不同 op 数，基线 74.1%，门槛 ≤79.1%；场景条目数按 **selected** 计，基线 345，±15%（294–397），候选总数同报；cleanup 排除数、未决数、ref 无效计数、跨片备选次数、`refWidth` 分布只同报不作门槛。
- **SC-06（中5）：** 在 fragments 模块导出仅测试用的 `withSceneFragmentDigestForTest(fn,body)`（`NODE_TEST_CONTEXT` 外抛错）注入碰撞；一致性断言覆盖载荷、服务端 resolve、repair-choices `sourceRef`、control-focus、zod、原生 schema、提示词示例、usage `refWidth`、`supportsStructuredSceneRoster`；主进程与服务端对同一请求得出同一位宽；`fragmentMemo` 不混用两种位宽。
- **SC-09/10（中6）：** 夹具使正文超过 3 个批；SC-10 注入 fit 判定观察器，断言 `legacyFits&&actualFits`；删除“全 `<` 包”。
- **SC-14（中7）：** 只接受 `{version:1,width:12}`；`width:16`、`sceneParentTargets` 同在、`semanticVersion` 缺省（在 service:881 提前返回之前拒绝）均拒绝。
- **SC-02（中8）：** legacy 两个开关（controller 选项与 `SHAKEINK_PROMPT_LAYOUT`）各测；v1 预算不写入；已开启会话 resume 不切换；哈希对比值取自 `tests/fixtures/novel-import-legacy-journal.json` 的冻结常量。
- **SC-11（中9）：** 构造“focus 在新载荷下放得下、旧载荷放不下”的包，纠错、根结构恢复、定点修复三处均不附带 focus（与旧布局一致）。
- **SC-15（中10）：** 附加、剥离、`width` 篡改三种不一致均抛错且 `options.ai` 未调用；一致时通过。
- **低：** SC-16b memo 上限 40,000（低11）；SC-SIM 门槛 60% 替代原 §3.2 的 45%，同报提示词字符数，先断言重建批数 = 27，证据不含正文（低12）；SC-13 断言 service:807 分类表对新文案返回与旧文案相同的类别（低13）；SC-04 补转义字符、代理对、CRLF、尾部空白、单片单元（低14）；SC-16 行格式 `scene-roster-ref-invalid {"op","count"}`、调试关闭不输出（低15）；SC-17 命令 `node --import tsx scripts/capture-novel-import-prompt-golden.ts --check` 与 `…request-trace.ts --check`，并登记 `requirements-traceability.json`（低16）。
