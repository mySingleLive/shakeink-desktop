# 同一Native record提示的strict逐调用对照

R58当前control成功，coarse6props/3required候选在strict=true返回400，闭合原因指向required应含全部properties。安装SDK的Responses options明确允许`strictJsonSchema:boolean`，model实现以`??true`取默认并直接写`text.format.strict`；[AI SDK官方文档](https://ai-sdk.dev/providers/ai-sdk-providers/openai#strict-structured-outputs)明确可设false，[迁移说明](https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0)也说明schema拒绝时可禁strict。[DeepSeek当前Responses文档](https://api-docs.deepseek.com/api/create-response/)没有明确strict说明，故不能由SDK支持推接口支持。本稿只准新静态隔离对照，产品仍f2e1 WIP/预算failed，禁止normal。

两例完全相同R58候选B：schema1953B、SHA `a4714f84ef7da4ba3bb488e96dc32430c2c904ee08e2b1c78693b74244039646`，prompt SHA `b42f61b4035d7c8db6bbb743c60ff21212b1866586a33fd39c12453a5857a44f`，5task witness含select/first/primary/legacy/可0。取已冻结R58 case factory（其基线来自冻结R49 literal），不能用已变live旧工厂伪造历史。唯一变量是可信case `expectedStrict:true|false`。真实SDK在native factory强制true**之后**clone resolvedModel及providerOptions.openai覆盖strictJsonSchema；不手改最终HTTP body，不改modelRecord/授权/其它provider选项。只两例各一次、最终fetch硬2/maxNetworkRetries0；同schema/input及其它出站参数逐项核对，只strict布尔允许不同。

新PRIVATE matcher按当前immutable case的expectedStrict精确比较实际wire，既不能继续hardtrue，也不能无条件接受任意bool。schema/inputSHA/type=json_schema、auth/模型/传输绑定原门保留；wrong strict在真实SDK fake出口控制必须fail closed。复用冻结R54/161词/tee/执行/正常退出/700600wx，仅新增matcher的可信strict期望及case调用选项。闭合wire receipt可增加expectedStrict/actualStrict布尔，不记录headers/url/Key/开放错误。当前R58 WIP快照368及旧PRIVATE源/CJS都前后hash相同，所有实际调用仅root在433独审后执行，记录434。

false例必须实际HTTP2xx/stop/直接完整JSON、新Native候选通过、对应5task冻结R49 tuple通过、与witness结构深等、delta=SDK、wire expectedStrict=false/schema/input全匹配，且只读/正常退出/保护门全过，才可下段条件产品TDD。true例结果如实记录，不能为凑因果补试；即使两例都成功也只能记录当前观察，不能宣称strictfalse是所有历史故障唯一原因。false失败/不确定不实施、不重试。该条件明确替换427尚未满足的strict=true静态前提，不回写R58失败为成功。

条件产品仅两处：`sceneRosterBoundNativeSchema`用427已审6typed props/3required数组的Native advisory superset（全部字段上限保留、unknown禁）；`novel-import-ai.ts`服务层generation closure仅在应用已activate并冻结bound repair事务且nativeRoster启用时，逐次clone resolved providerOptions.openai.strictJsonSchema=false。以既有可信frozenRosterRepair/active状态判定，不以prompt文字、schema根字符串或模型自报判定。不改共用nativeSceneModel工厂、不改generate.ts/default、模型、thinking、cap、四代、roles或来源/预算。first、unparsed重新识别、根恢复、无active、entity及其它业务仍用原strict=true/原选项；不得持久化false或影响并发调用。

Native提示接受集仍只是427的superset；原boundRecord strict三branch及旧repairRecord、全canonical/source/retention/owner/版本/作者门字节不改。partial/mixed必须先过新Native再由真实业务桥拒，unknown两门皆拒；原三个合法record、旧roots和0/range局部任务门保持。冻结前原CI16K与完整130first+77/59历史代、2/3/4真实prompt/schema预算全测，不能升245760/65536/16384/v1余量或裁任何资料。全过及产品独审后root才normal全文，不把静态false一次成功当全文或strict普遍可靠。

PRIVATE交付`dist/review/scene-native-strict-mode-probe.cjs`、同前缀manifest、`run({root,destination})`、`native-strict-mode-r60-UUID`；currentWIP保护继续采用root明确快照，状态budget-failed/not-normal-approved。本次不实施fragment tuple替代路线，不动任何当前源，直到独审及实际false全部条件。
