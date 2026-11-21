# 389 独立用例审核

前置：388 补稿已先复核通过。最终结论：通过，可执行限定 TDD。

现有正常桥、旧 replace 负控、四代/预算/状态及来源重放范围合理。需随 388 冻结接口补最小反例：部分已证/未证的同一 context 或 link 原项完整分类；重复或无法分类时整行无 patch 资格；相同 literal 源位置缩换 quote 冒充新 claim；借其它已证 owner 的旧事实制造新 claim/桥接。断言实际拒绝或旧 replace fallback，不能只测类型、计数或字符串。

补充控制已覆盖上述位置分类、完整分组和 occurrence/owner 判定，严格 patch 形状已与方案统一。实现时须以实际 source/retention 拒绝或整行无 patch 资格证明这些反例，保留原 replace 负控和真实 SDK 深等正控；不能只验证 DTO 形状。测试 helper 继续旧 replace 控制，新 patch 使用显式独立 fixture，不自动洗白旧非法结果。

本次准入仅限方案范围，不认证模型会成功或全文已经验收。此次仅文档审核，未改产品/测试或运行 App/API。
