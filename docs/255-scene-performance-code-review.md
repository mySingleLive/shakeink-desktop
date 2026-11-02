# 场景七分钟实施独立代码审核

日期：2026-10-31。审核者：独立子代理 `scene_review`。对应253/254方案及用例审核。阅读产品增量、计时驱动及合成测试/日志；未读取真实小说、模型配置、Key、响应或私有journal。

## 结论

**当前实施通过独立代码审核，可以继续已有授权范围内的R8真实新会话验收。** 独立定向测试22/22通过；本记录没有认证七分钟实测成绩，也没有认证真实全部场景或发布重开成功。

## 产品核对

- `desktop/service/novel-import-ai.ts` 仅将semantic/analyze/entity/scene加入既有提取轻量策略，按新用户硬指标覆盖此前scene默认thinking的实施选择。复用 `importRosterModel` 按提供商现有规则合并单次providerOptions，原resolved/options和保存配置未修改；model引用、store:false及其它已有选项保留。普通scene分析、review/reconcile、item/world仍保持原策略，角色/roster旧策略保持。
- `desktop/main/novel-import.ts` 的scope缓存条件由verified character entity扩至verified character/scene entity，其余调用继续完整hash。共用缓存仍首次校验完整hash等于grant，既有session对象/id、epoch、workingRevision、grant对象/hash失效键不变。每请求payload hash、来源/模型授权、预算、目标/父级/证据及原生资料门仍执行，缓存不保存AI结果或完成进度。
- 场景自由instruction目录仅取目标及本次units中名称/别名命中条目；从已选目录补齐父级链。实现使用 `for...of` 遍历同一数组并在Set去重后追加父级，新增父级也会继续遍历，因此可到完整祖先闭包且不会因循环无限追加。完整request.entities及原units/证据选项/四原生字段保留，未改变scene合并算法、31路池、runtime容量或写失败/取消门。角色原目录过滤行为保持。

## 独立执行

Node v24.18.0：

`node --import tsx --test tests/unit/novel-import-scene-performance.test.ts tests/unit/novel-import-character-scope-cache.test.ts tests/unit/novel-import-scene-scheduling.test.ts tests/unit/novel-import-character-commit.test.ts tests/unit/novel-import-character-performance.test.ts`

**22/22通过**，0失败，约12.3秒。`node --check scripts/run-lotm-wizard-import.mjs` 和 `git diff --check` 通过。未运行全仓测试。

已读取RED/GREEN日志：RED9项4通过、5失败涉及scene缓存未启用/错误grant仍发AI、模型策略与无关目录；主代理GREEN22通过。独立结果按本段命令记录，不把重复运行当作额外新增测试数量。

- SP-01确认scene提取轻量选项、原对象/保存配置未改、普通分析/其它实体不受影响。
- SP-02用33地点、祖先链及无关目录实际controller→runImportAi路径，验证完整可信目录保留、自由目录集合精确、原单位范围/文本及可定位选项保留，最终text/四字段/父级/证据/来源逐值一致，全部可映射、无skipped/dropped。
- 参数化CP-15真实64场景计算一次scope、每请求payload hash独立，unverified/普通分析不走缓存；scene冷/热错误grant均零AI调用。共享缓存生命周期键变更与不匹配计算不落缓存测试通过。
- SI-07精确31pending/runtime/proof、暂停排空后resume64完成，角色/场景各3项慢写合批/暂停barrier/写失败停止，以及既有角色性能/策略/取消测试同时通过。item/world4、图片2源码配置未改；没有用未运行的其它类别业务替代实际验证。

两条非阻塞测试补强建议：SP-02可再明确构造“当前材料仅出现别名、规范名完全不出现”的远处地点并断言因alias保留，以独立保护别名分支；SI-07c可额外记录scene暂停前后scope compute由1变2，以直接保护真实scene epoch失效，现有共享缓存生命周期测试与scene取消路径分别已通过。这两点未发现产品实现错误，不要求为此改动已冻结R8产品构建。

## 计时驱动

`LOTM_SCENES_ONLY` 强制启动时current为空，旧进度不能获得新时钟。起点在点击授权识别之前，使用 `performance.now()`，另记录scene导入按钮单调起点。终点在首次观察verify时，核对journal中全部候选/任务/资料精确ID、全done、完整coverage、父级、映射、章卷及正文hash后保存。固定阈值420000ms，不以entity阶段耗时替代全阶段。

初审发现verify分支先round再比较，会把420000.1—420000.49ms的越限误判通过。**已修正**：durationMs与entityDurationMs直接保存原始未取整单调差值，pass使用原始durationMs<=420000；顶部超时分支也用原始差值判断，round仅用于失败现场显示。阈值相等通过、任意大于阈值失败，缺起点失败。

超时保存私有现场、exitCode=4并break，不继续发布；verify首次观察若越限也break4，不能被后续completed覆写0。只有完整性与性能都通过才继续正式verify/save。全部资料导入完成证据和最终发布/数据库重开证据仍分别保存；七分钟通过不替代正式发布及重开逐项比较。

真实识别数量、最终耗时、失败/跳过及数据库结果须待R8实际运行另证；R7基线未完成/超时结论不变。

## R8后SP-05：固定控制元数据及JSON边界代码复审

已先复审253/254的SP-05补充方案及可用外键提示小补充，再阅读实际产品增量和RED/GREEN。**SP-05及提示补充实现通过独立代码审核，可继续已有授权范围内的R9新会话实际验收。** 未读取R8私有响应、正文、配置、Key或journal，不据其静态错误标签猜测具体坏值。

### 产品边界核对

- scene entity在 `indexedArtifact` 的严格facts字符串record及其它artifact结构解析成功后，才构造可信默认 `entityType:PLACE`/目标目录parentId，再spread模型facts。facts整体缺失/null/数组/数字/字符串不能通过解析进入转换；显式值在最后，错误类型/错误parent不会被默认值覆盖。root目标不补parent；未知字段继续由完整schema2/native门拒绝。
- `selectedEntityTarget` 对scene要求可信目录明确PLACE，缺类型或非PLACE在模型解析/调用前拒绝。目标ID/name、PLACE与parent身份、全目录引用/循环门、四业务字段/text/引文/来源保留；普通scene与其它类别没有获得默认值。
- 只有scene新增生成器两个完整固定消息“模型未返回可解析的 JSON”“模型输出未完整结束”进入现有一次outer字段纠错。第二请求仍在catch之外，实际协议测试分别证明2请求/3生成恢复、2请求/4生成后失败。原网络/权限/取消/预算/持久化边界没有扩大。
- scene专用提示改用字段说明与合法JSON引用形式，说明应用补控制元数据、模型无需复制，显式值仍须匹配。没有示范虚构资料默认内容，四字段/完整text/知识归属与证据协议保持。
- 提示外键字段仅按 `request.entities` 和已有 `request.artifacts` 的可信kind展示；无角色/物品目录时不诱导characterId/itemId，人物信息保留text/attribution。最终schema未改变合法引用接受集合；加入合法角色目录后提示与实际有效characterId均保留，已有上下文角色的提示正例也覆盖。

### 独立复验

读取 `/private/tmp/scene-control-json-red.txt`：修改前13项中8通过、5失败，涉及缺省控制metadata与JSON/incomplete outer恢复。主代理GREEN记录30通过；本审核独立执行以下两组，不合并重复覆盖项计数：

1. scene-wire、scene-entity、character-source-index、character-profile-ai、evidence-rebind五文件：**32/32通过**，约27.0秒。覆盖fields/anchor/json/incomplete四类每目标精确2请求/3生成恢复及2请求/4生成持续失败、非结构错误每目标一次、原角色协议及严格证据门。
2. scene-performance、character-scope-cache、scene-scheduling、scene-entity四文件（含最终提示筛选修订）：**17/17通过**，约11.3秒。SP-05验证已知metadata补缺省、全部四字段/text/evidence不变，显式WORLD/null/空串、另一个已知PLACE父级/外部父级、root多余父级仍拒绝，facts整体非法仍拒绝，目录缺type/非PLACE零模型解析调用。SP-02已补alias-only当前材料正例，确认相关别名条目保留；scope与31条runtime/proof取消恢复同时通过。

`node --check scripts/run-lotm-wizard-import.mjs`、`git diff --check`通过。未运行全仓测试，未把合成测试计作真实供应商验收。

原SI-08缺已确认parent的失败预期按新有界合同改为SP-05补缺省正例，显式错parent负例仍保留。本次只修控制元数据与输出边界，没有清空证据/父级、跳过场景、修改任何文学事实字段或放开未知字段。

七分钟计时与完整性仍须真实整书全部场景、正式发布与正常重开逐项通过。R8提前失败及R7未完成/超时结论不变，不把R9的准备或中途数量写成成功。
