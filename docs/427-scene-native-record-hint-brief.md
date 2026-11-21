# Native record提示超集的窄诊断与条件实现

R56 flat候选实际通过后，单函数WIP `f2e1df29…` 的完整历史预算仍有3例失败，已精确定位为`payload.length+schemaBytes<=245760`门，缺口300/1011/1323B，非fixed/context。只删冗余约束约省203B不足。本稿采用明确的Native-only advisory superset：单个type=object record保全部6个typed properties（mentions/context/links/name/aliases/primaryMentionIndex）与所有原字段上限/数组证据限制，required仍为3个完整数组，additionalProperties=false。仅metadata的成对/互斥关系由**现有且字节不改**的本地strict三branch schema继续裁决，不新增程序接受。

先做PRIVATE两例，每例一次、finalfetch全局硬2/maxNetworkRetries0/readonlyUsage，复用冻结R54的执行/SDK/mainGateway/161词安全投影/tee/正常quit，不改旧PRIVATE源/CJS、不发送小说。A是R56实际成功flat原2tasks/原prompt/witness，精确前验schemaSHA `c4ec88220c597280f5f01a86996c14acc6adfa74eee28c89df808c166dd48392`、4854B、promptSHA `537c442e7cc719624fc2983b60e8c6c8be2e77e725ab65872c2b05ee93e6d3ba`。当前live函数已改，不能调用旧tuple/reference factories冒旧基线；A从已冻结R49 baseline helper派生或固定synthetic JSON构造，必须逐字hash相同。B的原tuple基线也来自同一冻结构造。

B为新coarse Native，固定5tasks：selection两选项、不可reject的first/primary/legacy三条完整replacement、可reject replacement。共同B witness为`answers:[1,firstRecord,primaryRecord,legacyRecord,0]`；first无任何metadata，primary仅primaryMentionIndex，legacy仅name+aliases，真实验证optional字段确实可以省略。每record所有证据仍为原本地choice编号，choiceCount=3。B schema的选择范围/0分支及数组长度完整保留；不自动补metadata、不选首来源。A/B prompt和任务不同，不称单变量对照。所有例先本地完整Ajv见证及原tuple对应位置验证，正控与新Native超集反例分别记录。

静态实际门：A正常通过且B HTTP2xx/stop/完整直接JSON/新Native schema通过/冻结原R49对应tuple通过/与B witness结构深等/delta=SDK，wire type/strict/schema/inputSHA及只读/正常退出/保护hash均正确后，才能进入下段条件TDD。失败/不确定不补试、不改产品。新Native允许partial或mixed metadata只是提示超集，不能当它们被本地接受，也不能宣称Native约束可靠。

实际支持门满足后仅修改`sceneRosterBoundNativeSchema`一函数：共用一次3数组字段，将原name/aliases/primary的完整typed定义作为可选属性，省去3个完整record副本；selection、显式0和全部其他属性/上限保持。原本地record strict三分支、按task位置decode、旧repairs roots、source/full/canonical/retention/owner/版本门、四代/模型/thinking/cap/原材料一律不动。Native接受集明确是原preferred union的superset；原所有合法形式必须仍可表达，原所有非法metadata仍须经真实业务桥拒绝，不以新Native schema替换本地schema。

冻结前必须证明：partial name-only、aliases-only、primary+name+aliases先过新Native Ajv，再经真实generateImportAiJson/runImportAi+SDK桥被原strict程序门拒绝；unknownkeys在Native和程序两门都拒绝。三合法形式正控保完整锚点。原CI16K、2/3/4实际prompt/schema边界及完整130 first+R46 77/R47 59历史代预算全部零API重算，不升245760/65536/16384/v1余量、不裁任何材料/draft/current/choices/keep/任务。只有全过和产品独审后root才normal全文；目前WIP预算未过，禁止normal。

新PRIVATE交付`dist/review/scene-native-record-hint-probe.cjs`、同前缀manifest、`run({root,destination})`、`native-record-hint-r58-UUID`。静态R58保护是root明确的当前WIP快照`r58-protected-wip-build.json`（57sources+8bundles+303renderer=368），状态须写budget-failed/not-normal-approved，构建/运行前后同该快照；不能假称当前已build WIP与R49旧manifest hash相同。旧历史PRIVATE源/CJS保持原hash。429独审后root才实际两次并记录430，满足本节条件后可直接已审单函数TDD，无需重复同一方案。
