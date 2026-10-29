# 导入领域、会话与 AI 独立代码审核

日期：2026-10-26（Asia/Shanghai）。审核者：解析器/接线子代理；未编写被审的领域、会话或 AI 生产文件。范围：`desktop/core/novel-import.ts`、`desktop/main/novel-import.ts`、`desktop/service/novel-import-ai.ts` 及对应 domain/session/ai 定向测试。下列修复由实现子代理承担，本文不把已有绿灯当作所有约束已通过。

## 初审结论

**初审需修复，复审通过。** 下表保留初审发现及触发条件；七项均已按文末记录关闭。本次结论只覆盖所审文件和定向证据，不代替真实供应商或目标系统验收。

| 编号 | 等级 | 触发与证据 | 要求 |
| --- | --- | --- | --- |
| ER-01 | P1 | 已应用正文 patch（`workingRevision>0`）后，`select` 取消正文仅保留角色；`invalidate(false)`保留旧正文、原正文及章节。公开 `act` 复现读取 journal 仍有12个工作正文字符。真实 publisher 的 `sourceBody` 核对会阻止该计划，导致应可继续的纯资料导入被旧正文阻断；受控 publisher 能收到错误正文载荷。 | 正文来源选取变化须重置相关工作正文/章节/版本、下游结果和授权，不能把已取消正文继续带入计划。 |
| ER-02 | P1 | `mergeImportArtifacts` 合并同名的两份 source 资料、facts为空或互补时，只合并 evidence，`current.origin==='source'`阻止追加第二份 text。纯函数复现 `source_merge_retains_both=false`；发布记录的 materials 当前来自合并结果，不能用文件 hash 替代丢失的原资料。 | 完整保留所有选中的原资料文字及来源映射，结构事实可另外合并。不能靠最后数据库记录弥补已经丢掉的文本。 |
| ER-03 | P2 | `set-chapters` 仅改 chapters 并清 analysisGrant；已完成的 narrative、coverage、决定等仍存在。暂停后修改分章再 retry 会按旧 coverage 跳过叙事阶段并复用旧章引用。 | 分章改变须使受影响规划、coverage、决定和授权失效，重新按新章界分析。 |
| ER-04 | P1 | `ai()` 每批无界携带全量 entities/chapters，而正文分批仅按文字长度；`runImportAi` 对整个 JSON 设置 `budget*3` 限额。1000个合成实体、4字正文的复现直接报“导入请求超过模型预算”，生成器调用数为0；重试没有缩小目录的分支。 | 把结构元数据纳入预算和确定性分片/引用目录，不能把长书永久卡在同一超预算请求，也不能截取前N个实体冒充覆盖。 |
| ER-05 | P2 | `sourceImportArtifacts` 的角色姓名行正则将“性格：”“外貌：”也识别为新人物；排除表只含少数基础字段。合成材料“沈砚：十九岁。\n性格：沉稳。\n外貌：黑发。”须仍是一位角色。 | 用明确姓名/角色块边界识别，或完整排除已知设定字段；保留原文字段内容。 |
| ER-06 | P1 | 扫描器只限制单次原生选择。`choose(append:true)` 合并已有 session 时没有重新核验累计文件数/字节数/提取字符数，分次追加可绕过5000/100MiB/2500万的整体限制，且>5001文件会被恢复校验排除。 | 追加需原子验证整个会话的实际限制；超限清单应可见，不得破坏已有可恢复状态。 |
| ER-07 | P2 | `initialize` 跳过180,000,000字节以上的 journal；journal 同时保存 file.text、units.text、originalProse、workingProse及原资料。同一份允许导入的长中文正文会被多次序列化，超过该阈值后重新启动不能恢复。 | 保存与恢复容量必须一致；按实际序列化字节限制并明确报错，或使用去重复的私有来源快照，不能接受后静默失去恢复入口。 |

以上发现已发送主代理及实现子代理，修复未由审核者改写生产文件；最终状态见以下复审记录。

## 已核对的有效边界

- 领域分片及章节切片逐字符拼接，代理对切点检查；13类来源与12补全目标分离。
- 分类返回恰好覆盖输入 unitId，证据必须逐字存在；未知类别、伪证据和无效实体/规划引用拒绝。
- 每次模型调用前后比较模型 ID、端点、authRevision 等快照；review角色没有文本模型后备。默认生产路径使用已解析的完整 PublicModel，经既有 `generateJSON` 和模型网关发送，AbortSignal 经 `localModelFetch` 传播到 `model.cancel`。
- 会话异步回执检查 epoch，暂停等待取消与done排空；发布提交边界保留明确回执，不以关闭请求强行切断事务。
- 无正文和关闭全部补全的路径包括最终复核均不调用模型；恢复后目标目录必须重新原生授权同一身份，来源需验证原 proof/hash，不能凭同名文件继续。
- 私有 journal 0600、所属目录 marker 与身份检查；丢弃遇到未知文件时保留。

## 已执行证据

仅运行本功能相关文件，未执行全量测试：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test tests/unit/novel-import-domain.test.ts tests/unit/novel-import-ai.test.ts tests/unit/novel-import-session.test.ts
```

初审：21 tests / 21 pass / 0 fail，约1.06秒。受控 AI 适配器测试不代表真实供应商贯通。独立合成复现脚本 `/tmp/shakeink-import-review.ts` 输出：

```text
source_merge_retains_both false
deselected_body_working_characters 12
catalogue_budget_failure 导入请求超过模型预算，请继续分批 generation_called false
```

没有读取用户小说、Key 或外部账号资料，没有发布作品或执行文件中的指令。

## 复审

2026-10-26，逐项查看修复、对应断言和实际命令结果后关闭：

| 编号 | 修复与复核 | 状态 |
| --- | --- | --- |
| ER-01 | 正文勾选状态改变重置原/工作正文、工作版本及章节；NI-S06 从 patch 后取消正文，再按纯资料导入，正文为空、章节0。独立复现 `deselected_body_working_characters 0`。 | 关闭 |
| ER-02 | 合并 source+source 时同时保留两份完整资料文字与引用；NI-D05 检查互补材料均在结果中。独立复现 `source_merge_retains_both true`。 | 关闭 |
| ER-03 | set-chapters 调用完整失效逻辑，清 artifacts/coverage/decisions/grant 后进入 confirm；NI-S03 在失败后改章界，验证这些结果不会沿用。 | 关闭 |
| ER-04 | 完整引用目录留在worker用于校验，发送只包含当前名称/上下文/证据命中的实体及其父级闭包、相交章节；章节带全书index，不在分片里重新编号。NI-A02覆盖1000无关实体仍可发送、最后一章index99、相关实体父闭包。独立复现不再触发目录预算失败。相关数据自身仍超预算时明确拒绝，不截断为成功。 | 关闭 |
| ER-05 | 明确排除性格、外貌、人物背景等原有字段名，并保留在所属人物资料；NI-D04及独立合成复现结果均只一位沈砚。 | 关闭 |
| ER-06 | choose/append 在修改会话前核验累计项数、字节与文字；NI-S01用49+49MiB后再追加3MiB，明确拒绝且旧清单不变。 | 关闭 |
| ER-07 | 读写统一1GiB上限，保存前按UTF-8实际字节编码验证，超限回滚旧checkpoint；推断结果另设累计5000万JSON字符限制。NI-S08用缩小注入边界验证等号可保存、字节超限拒绝；NI-D06覆盖派生结果容量。未声称执行过1GiB整本性能或内存压力验收。 | 关闭 |

额外核对 NI-D01：标题“第一章 部落少年”中的“部”不会再误判为卷标记，章界保留。

复审执行（仍仅本次功能范围）：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test tests/unit/novel-import-files.test.ts tests/unit/novel-import-integration.test.ts tests/unit/novel-import-domain.test.ts tests/unit/novel-import-ai.test.ts tests/unit/novel-import-session.test.ts
```

结果：33 tests / 33 pass / 0 fail，约3.27秒；其中领域/AI/会话21项全部通过，另12项只覆盖解析器和接线交叉边界。入口定向配置 `/tmp/shakeink-import-entry-tsconfig.json` 的 `tsc --noEmit` exit0。实现方保留的定向红/绿证据见 `evidence/engine-*-red.txt` 与 `evidence/engine-green.txt`；没有运行全仓用例。

为独立 runtime 复审补存原始日志，重跑完全相同的33项：33/33通过，exit0，约3.43秒，见 [最终定向日志](evidence/files-integration-engine-final-green.txt)；[入口类型检查日志](evidence/files-integration-typecheck.txt)为exit0，内附实际定向配置。

解析器跨边界复核也已闭合：DOCX文本框为独立附件且部件范围连续；PDF的扫描图+页码不能冒充全文；重新验证来源时持久比对初始父目录链，父被替换、叶inode/hash/时间戳相同仍拒绝。相关代码由主代理及另一子代理独立审核，本文只记录交叉验证结果。
