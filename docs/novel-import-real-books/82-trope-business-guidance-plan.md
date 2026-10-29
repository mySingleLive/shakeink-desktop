# 爽点与泪点业务含义：提示约束及限定用例

日期：2026-10-26。待独立技术/用例审核，未编码。与79三文件窄修分开：本方案只改payload及AI测试，依赖79冻结后合并验证，避免并行改读同一测试。

## 已有真实语义失败

S02 rev128已完成trope覆盖6/6却返回整体notFound。独立事前基线及reviews/S02-C1-partial-foreshadow-notfound.md（SHAb51d15b3c5501369431e93cb4a46489a4bdccafe65b4e9dd1a84c1c6e48462ba）证明存在重要TEAR正例，不能整体接受“无爽点/泪点”。不把这项文学缺失误说为schema错误或已被修好。

共享业务标签明确`trope=爽点/泪点`，但当前sem1固定提示主要给英文kind及tropeKind的SATISFACTION/TEAR枚举，没有解释两种情绪目标及分开判断。无法由此断定模型为何判无；可以补足现有业务含义而不投喂本书答案。

## 唯一生产变化

仅`desktop/core/novel-import-ai-payload.ts`，新增独立固定`emotional-impact-contract`，不改73指导或76唯一kind合同。只在sem1普通analyze kind trope、明确修订trope目标的reconcile、或review的selectedTargets包含trope时出现：

- 当前业务目标是爽点/泪点；SATISFACTION指具体叙事带来的满足、解压等情绪回报；TEAR指具体叙事可形成的悲伤、怜惜、无助等阅读情绪。
- 两类分别核对，不能因一类没有而合并判另一类没有；泪点不要求角色实际流泪、原文写出读者反应或商业类型惯例。仍须有可定位原文和具体叙事作用，不能把宏观主题、无依据评价或任意场景都当情绪点。
- 解释阅读效果是文学判断，必须与人物所知/所想及客观情节分开，保留原可靠性和归属合同。原notFound仅在两类都无足够原文依据时使用，不强造任何一类。
- review继续遵守现有reviewProjection范围与已有实体三元规则，不因新指导就假设未展示实体全书缺失；reconcile仍只改明确目标/字段和不改锁定值。

固定段不得出现本书/人物名、原句、冻结基线、人工审核正例或具体故事答案。不改数据、schema/validator/状态机/notFound持久结果、预算、模型/权限/重试。其它目标、无trope审核、classify/patch/legacy逐字保持。旧trope notFound信用不手动删除或强造产物，后续整书审核是否能纠正必须实测，未纠正仍记语义FAIL。

## 限定用例与依赖

仅`tests/unit/novel-import-ai.test.ts`新增NI-A09，旧断言/8组及其它golden保持。经真实runImportAi依赖接点捕获ordinary trope、带trope目标reconcile及含trope审核的固定段在不可信payload外，验证标签/两个枚举/分开判断/原文依据/可靠性/投影锁约束；合成正常artifact、notFound/空修订等原结果及source/payload/signal/role保持。无相关目标的reconcile或review不得因上下文偶有trope而进入本合同。原常量及大/非BMP转义输入预算不变。

修改前取得独立真实prompt/payload literal/hash，保护不相关目标/阶段（不能拿当前输出自证）。词面和DI只证合同接线与安全边界，不证文学质量或真实已补出TEAR。

依79冻结/81审核后再顺序实施和验证。先真实生产基线新增A09 RED→最小GREEN→独立代码审核，仅两命令，不全量：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[789]:' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J0[1234]:' tests/unit/novel-import-request-schema.test.ts
```

必要类型及desktop build另记，UI/worker不变不全量。与79通过后同S02恢复世界线，保留43产物/既有覆盖/原文/14章，未执行的整书审核将得到本业务指导。不得把已有trope notFound或其它文学问题提前升级通过；仍须最终全目标/修订后独立文学与业务落库/重开核验，所有真实失败永久保留。
