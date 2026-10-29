# 隐藏引用错误与标准服务错误：只改安全提示

日期：2026-10-26。待独立技术/用例审核，未编码。

## 研究与实际限制

S02新构建世界线rev203仍通用失败，worldline-after-native-feedback-failure-rev203.json SHAecb74ab6e3055c957db86a433e0bf3ecdc62a11a55b7024ed75d16b7459b6f90独占保留。runtime明确服务调用outcome rejected，43产物/覆盖/原文5310及14章保持；无raw或原Error消息，不能断言是某一引用错误、网络或余额，未再重试。

静态核对`desktop/service/novel-import-ai.ts`的validateSemanticLinks，发现固定的“角色引用不存在或同名不明确”“角色引用类型无效”“语义实体目录类型无效”等消息不匹配main.safeError允许前缀，因此会被隐藏。已有文学核对确有角色遗漏，但这不证明三次世界线失败就是这些引用错误。

当前模型供应商的[官方错误码说明](https://api-docs.deepseek.com/quick_start/error_codes/)（2026-10-26核对）还列出固定标准描述：Invalid Format、Authentication Fails、Insufficient Balance、Invalid Parameters、Rate Limit Reached、Server Error、Server Overloaded。这里只用于安全提示字典，未查询任何账户余额、用量、Key或供应商控制台，不能据文档推断本次错误原因。

## 唯一生产修改

仅`desktop/main/novel-import.ts`的safeError，在原精确固定字面字典中增加上述已知隐藏引用/目录/父级/章节错误和供应商标准描述，映射值全部为固定中文提示。服务固定字面范围由源文件逐项核对：语义实体目录类型无效、角色引用类型无效、角色引用不存在或同名不明确、地点父引用必须为PLACE、世界父引用必须为WORLD、世界设定归属引用无效、MAP父引用必须属于同世界MAP、语义父级引用形成循环、叙事章节引用无效。

只精确匹配，不部分匹配或提取动态消息，不解析responseBody/status/headers/cause，不添加日志/网络请求/诊断协议。供应商描述按原大小写/空格精确匹配；近似、附加URL/Key/模型ID/文本/换行均不进入新映射，仍走原行为。所有新增键不以旧允许前缀起始，因此这些反例仍为通用提示；既有未知事件时间家族guard、长结构列表映射及旧短fallback/知识映射原样保持。

不改service、生成/格式纠正/网络重试、schema/native/引用规则、工作流、数据、预算、模型、权限或产物信用。提示只表达这次实际收到的固定字面类别，不能用新字典追溯认定旧失败根因；如仍未识别则继续通用，不输出任意原始内容。

## 限定用例

仅`tests/unit/novel-import-request-schema.test.ts`新增NI-J05：

- 用真实runImportAi DI构造格式合法、people引用未知角色或非角色ID的worldline，捕获实际validateSemanticLinks拒绝Error；证明原main.safeError隐藏为generic的真实RED，新main给固定中文，无实际ID/原文回显。原引用晚门仍拒，零有效产物；这只证明错误通路，不证明S02旧失败实际原因。
- 对源文件核对的固定消息和官方标准描述逐项正例、近似/前后空白/附加秘密值/URL/换行/非Error反例，确认精确匹配、安全固定文本与无额外属性；未识别仍generic。
- 79已有世界线/未知家族/长列表/179–180边界及旧知识映射、生成纠正和gate断言原字节保持，不删旧用例或扩大回显。

仅两精准命令，真两文件基线先RED→最小GREEN→独立代码审核，不全量：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J0[12345]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[789]:' tests/unit/novel-import-ai.test.ts
```

必要类型/desktop build另记，UI/worker不变不全量构建。通过后同S02正常关闭/新构建重开、原目录/同模型范围重授权，核对43产物/覆盖/原文/14章/预算保持，再做一次带新诊断的世界线实际恢复。此次不是修改模型结果或再做随机参数重抽；若显露外部服务限制，保持草稿并请求必要用户处置，不擅自更换/付费模型。所有旧失败、文学问题及其余书/LIFE未通过状态保留。
