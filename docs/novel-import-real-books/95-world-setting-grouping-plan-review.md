# 世界与设定归属修复：独立方案审核

**当前结论：94最终版技术方案PASS、限定用例PASS，WG-TR01/02/03全部关闭，无剩余P1/P2。** 最终绑定SHA与增量关闭依据见文末；首轮暂不通过记录保留。

日期：2026-10-26。首轮结论：**暂不通过，WG-TR01/02/03为P1必修项**。新导入通用指导方向可接受；旧作品修复须先将下列数据边界具体化，再授权实现。本报告不要求新增UI或向用户重复泛化确认。

## 身份与范围

审阅94，SHA-256：`26044c51cb0df196b4fcca85a0fe5bffea55500e867e510957f218b36e19b8aa`。只读已知publisher、World/Setting与审计/引用schema、content-commit/world-guard、Workspaces/context/lease及既有审计CLI接点。CodeGraph工具不可用，未另建探索代理。未实现、运行测试、连接实际数据库或操作应用/模型；截图数据匹配及限定用户授权依据主代理说明，未自行读取旧实际run。

当前typed publisher确实分别创建World与Setting，legacy逐条创建World。用户本次针对唯一旧测试作品的数据类型纠正可作为明确例外，不能扩展为其它legacy作品自动迁移，也不改原NOVEL_IMPORT、journal或文学FAIL。

## WG-TR01：封闭依赖检查及事务删除边界（P1）

“无其它引用/用户编辑历史”目前未形成可实施的封闭检查矩阵。World.children和Setting.world均为onDelete Cascade；此外PlanningDocument的worlds[].worldId是JSON引用，StoryArtifactLink是键引用，TextComment/PreparedTextChange/TargetTextRevision/Review/ContentVersion/ContentMutation/候选及其它目标记录存在无FK的标量引用。ContentVersion和TargetTextRevision没有novelId，不能通过泛扫所有快照证明无引用，也不能只查World/Setting外键就认定安全。

94须按锁定schema/相关服务明确：哪些关系/typed JSON/targetType别名及键需要检查、查询如何只读目标行或目标ID引用元数据、哪些预期原导入审计允许且须hash不变、未知/无法解释结构如何阻断。跨novel引用须有数据库约束证据或仅返回exists/count的定向检查，不能一边只查own-novel、一边宣称跨作品不存在引用。正文/任意文字里的相同字符串不应被随意解释为外键。

apply/rollback事务内以固定锁顺序重读所有相关前提，CAS覆盖完整七行及日期、所属作品和准确集合；明确目标初始World集合是否必须恰为七行，新ID/重名冲突、准确插入/删除行数及无级联副作用。rollback必须验证新增容器/Setting当前值、版本/日期、无新依赖及原ID未被占用，失败不得删除其它数据。WR02应增加真实JSON世界线关联、标量评论/修订/来源边及跨作品引用等代表性反例，不能仅测试子World/Setting。

## WG-TR02：具体CLI授权、输入预算与数据库准入（P1）

“命名run、显式计划、ready/租约”还不足以限定可执行工具。须给strict typed计划/CLI schema：唯一允许run/work/novel/导入request与hash的多重绑定、七个旧ID及完整基线、新行/类型、稳定ID映射、operation/plan hash、dry-run/apply/rollback参数规则及所有输入大小/行数/嵌套预算。不能接受任意数据库路径或仅凭调用者自报owner打开另一作品。

须明确计划、来源绑定、目录/品牌/catalog/迁移资源、run输出的regular/O_NOFOLLOW/nlink、bounded read、前后identity及wx锚定；在任何引擎打开/复制或初始化前拒绝坏身份。应用已关闭的可信证明、restart竞争与整个CLI期间独占目标writer lease如何成立、如何禁止窃取活锁、finally如何关闭和释放也需具体。

现Workspaces.initialize可mkdir/初始化marker和inbox，connect即使create=false也会调用migrateDatabase；仅说“沿用Workspaces并核对迁移指纹”不能证明dry-run无初始化/迁移副作用。须明确既有ready-only入口、精确已安装迁移账本及资源指纹校验、缺/多/错迁移拒绝且不迁移、不create/seed/inbox/globalDB。允许必要窄入口时应列入实施范围并单独审核，不应暗改通用打开行为。WR02需实际验证活锁/错误品牌/别名/替换/迁移差异在数据库准入前拒绝。

## WG-TR03：提交点、幂等及恢复权威（P1）

数据库事务不能同时原子提交外部wx证据。94须明确：apply前完整前快照/预览写入并sync失败则零业务写；数据库commit成功后外部after/回执导出或ack失败，不得误报“全部回滚”或重复转换，须从数据库专属不可变snapshot+receipt恢复结果并以新独占尝试补导出。必要的提交后身份复核失败也应保留已提交状态，不退回旧内存认知。

完整before/after应存修复专属ContentVersion；ContentMutation沿用有限回执/hash/快照指针，不把完整正文再次塞进其result（schema注释明确其不存正文）。定义canonical hash/日期编码、事务内快照与回执绑定、相同operation/plan幂等查找顺序及后续编辑时“只返回既有回执、不重写”。rollback单独operation绑定父回执，精确after CAS、恢复原ID/日期且另记不可变回执；重复rollback及rollback后重放apply的行为须明确，禁止悄悄重新应用。

WR01/WR02应在原编号内验证commit前与commit后导出失败、确认结果丢失后重放、重复rollback、用户后续编辑/依赖增加、ID占用/计划变化，不增加测试suite。

## 通用指导与限定范围

world固定指导可通过普通kind=world、reconcile.targetIds对应实际world artifact、review.selectedTargets含world三个条件加入；不能因旁带World上下文或普通其它kind全选world而触发。单世界中性容器与SETTING/worldId分类可提示，真实多世界及父子世界仍按来源保留，不用书名/标题/关键词决定类型，不放宽native/图门。

A10须真实runImportAi捕获固定段与三正/反路径、原payload/信号/角色/预算；A07–09及现有golden不改，若冲突应先报告原因。SEM-P01仅证明当前typed publisher回归，不是旧作品真实修复证据。复用原业务面板无需新UI批准。

94列出的三条精准命令和RB-WORLD-FIX01范围可以保留，但须在上述方案/WR01/WR02补正后才进入限定TDD/代码审核；本轮未执行任何测试。实际修复须另有dry-run预览、事务/完整回执及真实重开面板证据；原小说、旧审计/失败结果、S02草稿及其它作品均保持，不能用本修复升级整书或LIFE通过。

## 增量复审：三项P1关闭，最终PASS

94首轮补正版 `25bbf848e8088bbf272e9ac59ecb1179099bc821ec553ad13cdf79bfbcbdbb98` 已补充封闭矩阵、CLI准入和提交边界。随后仅强化完整计划输入，最终SHA-256为 **`b675a51d769ef0f29e07c16131698f7caeef5567493dabb37bd838ab65f55597`**。本报告技术/限定用例PASS绑定该最终版本，不绑定未来漂移版本。

- **WG-TR01关闭。** 明确单work client及owner/导入绑定、Serializable、operation→world-tree→novel/World行锁，事务内复读完整七根World集合及日期/hash，精确删除count7。矩阵覆盖FK入边、validatePlanning的typed worldId、保守来源边键、有限targetId/chapterId历史与候选、SopPlan/CascadeJob存在即阻断；跨novel入边仅计数、无novelId表限目标ID、不读其它作品正文。rollback复用矩阵/CAS并验证本次after，保护其它内容和原NOVEL_IMPORT hash。
- **WG-TR02关闭。** strict有界typed计划、五方身份与原源hash、完整expectedWorlds七行/严格ISO、导入与保护hash、显式新8ID/互斥及占用拒绝，8MiB/字段/条目预算及canonical operation绑定已明确。CLI不得调用Workspaces.initialize/run/connect或migrateDatabase，不创建/seed/inbox/global库；只解析既存active存储，打开后先SELECT完整已安装迁移账本精确相等。关闭证据、执行前核对和全周期原writer lease并用，活/残留锁均拒绝；唯一既有文件范围扩展为给lockDirectory声明增加export，函数体及正常连接路径保持。regular/O_NOFOLLOW/nlink、前后identity及run内wx边界保留。启动/WAL和lease可能写入，方案不再冒称物理只读。
- **WG-TR03关闭。** before/preview先wx+fsync，否则零业务写；完整before/after仅专属ContentVersion，ContentMutation为有限hash/指针/映射。DB commit为持久事实，导出/ack失败只记已提交导出失败或确认未知，通过同operation回执恢复，不假rollback或重复建实体；新label补导出不覆盖证据。独立rollback operation、严格after CAS/新依赖拒绝、restored/drift/计划冲突与回放行为明确，并纳入原WR02故障验证。

无须新增UI或重复泛化用户确认。上述PASS只允许既定限定TDD及独立代码审核；真实DB执行仍须已审核代码、具体dry-run计划与前快照及全部准入条件具备。代码审核须核对引用矩阵只取必要元数据、rollback排除本次已知Setting自身合法入边且拒绝新增入边、lease函数体原样，以及commit/export失败不伪报回滚；这些是批准边界的落实，不是新的额外scope。

A10/WR01/WR02及仅SEM-P01三条命令范围不扩，旧A07–09预期不改。真实RB-WORLD-FIX01须逐项记录旧七条转Setting的无损对照、原其它业务/审计不变及面板重开；旧文学FAIL、S02草稿与其余真实小说目标仍保留。本轮增量只读修订并更新本报告，未实现、执行测试、连接实际DB或操作应用/模型。
