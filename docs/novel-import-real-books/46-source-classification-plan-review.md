# 正文来源分类窄修复技术与用例独立审核

日期：2026-10-26。审核者：`remaining_books_oracle`。依据45、已冻结S01-C1分类失败审核，以及当前已知prompt／classification检查点接点作静态审阅。没有编码、执行测试、模型、应用、真实journal或用户DB，没有改原件、oracle、UI、生产代码和真实结果。

45 SHA-256：`f9a73434f42700ecf3fef89ec7ba6f6d425f178824508555d7ea51b3d127a006`。

**技术方案：PASS。限定用例：PASS。** 无方案级必须修订项。允许在指定三文件范围进入限定TDD及后续独立代码审核；不代表提示词已修复真实模型质量，也不将S01-C1旧rev5的分类FAIL改成通过。

## 技术方案核对

| 范围 | 结论与依据 |
| --- | --- |
| 来源用途与正文可推断内容 | 独立classify契约正对实际失败：原作的背景、人物、对话、动作、回忆、评论仍是body，已单列的设定／卡片／规划才属对应类别。合法kind逐项说明，不以人物名、关键词、书名、语言或扩展名强制body；标题需结合实际小说章节，不把所有附属文字吞入正文 |
| 阶段隔离 | 新语义classify只返回classifications，完整且唯一覆盖unit；不附native／facts／两线生成规则。保留资料不可信、unknown回退、不自动排除与阶段白名单；真实适配器继续拒绝非法类别／越权内容，不由控制器把某种结果强转body |
| 输入副本与提交 | 仅新语义classify副本中kind变为unknown，id/fileId/start/end/text和顺序逐字保留；现有journal分类在完整合法批响应检查前保持不变。没有修改来源、重新分段、trim、换行或更改oracle，也不通过先清空分类来制造表面成功 |
| 契约身份与检查点 | 新语义classificationSourceHash增加固定classify契约指纹，覆盖提示含义变化；既有sourceHash/resultHash检查点可继续承载它，无需新增journal字段。它只控制分类信用，不进入正文／plan／semantic hash，不给分析或发布加新默认项 |
| 正常恢复与legacy | 同一契约及相同source/result可保留已经成功的分类批次；变更契约失效旧分类信用并重新发送相关原单位。无semanticVersion的legacy计算分支保持原公式，旧prompt／其它phase及工作几何保持原样，不偷升旧已发布S01 |
| 权限与生命周期 | 仍通过既有UI重新授权来源和当前模型，不沿用过期grant；不改源验证、角色预算、实际AI／runtime停机屏障、epoch／原子checkpoint、不改变service/schema／解析／发布或产品UI |

当前 `classificationSourceHash` 以kind中性化后的classify scope和完整单位几何／文本身份为基础；`classificationResultHash`另绑定已存kind和classify coverage。主控制器classify仅在二者匹配时preserve，recognize按未完成单位发批，完整验证结果后才原子提交kind／coverage／checkpoint。45把新指纹加在这个既有信用接点，比改全局scope或手改C1覆盖更小；同契约的暂停／重开仍可继续只补未完成。

固定契约指纹应由新语义classify的固定提示部分和空payload计算，不能混入正文、当前kind、时间、session、epoch或随机值；否则正常恢复会被诊断／结果变化误失效。legacy分支须保持字段缺省及原值，不能以新空字段替代缺省。这是45中“固定指纹／legacy公式逐字不变”的具体实现验收含义。

代码审核须确认中性化确实作用于发送用副本而不提前改变s.units；C01/C02的输入不变与原子提交断言应覆盖请求仍在途、非法／不完整响应和合法批响应三个时点，旧kind只能在最后一个时点提交。不得用生产新helper给自己生成旧指纹／旧prompt期望；按45保存实施前独立literal基线。以上是既定输入／缓存要求的落点，不增加新测试编号或范围。

## 限定用例核对

**NI-C01**通过真实runImportAi适配器捕获固定prompt，能验证classify契约隔离、原始单位字符／身份／几何／顺序不变、unknown与合法kind、非法／越权结果仍拒绝、固定提示预留，以及其它新旧phase／reconcile的实施前literal身份不变。它不使用实际模型，不能拿合成返回证明文学分类正确；方案已明确这一限制。

**NI-C02**使用临时目录真实controller和可控RPC，验证旧契约坏分类检查点在重开／重新授权后重发原单位，中性副本不改已存原单位；相同新契约的成功批不重复，暂停／重开只补未完成，旧epoch迟到结果无信用。legacy分类身份与工作几何、source-only零AI及无用户配置／DB/journal访问边界恰与变化直接相关。

旧保护项的实际名称和文件均存在：

- `tests/unit/novel-import-ai.test.ts:27`，`NI-A03: missing ids, unknown categories and fabricated evidence are rejected`。
- 同文件第49行，`NI-A05: phase output contracts allow empty no-op arrays while rejecting actual cross-phase mutations`。
- `tests/unit/novel-import-session.test.ts:213`，`NI-LB05: frozen role profiles survive restart and reject incompatible model changes without losing progress`。

三个命令仅覆盖上述新C01/C02、旧A03/A05、旧LB05：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-C0[12]:' tests/unit/novel-import-classification.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[35]:' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-LB05:' tests/unit/novel-import-session.test.ts
```

**本审核没有执行这些命令。** 后续先留真实RED，再窄实现GREEN及独立code review；typecheck／构建单记，不扩为目录、全仓、浏览器或其它PDF／SEM／runtime suite。已批准实现范围仅core AI-payload、main及新分类测试文件，旧保护测试不因本次批准而获准改写断言。

## 同草稿真实修复重测口径

45保留C1原件、当前草稿和rev5失败证据，正常退出／新构建／同session重开，通过现有识别授权UI重新识别；新契约指纹使旧26覆盖失效，不能以coverage全满跳过真实调用。新请求的单位身份、原字符和顺序须与本次冻结来源相同；修复后另存不可覆盖检查点及新构建身份，再由独立审核逐段判断。

本次修复路径不手工重标整篇body、不删失败草稿、不注入响应或改源文件／期望。即使结果仍错，也必须继续如实FAIL，不能把手动纠正或26/26当自动识别成功。只有自动分类质量经实际原件核对之后，才按事前基线核对标题／日期／注释等边界；正文中原注号不能擅删。后续完整正文、十二目标、独立语义、发布和正常重开仍全部待实际验证。

主代理先前允许的人工来源核对是产品功能及测试动作；45选择了更明确的自动分类修复验证路径，本PASS不混用两者，也不回溯改变旧S01或C1 rev5结果。
