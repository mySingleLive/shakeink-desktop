# 场景清单两阶段native输出：独立增量审核

结论：**限定范围通过，无阻塞，可继续当前冻结构建的只读包及fresh全书真实验收。**360/361已由另一审核者按序通过。审核者仅只读代码/私有脚本、运行合成SDK/HTTP及纯控制，未改产品/测试、构建或启动App、调用供应商、读取小说/真实request或回复/配置/Key。CodeGraph未暴露，按已定位文件审核。

## 核验结论

- `src/lib/ai/generate.ts:187–221`保留原可选string hook；可信object返回只设置下一次jsonOutputSchema和correction，local验证schema、cap、role、model/signal/usage/retry及其余options不变。hook仍从SDK rest剥离，最多首个结构失败一次；传输、取消、quota/用量错误仍在原位置原对象抛出。完整text、finishReason及JSON/Zod继续为最终权威，无第三代或native失败后的文本fallback。
- 新pure `json-output-instruction.ts`只移出旧常量，与R35冻结编译字面量独立逐字比较相同，内容SHA256为`8b480b7d557e46d1e52ab7d8ef067574016ad4714bfa58c441b029266a2f1727`。没有改变generic prompt。
- `novel-import-structured-scene.ts:27–50`共享的能力白名单与旧entity逐条件等价：原provider/protocol、两个modelId、两个精确endpoint及optional TEXT均保持。entity原request/evidence范围未扩；Responses工厂仍保留原modelRecord、snapshot六字段授权比较、main key gateway、超时和其它providerOptions。新roster有独立窄scope，thinking-off/store:false/strict沿既有路径；没有借用entity的32768输出headroom，原未传cap仍undefined。
- pure `novel-import-scene-roster-native.ts`首schema只有preferred first-record，证据严格anyOf原ef/raw/halfopen；次schema只有closed repairs及CF-only。所有对象required/extra关闭，数组沿原容量，schema无源文本/目录/description，返回副本。preferred不是新的本地接受集合：原full/primary/first wire、完整编译/source/canonical、定点权限、稳定slot、保留窗口/owner及main末端门仍执行。
- 首schema与实际JSON wrapper同时进入main planner fits、main派发及worker前门；helper同一份schema实际UTF8进入原payload/fixed/v1门。修复轮在完整prior/choices/反馈形成后计实际次schema，不重复追加wrapper，预算成功后才activate。原65536/16384、v1实际输入+6000、0/未知16000不变，超限首1/次0，不裁资料/schema或提高预算。非eligible helper无新增预算操作。

## 独立实际执行

使用`/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node`，以下13文件同一组实际**293/293、exit0**（NR27、旧CF/保留199、generic/entity/buffering67均已包含）：

```sh
node --import tsx --test tests/unit/novel-import-scene-roster-native.test.ts tests/unit/novel-import-scene-roster-native-budget.test.ts tests/unit/novel-import-scene-roster-choice-only.test.ts tests/unit/novel-import-scene-identity-service.test.ts tests/unit/novel-import-scene-roster-correction.test.ts tests/unit/novel-import-scene-roster-fragments.test.ts tests/unit/novel-import-scene-roster-opaque-reference.test.ts tests/unit/novel-import-scene-roster-targeted-repair.test.ts tests/unit/novel-import-scene-roster-targeted-budget.test.ts tests/unit/novel-import-scene-roster-repair-retention.test.ts tests/unit/novel-import-ai.test.ts tests/unit/novel-import-structured-scene.test.ts tests/unit/novel-import-structured-buffering.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
git diff --check
```

日志`/private/tmp/scene-roster-native-independent.txt`；完整tsc exit0，`/private/tmp/scene-roster-native-independent-typecheck.txt`为空，diff exit0。不与作者324/主代理411或历史组相加。

真实SDK Mock验证首/次responseFormat切换、首答跨fragment literal及重复片段扩大后唯一、完整canonical、CF修复和未传cap。真实controller原stageRequests在schema独立N/N+1处实际1→2包，完整units并集/顺序/文本保留且worker同判；真实SDK捕获的首/次prompt在v1+6000精确N接受/N-1时0或1次生成，纯helper另覆盖fixed/payload及0/未知16000。Responses合成HTTP经过原gateway授权路径，strict JSON、thinking-off/store及cap均实际检查，未请求供应商。

另在`/private/tmp/scene-roster-native-compat-independent.mts`独立执行**4/4、exit0**：原合法full/primary记录仍经native真实SDK首代接受；真实quota check异常保持身份且0 SDK/0 repair；object hook只换次schema，显式cap73及role/model/signal/usage/retry引用逐项保持。日志同名前缀`.txt`。这些是合成兼容正控，不算供应商或额外RED。作者真实RED3为缺首/次native responseFormat及object hook未切schema；pure模块缺失和后来补的planner/精确预算正控不倒填为行为RED。

## 冻结及私有R37准入

| 源文件 | SHA256 |
| --- | --- |
| src/lib/ai/generate.ts | b8a223e81ae0c7dea0b0e39d7799e78717991298636f575217efbbca2a25d652 |
| src/lib/ai/json-output-instruction.ts | 8b34702ce2f43436a42e168c89859ec16f3049cef5e26090a916a88d7f8da2aa |
| desktop/service/novel-import-structured-scene.ts | 3c8be3765324fa0bfe1dae473b1d421fb1c690eb16142328e7497ab74f32d4b8 |
| desktop/service/novel-import-ai.ts | 60701720f3fd401a4cea38f4445641640253b9345855bc063cffcddcfc7a851c |
| desktop/main/novel-import.ts | 701946c4c51559260756e60fa5332d9eff4d7efe1c3dcf17946f25171bc38678 |
| desktop/core/novel-import-scene-roster-native.ts | 1417a86f1e02ab19f56c859b65c994e9de48b635057ee409907eecc9d12dd6c9 |

只读diff核对R37 helper对R35仅production roster selector/flag、另名私有捕获路径及SDK schema存在/字节/hash；原隔离root、只读usage、DB拒写、statehash、实际role及正常quit未改。新runner仅对应request/helper/产物标签，未读其request内容。独立核对93来源及helper bundle hash全匹配，bundle为`132ef38308ef00a7204ac5df39da58afca3c64c25e53886c45b88eb1efdc0100`。

正常full driver对R36仅两处observer-v2→v3模块路径；observer源仍358的`ba23addc…`，v3的21输入/8受保护bundle逐hash一致，观察器逻辑未改。runner/driver语法exit0。审核者未运行这些App脚本。

本增量约束生成形状，不能保证供应商每次成功或地点语义完整。R36固定unlocatable-json只证明原严格草稿无法取得，不追认R35未知原因；真实全部场景、作者确认、完整复核、发布及重开仍须主代理完成后验收。
