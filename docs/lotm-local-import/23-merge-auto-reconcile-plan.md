# 跨批次同实体字段自动合并方案与定向用例

日期：2026-10-29。状态：用户已选择“代码内自动合并”，可靠性分歧选择“取较弱一级并合并来源说明”；本文待独立审核，尚未实施。

## 问题证据

r7在角色187/5589单元时因56条pending body-body冲突停止（H18）。字段分布：temporalScope 14、occupation 11、personality 9、relationships 9、attribution 9、reliability 4。原因是`mergeImportArtifacts`（`desktop/core/novel-import.ts:200`）对同实体任何非空不同值一律判冲突；分批分析时每批只看到局部原文，措辞、时段、关系清单自然不同。

## 规则变更

仅当`semanticVersion===1`、现有与候选均为`origin==='inferred'`（body-body）、且该字段未被作者锁定时，以下字段不再生成冲突，而是确定性合并：

| 字段 | 合并方式 |
|---|---|
| occupation、personality、appearance、clothing、catchphrase、growthArc（角色） | 按`、；;`拆分为片段，保序去重并集；分隔符沿用旧值中首个出现的`；`或`、`，都没有时用`；` |
| attribution、temporalScope（所有类别） | 同上并集，分隔符固定`；` |
| relationships（角色） | 两侧须均为合法关系JSON数组；按`characterId`或`target`归并，description按片段并集；新target追加；任一侧非法则仍判冲突 |
| reliability（所有类别） | 取较弱一级：客观事实 < 角色有限事实 < 人物推测 < 可能不可靠；任一侧非四值之一仍判冲突 |

不变：roleType、age、gender及其它类别的结构字段（parentId、content、timeValue、chapterIndex、refs、tropeKind等）照旧判冲突；source-source、setting-body冲突、旧版会话（无semanticVersion）行为不变；aliases原有并集逻辑不变。冲突判定之外的证据、sourceUnitIds与text追加逻辑不变。合并后仍执行原有容量检查、`importNativeMappings`和锁定校验，失败即关闭。

作者锁定：`mergeImportArtifacts`新增可选参数`locks`，锁定字段维持旧冲突路径（不自动改写），避免触发`导入作者锁定字段发生变化`。控制器在`semanticAnalyzeUnits`与`semanticPending`两处调用传入当前锁。

## 现有会话的处理

现session中56条冲突按旧规则产生，无法在新规则下重算。经正式`select`操作以相同`selected=['body']`与11类目标重新选择，触发产品既有`invalidate`：清空artifacts/coverage/conflicts，手工确认的9卷1402章按`preserveManual`保留；随后经`set-title`回到确认页。仅丢失约10分钟（2批）角色进度。操作前备份session.json到隔离目录；驱动增加显式开关`LOTM_RESET_ANALYSIS=1`执行这三步，并仍执行原有正文/章界/hash断言。不直接编辑journal。

## 定向用例

| ID | 条件 | 预期 |
|---|---|---|
| MG01 | 两批同角色personality/occupation不同 | 无冲突；片段保序并集，分隔符规则正确；重复片段不重复 |
| MG02 | temporalScope/attribution不同（含worldline、scene各一例） | 无冲突；`；`并集 |
| MG03 | relationships同target不同描述、各自新target、一侧含characterId | 无冲突；按身份归并、描述并集、新项追加；结果通过`importNativeMappings` |
| MG04 | relationships一侧非法JSON | 仍产生冲突 |
| MG05 | reliability 客观事实 vs 角色有限事实（两种顺序）；非法值 | 合法时取角色有限事实且attribution并集；非法值仍冲突 |
| MG06 | roleType、age、gender、worldline timeValue不同 | 仍冲突 |
| MG07 | 字段被锁定 | 仍冲突，锁定值不变 |
| MG08 | source-source、setting-body、旧版调用（无semanticVersion） | 与改前一致（NI-D05等原用例） |
| MG09 | 控制器端到端：两批返回同角色不同措辞 | phase不进入conflicts，completed；单个角色、字段为并集 |
| MG10 | 回归 | novel-import相关全部单测及集成测试（排除H17已记录的13项既有失败）、typecheck、Node 24 `build:desktop`通过 |

## 验收

先RED后GREEN；独立代码复核；备份后经正式`select`重置分析，以r8恢复整书分析。合成GREEN不抵扣真实整书结果。

## 24独审后的冻结补充

- 片段规则改为整值（采纳非阻断建议，替代上文“拆分片段”）：两值NFKC+trim后相等或旧值包含新值→保留旧值；新值包含旧值→取新值；否则`旧值；新值`。无损、幂等，不改写原标点。
- B1原子性：先对候选全部字段求决定，再应用。任一字段判冲突时，本候选所有并集/降级都不应用，只保留原有补空与别名行为（与改前一致）。锁定字段（按`current.id+field`）值不同即判冲突，因此attribution被锁时整个候选不自动合并，reliability不会单独降级。
- B2上限：并集后单个描述类字段>1500字符、relationships>60项或JSON>8000字符时不合并，回退为可见冲突，不静默截断。风险：主角在全书后段可能触顶并暂停，记录实际触发情况，不预先放宽。
- B3 relationships：两侧须为严格`{target,description,characterId?}`数组且单侧target、characterId各自唯一，否则冲突。按characterId（两侧都有）或target匹配；同target两侧characterId都有且不同、或同characterId但target不同→冲突；一侧缺characterId则补上；description按整值规则合并；新项追加。输出键序固定为target、description、characterId，`JSON.stringify`稳定序列化。
- 只有`main/novel-import.ts:652`（遗漏补全）与`:702`（普通分析）传入locks；其余调用均为source或旧版，不经新分支。
- temporalScope并集仅表示“出现于多个时段”，不对应单一时段；复核模型仍可能对并集报冲突，属预期风险。
- B4驱动：新增`LOTM_RESET_ANALYSIS=1`，位于初始phase断言之后、任务按钮与继续循环之前：先把journal复制到本次证据目录，再经`window.desktop.novelImport`发送带当前revision的`select`（原selected/targets/infer）与`set-title`（原标题），随后断言phase=confirm、conflicts/artifacts为空、coverage={}，并用原`assertSession`逐章核对。运行须设`LOTM_SESSION_ID`、新`LOTM_EVIDENCE_LABEL`，不设`LOTM_RESUME_SNAPSHOT`（走ordered-session.json中artifactCount=0、coverage={}分支）。
- 增补用例：MG11候选部分冲突时无部分写入；MG12锁定字段在两个控制器调用点产生冲突而非抛锁错误；MG13超限回退冲突；MG14 relationships交叉不一致/单侧重复失败闭合、输出稳定；MG15幂等及空白/NFKC等价；MG16 paused+pending冲突+manual章节下select→set-title保留章节、清空冲突/覆盖、可重新start。MG01期望按整值规则修订。
