# 审核分包与遗漏补全范围修复方案及限定用例

日期：2026-10-26。状态：58初审提出RS01/RS02后补充，待复审；未改代码、未重试模型。

## 实测问题

C1 rev163已生成33项、12类各覆盖3工作单元，金手指明确未找到，但尚无事实复核/发布通过。rev167报告20项遗漏，其中前18项理由明确为“entities已有、artifacts未生成”；独立核对对应叙述者1、后房场景1、文风7、伏笔2、泪点1、世界事件3、叙事3在163及167同ID/kind/text/facts均已存在。最后2项丁举人与丁家是实际独立实体缺口；存在实体不代表其全部字段质量正确。review正文包由contextArtifacts挑选短上下文，artifacts是有损子集，entities则是已生成实体目录；事实包本来也是确定性分片。现有正文审核指令没有明确这一差异，模型把当前传输包当成全书产物。

遗漏补全调用只收到“补全所选目标”的泛指令，没有收到遗漏reason/evidence；模型重新生成同类已有实体。rev177以“模型实体标识与原类型或父级身份冲突”失败，33项数量不变，但3角色facts已变化，36项body-body冲突，世界线/叙事各只剩2单元覆盖。不能声称33项原值不变或所有缺项是假缺项。丁举人等实际缺实体及既有事实缺字段仍须审核。

不可覆盖失败证据在外部C1目录：`semantic-repair-failure-checkpoint-rev177.json`，SHA `b6a0ffbaecd83eaf590addc5617a09c054c2543fef0c127a529b14fb59a216f0`。正文2723字符/b636不变、未发布。不会回写journal、注入既有163快照或改oracle来撤销失败。

## 范围与行为

直接合同范围：`desktop/core/novel-import-ai-payload.ts`、`desktop/core/novel-import-review-tasks.ts`、`desktop/core/novel-import-semantics.ts`、`desktop/core/novel-import-semantic-state.ts`、`desktop/main/novel-import.ts`、`desktop/service/novel-import-ai.ts`、`tests/unit/novel-import-semantic-session.test.ts`。共享ImportAiRequest已经组合SemanticRequestFields，优先不改shared主文件。不改网关、模型、预算几何/上限、解析器、发布、UI和legacy分支；service只补新增可选合同的校验，不改既有生成桥/纠正次数。

1. 新语义review固定契约明确：entities是已存在实体的**相关目录而非全书目录**，artifacts为当前有损上下文或完整材料的片段；不能以实体不在本包、text为空、某facts字段不在片段为全书缺失证据。新增预算内可信`reviewProjection`，每个传输artifact对应artifactId、当前完整对象semanticHash、完整text长度/完整facts键集合，以及本片真实textRange与所携带fields；正文包slim text未传时无range，不能标为空全文。事实任务产出同样元数据，实际值必须从完整可信artifact推导，不由模型补写。明确partial；不充分片外内容保持未验证，不能假称已通过。旧task keys/几何保持，新版本政策在start失效旧信用。
2. 已在目录的实体不得再次作为“实体尚未生成”遗漏。已有事实真实互斥仍报告conflicts。扩展missingTargets可选`artifactId`、`field`、`baseHash`三元组，必须同时存在或同时省略：省略只代表真正新实体；存在则代表已有实体的有据字段/内容缺口，field为text或该kind合法字段，hash必须与当前完整对象一致、id/kind必须匹配。字段缺省必须据fullFactKeys确认；不因本片未传而判缺。对完整字段值或本片内容的有据遗漏允许定向修订，不把同kind/unit一概滤掉，也不因目录存在忽略真缺字段。
3. 新实体补全请求必须包含当前遗漏kind、reason、精确evidence和unitIds（结构化嵌入现有instruction，按不可信资料处理），只补所述缺项、沿用已有目录，不全量重建该类。已有实体缺口则只进入既有reconcile稀疏编辑路线：以原完整对象baseHash安排目标及关联闭包修订，证据任务除原artifact证据外还必须包含本遗漏unitIds，实际请求带本遗漏reason/evidence/field，不重建整个对象。可给semanticRepairs增加extraUnitIds参数，不能改写original/baseHash或丢弃既有事实。遗漏标done只表示任务已可靠安排，全部修订/两线/全书复核仍须完成才ready。元数据参与现有完整payload预算，超预算明确失败，不截断证据；所有原来源/锁/稀疏编辑/两轮上限保留，不增加重试。
4. 若一次补全merge产生pending冲突，完成该次原子checkpoint后立即进入conflicts并返回，不继续其它遗漏、关联修订、世界线或发布。semanticWorkflow必须尊重返回阶段。作者决定仍经原有字段锁及一致性复核；不自动选一边消除真实冲突。
5. 对新语义、需要AI的分析检查点记录固定reviewPolicy版本2。策略检查必须在publication优先恢复之后、旧pending冲突早退之前，resume不可先绕入conflicts；只有本次明确consent与模型/来源/原目录身份/预算全部预检成功才能处理旧版本。若已有未发布分析信用但未绑定版本2，且decisions和semanticState.locks均空，则在clone准备同草稿重建，清理不可信coverage/artifacts/conflicts/notFound/steps及semanticState/mappingWarnings，原资料重新由sourceImportArtifacts保留；正文、工作版本/单元、源文件、已核对边界/章节、标题、目标、预算保持。先校验并成功持久化，再提交新state及launch；保存失败回到完整旧state，不半清、不标版本2、不发送AI。不使用外部测试快照、不删草稿；12类重新分析成本明确记录，不能声称旧生成信用保留。
6. 同版本2正常失败/重开须完整保留已成功分析和审核信用。旧版本若decisions或locks任一非空，拒绝自动重建且所有数据不变，固定安全提示，不能静默丢作者决定；未知policy（如3）也保守拒绝而非降级。未授权、模型/来源/目录/预算预检失败不改信用。已有publication走原恢复保存，不迁移已发布内容；legacy、无正文/推断关闭的零AI复制不受版本机制影响。正常选目录仍校验原目标身份，不让新策略绕开原恢复目录限制。

### 58增量复审要求的精确定义

- reviewProjection与传输artifacts**按数组位置逐项对应**，同ID多片不得Map覆盖。只sem1 review传输；严格校验数组位置/ID、完整hash格式与同ID一致性、完整长度和键集合、每片范围与其text精确长度及fields与其facts键一致。fullFactKeys不是当前片fields，完整值均由完整可信对象生产；主进程再对照当前完整对象/hash验证已知遗漏三元。本字段参与现有payload/固定prompt预算，不另开预算或隐式删项。
- 已有实体missingTargets必须指向**本次request中可验证的projection**。facts缺省须fullFactKeys确认全对象没有该键；facts已有则本包必须实际携带该完整字段值。text缺失内容提案须本包携带完整text（单个完整range，或同ID多个range无缺口覆盖[0,fullTextLength)，能逐片核对）；不许拿一段未出现某事推导全文未出现。片外未知不能报告已证遗漏或领取该部分验证信用。正常逐片审核信用只代表本片实际提供内容已被核对，不代表证明所有片外内容不存在；最终真实质量仍以独立原文审读核验。
- 三元已知遗漏只允许修改inferred/confirmed且非锁定字段；source/raw不可经reconcile修改，必须拒绝并保留原资料，不能因semanticRelated排除source而安排0任务再标done。真实新派生内容仍可走不含三元的有据新实体路线。
- 新政策遗漏key在原字段之外绑定reason，已有实体再绑定artifactId/field/baseHash；legacy不新增遗漏行为，旧未绑定政策的信用已走上述安全迁移。这样同kind/同证据指向不同新对象的理由不会仅因引用相同被去重，两个字段也不合并。重复/改述仍受既有精确seen与全局两轮上限，不取消上限。
- 新实体ordinary补全进入merge前硬拒当前已存在的artifact ID（以及本批重复ID）；已有实体只能走三元组reconcile。不能仅靠prompt阻止重复实体重建。不同ID但触发既有身份合并/事实冲突时依原门校验并立即等待作者，不在此扩大同名身份算法。
- **先按artifactId/baseHash汇总全部待处理已知遗漏**，合并字段理由、精确证据和extraUnitIds，再以可信original/hash计划目标与关联闭包。不得继续沿用“相同artifactId/baseHash已有repair就return”而丢掉后续字段/证据。若已有同base pending修订，增补独立新任务，保留原任务key/done/edits；若同base committed且当前hash仍相同，增补任务后恢复未提交状态，不能静默跳过。若当前hash已变，旧三元必须明确失效，不能冒用旧hash。
- 新增任务可持久化可选omissionKeys关联当前遗漏原因；新任务key仅在存在这些keys时绑定其排序指纹，原没有遗漏上下文的任务key保持。即使同unit但出现第二个字段/理由，也必须获得对应的新上下文任务，不能因unit已覆盖便假done。实际reconcile请求按各任务omissionKeys取reason/evidence/field，额外单位必须真正进入任务；不只附在旁边说明。原original/baseHash不改，新增及已存在task的全部提案仍经原完整原子应用/锁校验。
- 规划新增任务/元数据时先在clone上做容量与完整payload预算检查，全部可靠计划持久化后才标相应遗漏done；失败不能留下“遗漏done但新证据没有任务”的状态。R01额外覆盖同一对象两个不同field、不同extra units，以及已有pending/committed任务增补，旧done信用保持且新请求实际包含第二套原因/证据。R02迁移首次save失败须走真正候选持久化接点，不能仅依赖act尾save或在launch后回滚。

## 限定测试用例

新增NI-R01、NI-R02，两者均为隔离合成数据，无真实模型/用户库/Key；先在当前56冻结版真实RED，再最小实现，交59独立code review。禁止全量测试。

| 用例 | 验证目标 |
| --- | --- |
| NI-R01 | 实际controller输出的正文审核包/事实分片projection与完整源对象严格一致、hash正确；显式局部目录/丢弃文本/一键facts等部分传输不假称全文或缺字段。真实新实体遗漏仍可补全，补全请求逐字带reason/evidence/范围；已有实体缺字段通过三元组与extraUnits走reconcile，既有未争议字段不丢，不用ordinary analyze重生成。无效/缺一三元/错id/kind/hash/field/来源拒绝、无成功信用；片外无法证明缺失不当通过。各新增元数据受既有完整预算门；最终复核与原文保真。不能只测一句字符串就宣称模型质量通过。 |
| NI-R02 | 一次补全merge事实冲突立即停，后续遗漏/reconcile/发布0次；旧含pending冲突无决策检查点通过真实重开/授权start在本草稿重建并留正文/源/边界/工作版本/目标/预算。无许可、模型/来源/目录/预算失败、迁移首次保存失败均0AI且旧信用/政策/状态不变；decisions、locks分别非空或未知policy均拒绝自动重建；版本2重开保成功信用、publication恢复与legacy/零AI保持。 |

精确命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-R0[12]:' tests/unit/novel-import-semantic-session.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM(?:08|09|10):' tests/unit/novel-import-semantic-session.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM04:' tests/unit/novel-import-semantic.test.ts
```

若既有用例因新增安全迁移缺省策略而失配，先报告具体失败，仅允许适配合成旧检查点的版本字段；不删减原恢复/两轮/锁/原文断言。没有批准其它suite。必要全项目typecheck、专用audit类型检查、桌面构建另记，不计小说导入结果。

## 真实重测

审核代码通过后正常退出当前应用、构建并重开同C1。保存新build身份及授权前脱敏快照，验证正文/来源/边界/章节/预算/目标未变；通过原UI重新授权原目录和当前模型，在该草稿重建12类，明确保留rev177失败。随后完整复核、作者决策、发布/业务行审计/重开及独立文学审核。prompt合成GREEN不会替代真实遗漏质量判断。其它5书、目录与M02/L02正式LIFE仍未完成。
