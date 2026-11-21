# RB-P01 native审计helper独立代码审核

日期：2026-10-26。审核者：独立子代理 `unified_picker_review`。依据21/24已批准语义方案、真实Prisma字段与规划契约，只审 `scripts/real-novel-semantic-assertions.ts` 和获准的合成内存自检。没有修改生产代码、测试、真实资料或其他审核文档，没有运行模型、用户数据库、journal、应用或UI。

## 当前结论

**最终结论：PASS，仅限本纯helper的native行机械断言及获准合成验证。** 初审发现两项P1，已先报告主代理并由原作者按单owner边界修复；独立增量复审、31个合成场景及helper定向TypeScript检查均通过，没有剩余必须修订项。下文保留初审定位与真实RED记录；本结论不代表调用端接线、生产publisher、真实RB-P01或独立文学oracle通过。

## 初审版本与边界

| 文件 | SHA-256 |
| --- | --- |
| `scripts/real-novel-semantic-assertions.ts` | `7a382e40d103e80f2400cff897b7e1b0402b7c396d32c02b0566ff73bb7355c7` |
| `/tmp/real-novel-semantic-assertions-check.mts` | `a2b26f3a0909f1d1ef12d2cdcc62c62b678b849dce21c5ffe4bfc7b0e22bb9ed` |

初审读取 `evidence/real-native-semantic-assertions-selfcheck.json` 作为交付说明，未当作独立执行结果。原driver会覆写该历史文件，主代理随后明确允许仅更换独立证据输出路径，保留全部测试语句，不覆盖原历史、不增加新probe或suite。作者最终driver改为接收独占输出前缀且使用wx排他新建；本审核直接执行该冻结原driver、只传独立前缀，无需复制/改动任何测试语句，具体命令见末节。

## NA-CR01 · P1 · 规划默认值掩盖缺失的显式可靠性

初审helper第116行先对实际 `rows.planning[0].data` 执行 `validatePlanning`，第151行再用返回值比较telling.reliability。`src/lib/planning/domain.ts` 的tellingSchema会把缺失的reliability补成“客观事实”。因此原artifact已明确为客观事实、实际持久telling缺少该键时，解析后的值仍等于预期，可能使全部断言通过。

这不满足21要求的“显式传递telling.reliability，不再吃默认客观事实”，也不能用consumer的默认显示当作持久证据。最小修订是在业务默认值解析前，对对应导入叙事卡的原始telling/ref逐项检查可靠性键真实存在、枚举合法并符合来源；再保留现有业务整体校验。需要合成反例：客观来源、实际telling缺键必须失败；显式正确客观值继续通过。outline/legacy卡不因此扩大为本轮重写范围。

## NA-CR02 · P1 · 已投影source-copy的映射警示可丢失

初审helper第89行只检查source scene/world且native为null时的decoder mappingWarnings；投影成功的兼容分支未覆盖。具体包括：

- source角色缺roleType，native按兼容位SUPPORTING并具有 `extra.importMapping`；实际角色extra可正确，但session中的该映射warning被删除仍不触发任何失败。
- source LEVEL_SYSTEM缺content、以原文description保留且没有结构节点，decoder产生“结构节点未提取”warning；因native非null，其警示同样不被核对。

21明确要求同一未确认映射进入导入审计，真实material名称视图据此显示历史警示，不能只在行extra里留下一个兼容标志。最小修订是逐条核对所有source-copy decoder mappingWarnings，在session中具有相同artifactId、覆盖所需fields且原因非空的实际warning；不机械判定原因是否具有文学依据。原unknownRole正例删角色warning即可构成窄反例，LEVEL兼容分支应有相应断言。

## 其余静态核对

- 没有publisher调用、文件系统/模型/数据库IO；输入是调用者提供的真实行，snapshot只作为预期契约，不能充作native行。角色按实际extra.importArtifactId匹配，并核对正常列、aliases、两遍关系的真实Character ID及本作品novelId。
- Scene仅PLACE；WORLD与九类SETTING分开，拓扑匹配父ID、同世界worldId、MAP父类型、content完整相等，数量与唯一ID严格。没有通过宽容normalize补空来认证native内容。
- 两线逐片剥离精确knowledge前缀，检查100000字符上限、UTF-16完整性、非末片容量、编号顺序，最终原样拼回完整artifact.text；事件people/父级/时间、telling及ref的可靠性和refs.kind的可读source分别核对。不能只凭前后摘要或一部分文字通过。
- sourceCopyIds/projectableIds为显式传入集合，派生/confirmed不能利用source-copy豁免；source排除必须有非空warning、逐ID未确认断言且无假native行。全目标正文推断不能仅以未映射source当目标成功。
- Chapter接口只携id/title/content，归属由调用者既有的Volume.novelId限定查询保证；本helper核对章节顺序/原文及叙事引用的实际ID，不单独证明查询范围。来源原材料保留、semanticAudit持久化、回执绑定和无关作品隔离也仍由调用端核验。
- STYLE/GOLD_FINGER在本helper仅做类型/数量边界，其余非本轮native类型由既有审计负责。mappingWarnings及projectable集合只能证明声明/机械投影，不能证明排除理由的文学正确性；真实逐书oracle仍必须独立完成。

## 两项修复最终复审

**NA-CR01关闭。** 最终helper在调用 `validatePlanning` 前直接读取实际raw planning.cards，仅匹配对应semantic narrative artifact的导入卡。每个telling的reliability必须为真实自有键、合法枚举且等于来源knowledge；refs也必须为实际数组且数量相同，每个ref可靠性显式合法并与对应源ref相等。后续原有业务整体校验、正文/引用/数量检查继续保留，outline/legacy卡不受这一新显式字段协议扩大。

作者的 [NA-CR01 RED](evidence/real-native-semantic-assertions-p1-red.txt) 实际显示：客观来源的持久telling缺reliability时，旧30条断言全部true，新增反例因未拒绝而失败。最终独立合成验证覆盖显式客观telling/ref正例、两者缺字段反例、实际refs缺数组与显式空数组兼容，以及outline默认字段不误拦截，均符合预期。

**NA-CR02关闭。** 最终helper对所有source-copy decoder产生的mappingWarnings逐项匹配实际session警示，核对artifactId、所需fields覆盖及非空reason，不再限native-null的scene/world。不会把原资料作为strict推断，也没有用警示文本替代文学判定。

作者的 [warning RED](evidence/real-native-semantic-assertions-warning-red-warning-check.json) 对角色/LEVEL两例均记录 `allOldAssertionsPassed:true`、新预期拒绝失败；最终独立输出中两例都被 `semantic-source-copy-decoder-mapping-warnings-preserved` 拒绝。正确带警示的原角色兼容位和LEVEL原描述复制正例继续通过，原资料/行字段未被审计helper改写。

## 最终独立验证与冻结版本

仅执行下面两个获准命令，没有全suite或真实数据审计：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx /tmp/real-novel-semantic-assertions-check.mts real-native-semantic-assertions-independent-review
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node node_modules/typescript/bin/tsc --project /tmp/real-novel-semantic-assertions-tsconfig.json --pretty false
```

- 合成自检：**exit0，31个场景全部符合预期**，约102ms；其中负例通过表示实际断言拒绝了破坏的行/警示，不表示该坏数据合格。新证据为 [独立selfcheck](evidence/real-native-semantic-assertions-independent-review-selfcheck.json) 和 [独立warning反例](evidence/real-native-semantic-assertions-independent-review-warning-check.json)。JSON的selfcheckCommand记录driver基础命令；实际本次完整调用（含独占前缀参数）以上方命令为准。
- 定向TypeScript：**exit0，诊断为空**，约936ms。配置继承repo tsconfig，但include只有本helper绝对路径及必要传递依赖，incremental:false/noEmit:true，typeRoots显式指定repo node_modules/@types；没有调用全仓typecheck。
- 原driver逐字执行，没有创建或编辑副本；原历史selfcheck仍为SHA `3399e5eb058fc72e4c4bfc33aedccca3bbc975f11f5fb812ad3d0d9cb155aaa2`。新证据用不同前缀wx创建，未覆盖原历史。

| 最终文件/独立证据 | SHA-256 |
| --- | --- |
| helper | `a93cd0208653a0feb4818c14b2aa26dbfb9988715946095948c24a299126c682` |
| 获准最终 `/tmp/real-novel-semantic-assertions-check.mts` | `ab64e89468da4bbc7435ef7c56b77234adc3c6f28512e77cb46d7cc0b748561f` |
| `/tmp/real-novel-semantic-assertions-tsconfig.json` | `879964c707b1bd85ddece86b1d1d0e691a9f1fbf5b1d2a57c2779560957c7d06` |
| 独立selfcheck JSON | `b8a6f2ec30dba1f3cdf2b41e9a7811857d4767f996e2e9458330dfba20f72442` |
| 独立warning JSON | `4b49a8a44a6afe92cc465fa8fc5fc85d6d6e33f00e638608e9f38919c688737d` |

执行后再次核对helper/driver/config SHA，均与作者冻结值相同。helper未调用publisher，31场景全部手写内存行，不读取源小说、模型、真实journal或数据库。它只能机械核对被提供的真实行与声明集合；调用端的receipt绑定、查询范围、snapshot/原材料保真及semanticAudit持久化仍待其独立接线审核。未映射警示不能证明排除理由有文学依据，最后仍须独立逐书oracle；本报告不能被当作真实RB-P01或整书导入验收通过。

## 最终增量复审：结构化知识限定与raw-only来源

同日，主代理授权只追加本节与新的metadata evidence，对38已确认的21 §4九Setting字段映射及明确排除的不可解码原资料例外做独立增量审核。没有改生产/helper/driver，没有扩大suite或提前代签37/38。**本增量最终PASS，适用于下列新冻结SHA与60个合成场景；上文31场景与初始SHA保留为历史。**

### 九类content独立期望

新 `expectedSettingContent` 从严格decoder得到的native content创建深克隆，独立描述38明确的consumer字段协议，不调用publisher或其projection函数：

| 类型 | 保留原值并附已有knowledge的字段 |
| --- | --- |
| 六文本Setting | text |
| CONCEPT | 每项explanation；term不改 |
| FACTION | 每项description、trim非空relations；id/name不改 |
| LEVEL_SYSTEM | 全局description、trim非空rules；递归等级的trim非空description/condition/ability.description及途径description |

身份、枚举、别名、tags、层级和原字段内容均继续逐项完整相等。指定承载字段可在原空描述处只显示已有metadata；可选纯空白字段保持原字。严格解码/normalize不丢失及原native实质内容门仍先执行，不能先附限定再把空content认证为有效。显式结构化source.content也使用这一无损期望；source缺content的文字/LEVEL fallback保持原文，不重复添加前缀，未提取结构warning仍须保留。原artifact.text/facts.content没有被helper写回或替换。

合成场景逐一覆盖九类正确限定与每类丢限定拒绝、明确structured source、原文fallback、MULTI_PATHWAY递归/子能力及空白、空Concept/FACTION描述承载metadata。旧31场景全部保留。作者保留了初次qualified content旧helper拒绝的SP-CR03 RED，以及length/trim语义不一致的 [空白RED](evidence/real-native-semantic-assertions-spcr03-whitespace-red.txt)；本审核没有在旧源上复跑额外probe。

### raw-only门与派生内容隔离

decoder失败不会直接变成native成功。catch只允许同时满足以下条件的材料进入单独raw-only集合：真实source、明确列入sourceCopyIds、明确不在projectableIds、存在非空fields/reason的映射warning，以及完整通用raw结构（合法kind、UTF-16完整的id/name/text/facts值、evidence/sourceUnitIds的必要字段和类型）。它得到的只是一条native:null/inferred:false占位和逐ID“未确认raw材料”断言，不创建或计数为Character/Scene/World/Setting/两线记录。

同值一旦标为projectable或inferred，仍严格失败；原有confirmed不能走source-copy门。坏UTF-16 raw材料也失败。完整native行数/typed父引用/worldId/content、此前已修复的显式telling/ref可靠性、以及全目标不能仅靠未映射source通过的断言都保留。raw text/facts/evidence逐字留存与receipt绑定仍由调用端另行核对，本helper不凭warning声明证明它们实际落盘，更不证明排除理由的文学正确性。

### NA-CR03 · P1 · raw-only世界线被后续可靠性门误拦（已关闭）

本轮初审helper `462960a64ef1ca8edce72b8964ba2ed11f1929eef7fef9cc7aa55c600fa80035` 已接受明确excluded/warned的不可解码source，却把placeholder knowledge设为空，后面的unmappedTimelines检查仍要求reliability字段warning。反例为原worldline已明确客观可靠性，但people为not-json，只能原资料保留；其真实排除warning针对people，后续可靠性门错误拒绝。作者原56场景只在character上验证了这一raw结构delta，未覆盖该类型。

已先报告主代理/原作者，未自行改源码。作者在 [raw-timeline RED](evidence/real-native-semantic-assertions-raw-timeline-red.txt) 复现唯一失败为 `semantic-source-copy-unmapped-timelines-explicitly-warn-reliability`；新修复只把实际通过catch完整门的ID记入rawOnlyIds，从“已解码但缺可靠性”的后续检查中分离。它不宣称该原资料knowledge已经解码成功；通用排除warning、raw完整性、无假实体和逐ID未确认检查仍在。

独立静态及最终执行核对：该raw世界线正例通过，同值projectable/inferred仍失败；正常可解码但缺reliability的source timeline仅给people warning仍失败。NA-CR03关闭，没有借raw例外放松可投影/派生事件的可靠性或引用合同。

### 最终冻结与唯一独立执行

执行前后均重新计算SHA，全部相同：

| 文件 | SHA-256 |
| --- | --- |
| helper | `ea047b842b9ffbd28e7c67024e5b4b39a00546e1d8d9b693a8552373146f29eb` |
| 原 `/tmp/real-novel-semantic-assertions-check.mts` | `a7968556df8f94ff3930c1e32c8f210c3595df77c641864e25b778036ab12895` |
| helper专用tsconfig（未变） | `879964c707b1bd85ddece86b1d1d0e691a9f1fbf5b1d2a57c2779560957c7d06` |

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx /tmp/real-novel-semantic-assertions-check.mts real-native-semantic-assertions-final-independent-review
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node node_modules/typescript/bin/tsc --project /tmp/real-novel-semantic-assertions-tsconfig.json --pretty false
```

**独立结果：60/60合成场景均符合预期，driver exit0（约214ms）；专用TypeScript exit0、无诊断（约999ms）。** 原31+15+10场景外，仅增加上述已报告raw timeline窄边界的4个场景，均仍为同一获准RB-P01内存范围。没有新增测试语句或复制修改driver来取得独立结果：执行的是作者冻结的原driver，只用主代理指定的未用前缀wx创建新证据。

本次新证据：

- [独立60场景selfcheck](evidence/real-native-semantic-assertions-final-independent-review-selfcheck.json)，SHA `64e29ad3845c8139893228bd9b0c629aca1d330e2c6972a1a7aa110461432106`。
- [原warning反例保持拒绝](evidence/real-native-semantic-assertions-final-independent-review-warning-check.json)，SHA `91a19698f8c94ca4439ae9c0e2e3827485fa295f1f90fc55505ce87328cea042`。
- [实际命令/前后SHA/范围metadata](evidence/real-native-semantic-assertions-final-independent-review-metadata.json)，补足driver JSON只记录基础命令而不含输出前缀的元数据限制。

原selfcheck SHA仍为 `3399e5eb058fc72e4c4bfc33aedccca3bbc975f11f5fb812ad3d0d9cb155aaa2`，前次独立31场景证据仍为 `b8a6f2ec30dba1f3cdf2b41e9a7811857d4767f996e2e9458330dfba20f72442`，均未覆盖。**最终PASS仅针对此纯审计helper及其机械契约，不是调用端/生产publisher/37控制器/真实RB-P01或文学oracle通过。** 未调用producer、真实模型、用户DB、journal、应用或CUA。

## FACTION可选ID的JSON持久表示增量复审

本轮只读核对最后一处期望值变化：严格native解码/knowledge映射之后，对**期望content**执行JSON往返，再与实际行严格deepEqual。可选FACTION.id为undefined时，真实JSON持久化会省略该对象键；这不代表原内容丢失。转换没有作用于actual，没有调用宽容normalize，没有删除null或任意有值字段，也没有改变原artifact/facts/content。严格decoder仍先拒绝错误字段形状。

作者的 [optional-id RED](evidence/real-native-semantic-assertions-optional-id-red.txt) 明确复现合法省键行被旧期望误拦。原60场景保留，增加合法省键正例、删除description和改name两个反例；这些内容错误仍被严格content比较拒绝。本审核没有新增或改写测试语句。

**增量最终PASS。** 独立执行原driver，63/63场景符合预期、exit0（约140ms）；同一helper专用TypeScript配置exit0、无诊断（约952ms）。执行前后helper/driver/config SHA相同：

| 文件 | SHA-256 |
| --- | --- |
| helper | `6a4cc340689a71ff93c53e6091e794edaa35461e6ebdf26dc761a0399e415748` |
| `/tmp/real-novel-semantic-assertions-check.mts` | `ab806327c56d7f6642b87aa87c7fdcbf1f05bed24de80bf12555daacbf7bd7cd` |
| 专用tsconfig | `879964c707b1bd85ddece86b1d1d0e691a9f1fbf5b1d2a57c2779560957c7d06` |

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx /tmp/real-novel-semantic-assertions-check.mts real-native-semantic-assertions-optional-id-independent-review
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node node_modules/typescript/bin/tsc --project /tmp/real-novel-semantic-assertions-tsconfig.json --pretty false
```

独占前缀的新 [63场景selfcheck](evidence/real-native-semantic-assertions-optional-id-independent-review-selfcheck.json) SHA为 `f63cba42be5ccef98af46acd418c5fd5d15629ce9233fc392a4c2941dd6d0218`；[既有warning反例](evidence/real-native-semantic-assertions-optional-id-independent-review-warning-check.json) SHA为 `54f64ab4f4824e5083e503fdbe135be7745896d7a503f74ecd0f9b1044843da2`。旧证据未覆盖。此PASS仍仅限纯helper/合成机械合同，不代签37/38或真实数据、模型、native UI与文学oracle；本轮未执行其余测试或真实操作。
