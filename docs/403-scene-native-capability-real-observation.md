# R48 当前接口静态 schema 实测

402 独审通过、主代理最终 21/21 合成控制、私有类型检查及构建通过后，冻结 R48，在同一隔离 R3/当前已授权 DeepSeek 配置执行四个固定静态例，各一次生成/实际 fetch、零重试。未发小说输入、未改产品或配置。

| 单次静态例 | 实际完整 schema 校验 | 具体观察 |
| --- | --- | --- |
| 单值 rr/pc/cf 正控 | pass | 完整 JSON，所有约束符合 |
| 同 schema 的反指令 | fail | 3 个 enum 违反 |
| 原完整 3015-byte generic repair schema，要求空 claims | fail | 实际 patch.claims 空数组，minItems 违反 |
| 两个全字段固定分支，2 项且 uniqueItems，要求复制 A | fail | 实际重复同一完整项，uniqueItems 违反 |

四次均完成且 finish=stop，直接 JSON 与原 parser 均取得同份数据；delta 与 SDK text 相同。四次实际 wire 都为 json_schema/strict=true，schema/inputText SHA 与预定静态例完全匹配。没有 HTTP/网络失败，不通过裁剪或修正输出制造校验成功。[逐例固定标量及哈希](scene-import-verification/r48-native-capability-observation.json)。

实际 4 generate/4 fetch；writeFailures=0、closeFailed=false、metadataWriteAttempts=0、pageErrors=0。全部 broker 资源关闭，正常 App exit 0，无 quit timeout；配置、helper 输入/产物及 R47 全部 367 产品文件前后哈希不变。原 vault/gateway 正常内部授权使用凭据，诊断未 inspect/store Key、headers、URL、开放错误或真实配置。合成回复只留 0700/0600 私有目录。

这四个观察不足以声称所有 schema/模型/模式均不支持；但三个反指令例已证明本次接口在实际 strict=true 条件下仍可能违反相应子约束。不能只依赖额外 enum/minItems/uniqueItems 或 strict 开关作为机器正确性保证。旧 R47 未捕获 wire，不能追认其 body；R48 为当前独立观察。官方 [Responses 参考](https://api-docs.deepseek.com/api/create-response/) 和 [兼容说明](https://api-docs.deepseek.com/guides/responses_api/) 是参数说明，不替代本次实测。

## 问题澄清与基本要素

目标来自用户：完整正常导入《诡秘之主》，同名/泛称按实际地点区分。现有信息已给定目标文件、当前接口授权、余额恢复及地点策略；本次不需要重复询问。成功标准仍为全部 1402 章/5589 工作单元覆盖、场景无失败/跳过/资料丢失，完整正文/事实/归属复核，正常发布/退出重开及逐字段持久化一致。范围是当前独立桌面仓库；原文与已核实资料/owner、配置、配额和真实校验门是约束，不能用模拟或一次部分结果代替。

| 隐含假设 | 类型与证据 |
| --- | --- |
| strict=true 能保证每个子约束 | 可打破的接口假设；本次反例已出现 |
| 再加提示、候选和错误标签即可保证模型复制正确 | 可打破的惯例；R47 三包收到准确反馈仍违候选 |
| 必须让模型回传 rr/pc/CF 等高熵控制引用 | 可重新设计的协议；这些绑定本已由应用拥有 |
| 必须让模型重写已证完整基底及选择修复语法 | 可重新设计的职责；应用已知基底与可用模式 |
| 原文、来源位置、已证事实/owner 可为格式成功而改动 | 不可接受；是用户完整性与可验证性约束 |
| 单项来源合法就代表全部联合归属合法 | 错误；R47 同组重复证明联合门必须保留 |

基本数据是固定原文窗口、已证事实、未证语义 claim、可显式选择的真实候选，以及完整联合关系。模型需要决定来源/语义，应用可以绑定控制身份、模板、字段和原基底。下一步先设计短、有界、由应用编译的决定协议，再独审方案/用例；保持全部原校验，不自动选首/猜来源，不靠扩大重试或改变上游强制能力推断。当前完整场景、全文复核、发布及重开仍未通过，任务未完成。
