# 首轮失败安全分类用例

- 模拟真实生成桥首答无可定位草稿，分别invalid_json/invalid_schema/incomplete、native开/关；仍首1次0、同失败分支，码中仅固定枚举。
- 原parser的裸/有fence候选分别为数组、null、字符串、数值、布尔、无roster对象、roster非数组/额外根键/超2000数组；分类准确，未知键与秘密哨兵不得进入消息或日志。
- 对可修复首答不触发新增分类，不修改有效native/generic提示词、schema、role、cap、usage、原授权或原source/retention/最终拒绝门。
- 私有observer仅完整已知码可记录native/kind/candidateRoot，混入未知值、任意后缀/秘密一律unknown且不回显；原post/emit/权限/恢复控制继续通过。
- SDK finish为length/content-filter/stop及未知秘密值时，仅记录对应白名单或unknown；同错误identity、kind/message保持，新增字段不可枚举，不入SDK options，普通生成回调结构和两代不变。直接parser错误无SDK结果时标unknown，不能猜结束原因。

记录真实入口功能RED；分类与新回复只作证据，不代表历史根因或全文验收。
