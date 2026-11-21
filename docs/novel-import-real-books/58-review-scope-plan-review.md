# 审核分包与旧信用重建方案独立审核

日期：2026-10-26。审核者：`remaining_books_oracle`。审核57及已知payload、controller、确定性审核任务实现；未编码、执行测试、操作应用／模型／用户库或真实journal。

本次57 SHA-256：`a65aa0aeddb214270d6a2f6fec041b29e0c991faa17cfa5a559083e51e60dfd3`。

**当前生效结论：最终技术方案PASS、限定用例PASS。** 绑定最终57 SHA `9f20dfbebb316f49048af88a03c391e5828ee6f3039e5dd979278d6252693289`，全部方案级P1已关闭，详见文末最终增量记录。

**首轮历史结论：技术方案／限定用例暂不通过。** 当时两项P1需先具体收敛；认可问题定位与窄修方向，未批准按首轮文字实施。以下保留初审及增量历史，没有泛扩测试范围。

## RS01（P1）：片段范围说明缺少可信完整性信息及真实缺字段路径

现`iterateImportReviewTasks`将完整artifact拆成多个text片段，以及每片仅一个facts键的任务；正文review的`contextArtifacts`还可能把长text置空。模型只见片段时，无法知道某键在完整对象中真的缺省，还是本片未传。57说“不以目录存在推断所有字段完整”是正确要求，但仅补一句范围prompt不能让模型取得这个事实。

同时，57只允许目录不存在的新实体进入missingTargets，conflicts又仅允许真实互斥事实。已有实体的有据缺字段／缺内容于是缺少明确处理路径：既不能当作新实体全量重生，也不能因为目录存在而直接忽略。真实缺实体丁举人／丁家与前18项假“实体未生成”需要分开，但不能以修假遗漏为由屏蔽真实字段缺口。

最小修订要求：

- 为当前审核实体附**可信、预算内的完整性scope摘要**，由controller从完整对象构造，而非让模型猜测。至少绑定artifact id／当前semanticHash、完整facts键集合、完整text长度，以及当前包包含的字段／片段范围或明确的context/text-piece/fact-piece类别；标明entities是相关目录子集，不是全书不存在的证明。摘要完整计入requestFits／固定prompt／最终发送预算，不能截断。
- 明确真实已有实体字段缺省的可审处理路径。例如利用既有作者冲突／字段决定路径报告“当前字段缺省且源文有据的补充建议”，保持原值／缺省状态并等待作者；不能因需要补字段就重新生成整个kind。若选择其它既有路径，也须写出其目标ID、缺省依据、保留字段及确认门。不得把未知可选值机械填满。
- 真正text内容是否全局缺失，不能只用本片不含来证明。只有完整性信息与实际提供材料足以确认时才作缺口判断；不能确认的片外内容须保留范围限制，不能宣称已全量验证或一律无遗漏。目录存在也不证明字段／内容完整。
- 遗漏reason／evidence为不可信资料。拆包须明确完整遗漏范围与本请求允许unitIds的区别，每片精确证据不得越过本包源单元或变成截断引用；budget失败须在发送前阻断，不能退回泛化补全。

R01应增加一个已有实体的正反对照：同一字段“完整对象有但当前片不带”不能是假遗漏；“完整对象确缺且原文有据”必须进入明确补充／作者确认路径。另保留真实新实体可补、本包text为空而完整text非空不判缺失、摘要绑定／预算／reason与精确证据测试。不能只匹配某句话就宣称语义质量通过。

## RS02（P1）：版本升级与旧pending冲突的授权／提交顺序不明确

57规定授权后重建旧无决定信用，方向合理；但没有给出可实现的事务顺序和失败边界。当前`start`第336–339行遇pending冲突会提前返回，`resume`第354行同样提前返回；C1恰好已有36个pending冲突。若只在原“preserve／reset”位置加版本判断，当前草稿不会进入新策略重建，可能继续使用已知旧修补结果。

当前start还在最终consent检查前准备正文／工作单元／预算及models；launch先于act外围save。新增会清空分析信用的迁移不能沿用这种顺序而笼统称为“授权后原子”。必须明确：

1. publication恢复保存保持优先，仍校验原plan hash／原目标身份，不迁移已发布内容；legacy和零AI不走新策略。
2. 识别旧策略需要重建时，在旧pending冲突早退之前进入同一受控升级门；必须取得本次明确consent，并通过模型、来源、原保存目录、预算与目标检查。旧grant／retry不能悄悄授权清信用重建。
3. `decisions`或`semanticState.locks`任一非空即固定安全拒绝；不先清冲突／锁再判断，不修改任何作者决定或信用。不论是否已有pending冲突都适用。
4. 在克隆上准备全部重建、sourceImportArtifacts及新版本标记，完成校验；明确持久化提交点，成功后才启动工作。预检／编码／持久化失败不得半清原内存信用、只标版本2或启动AI；若提交后发生错误，也需有明确恢复边界，不能冒称旧信用未变。
5. 同版本2的失败／重开保留完整成功信用与目标限制；版本2必须与合法分析检查点绑定，不能仅因收到start就无条件盖章。

R02需通过实际重开／授权路径覆盖旧**有pending冲突、无决定／锁**的草稿重建，而非只测干净旧草稿；无consent／模型／来源／原目录拒绝及迁移持久化失败必须0AI并保留原信用。另覆盖决定与锁各自阻断、版本2完整保信用、publication原恢复保存及legacy／零AI。原正文／边界／章节／工作版本／目标／预算断言保留。

## 其余已认可边界

补全传入具体reason／证据并沿用既有目录、预算超限不截断、冲突checkpoint后立即停止后续补全／reconcile／世界线／发布，均与实测缺口对应。semanticWorkflow必须同时尊重phase与stage返回，不能只在内层设置conflicts然后外层继续。

真实177只保留33项数量，3角色facts已变化、36冲突、部分覆盖失效；57如实记录这些失败，未把数量相同冒充产物不变，也未改oracle或注入163快照。本轮不重新审真实模型文本，且不将prompt修订推定为真实文学质量通过。

## 命令范围与后续

上述必修应在R01／R02内部收敛，不新增suite；仍仅允许57的三条精确命令，本文未执行：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-R0[12]:' tests/unit/novel-import-semantic-session.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM(?:08|10):' tests/unit/novel-import-semantic-session.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM04:' tests/unit/novel-import-semantic.test.ts
```


旧合成用例若需版本字段适配，先报告具体失败，只补原检查点策略版本，不删减恢复／两轮／锁／正文断言。修订方案和用例再独立复审，通过后才能进入TDD、冻结代码审核和真实同C1重测。rev177失败继续保留；整书、发布和其余真实用例仍不得记通过。

## 增量复审一

57修订SHA：`f130b6a4485a7780e2edb7469890f562fa5680a89657a0c58fcdd9050888be8f`。保留上文初审历史。本次仍只读文档与既有源码，未执行测试或真实调用。

**技术／用例仍暂不通过。RS02的方案级授权与提交顺序已关闭；RS01大部分机制已补，但还需下列精确边界，另发现同对象多遗漏排程P1。**

修订版已将publication优先、resume不绕过、新consent／全部预检、旧pending冲突、decisions／locks拒绝、clone准备、先保存后launch、保存失败恢复及未知policy拒绝写清；R02也加入首次保存失败与0AI。这足以关闭RS02方案问题，后续代码审核仍须验证实际事务实现。

reviewProjection及已知实体三元组到reconcile的路线直接解决RS01核心缺口，但实施前还须写清：projection按传输artifact**数组位置**一一对应，同一ID的多个分片不能混用范围；严格验证完整hash、范围、携带字段与当前包一致。三元必须指向本包可验证的projection；缺省字段由完整键集合证明，完整字段／text内容缺口只能依据实际完整材料，不能由局部text推断全局不存在。片外未知不应被标成已验证缺口或补全成功。

### RS03（P1）：同对象多项遗漏不能被既有repair去重丢失

当前semanticRepairs第390行按artifactId＋baseHash已有repair即continue。新增三元遗漏若同一对象有两个字段、不同extra unitIds／reason／evidence，直接逐项调用该函数会让第二项被跳过，却仍可能将omission标done。只扩展extraUnitIds参数不足以保证排程完整。

最小要求：按artifactId／baseHash汇总所有字段缺口、理由、精确证据和extra unitIds后可靠建任务；遇已有pending／committed repair时明确增补新增工作，不能静默continue。原original／baseHash及已完成任务信用不重写，新任务／完整元数据先过容量和payload预算。每个omission的done必须以其所需任务已完整可靠安排为前提，ready仍须所有任务done／repair committed及最终复核通过。

有三元时omission key必须加入artifactId／field／baseHash，避免同证据不同字段被旧key去重；无三元的新实体key与既有任务几何保持原式。R01须覆盖同对象两字段、两组extra来源与理由、不同key、已存在repair时不丢新工作，以及锁／无关字段保留和预算拒绝无成功信用。

本轮认可为上述直接合同增加semantics／semantic-state／review-tasks／service校验接点，不泛扩到网关或其它业务。最新直接回归由SEM08／10增补SEM09保护零AI，最终仍为以下三条，本文均未执行：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-R0[12]:' tests/unit/novel-import-semantic-session.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM(?:08|09|10):' tests/unit/novel-import-semantic-session.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM04:' tests/unit/novel-import-semantic.test.ts
```

## 最终增量复审与关闭记录

最终57 SHA-256：`9f20dfbebb316f49048af88a03c391e5828ee6f3039e5dd979278d6252693289`。**技术方案PASS；限定用例PASS，无剩余方案级必须修订项。** 允许仅按该已审版本及其七个直接合同文件进入原限定TDD，随后冻结代码独立审核；不代表实施、合成GREEN或真实C1质量已经通过。

- **RS01关闭。** projection与传输artifacts按数组位置对应，同ID多片不覆盖；只新语义review带该可选合同，完整hash／长度／键集合、当前range／fields均由可信完整对象产生并严格校验、完整计入预算。已知三元仅指向本包可验证projection：缺省键有全对象键集合证明，已有字段必须实际提供完整值，text须完整范围或无缺口覆盖全文才能提出内容缺失。局部片外未知不能获得全局不存在或缺口验证信用；source/raw与锁定字段拒绝定向改写。新实体与已有字段缺口已分路，后者只走原稀疏reconcile，保留原对象／字段／锁。
- **RS02关闭。** publication原恢复优先，旧pending冲突早退前统一策略门，resume不得绕过；本次明确consent与模型／来源／原目录／预算全部预检后，才在clone准备旧无决定／锁信用重建。首次候选持久化成功后才提交和launch，失败不半清、不标新policy、0AI；决定／锁／未知policy拒绝，同版本2、legacy及零AI行为保持。R02已具体覆盖这些路径。
- **RS03关闭。** 同artifactId／baseHash先汇总全部字段、理由、证据及extra units；已有pending／committed repair不能静默跳过新工作，须增补上下文任务并保留原key／done／edits。新增omissionKeys进入新任务指纹，实际请求取得第二套reason／evidence／field，extra units实际进入任务；原original／baseHash与原无遗漏任务几何不变。容量／完整payload先在clone预检、可靠任务计划持久化后才标omission.done，ready仍需全部task done／repair committed与最终复核。

补充的两项直接保护也认可：新实体ordinary补全在merge前硬拒现有ID及本批重复ID，已有对象只能走三元reconcile；policy2遗漏key加入reason，已知实体再加入三元，避免同引文不同实体理由或不同字段丢失。不同ID触发原身份合并／事实冲突仍用原门并立即停，不扩同名身份算法。改述重复仍受seen及全局两轮上限，不新增重试。

R01覆盖双字段／双extra证据、已有pending／committed任务增补和旧done信用，R02覆盖授权／迁移／冲突立即停；直接回归最终为SEM08／09／10及SEM04。仅认可增量一所列最新三条精确命令，未授权其它suite或削减旧断言。必要旧合成检查点版本适配仍须先报告具体失败。

本次最终复审只读方案与既有源码；没有实现、执行测试、操作应用／模型／用户库／journal。首轮及增量一的NOT PASS完整保留，后来关闭不回填为最初即通过。rev177真实失败、原文保真及后续同C1重建／完整复核／发布／独立文学质量边界不变。
