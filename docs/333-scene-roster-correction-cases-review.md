# 333 独立用例审核

前置：332 技术方案已按序独审通过。用例版本 SHA-256：`4eb5d8af2719671e1bd2f8844d183cb7b83ccabce5284cdb0a96ab266bc85dd9`。

结论：通过，无用例阻塞，可进行合成 TDD。

- RC01 通过真实 generation JSON 桥验证首坏次好，覆盖形状、context 每条原样包含、name/alias 覆盖、literal 归属/唯一、精确 quote 与 links；检查第二次实际新增纠错内容以及完整 canonical sidecar，能够证明反馈可达而非只测字符串 helper。
- RC02 保留持续坏两次拒绝、后置坏行/坏证据、直接 own undefined 额外键，避免首项通过或 JSON.stringify 隐去坏键的伪正控。未知原始键、值与 Zod 原消息不得回显；最多六个合法路径和固定原因，未知诊断仍 fail-closed。
- RC03 比较 payload 原值与 bytes、原 wire 接受集合/结果、旧 scope，并验证新增完整 prompt 在实际 role 的原预算边界上计入，预算不足须 0 generation 拒绝。不得只看单个 prompt 关键字便代替预算或旧路径回归。

执行澄清：隐私哨兵应仅置于模型坏 raw，或只对第二代新增纠错段及 error.feedback 断言。原请求 payload 中合法存在的资料必须继续保留，不能把该既有输入误判为纠错泄漏，亦不能为消除哨兵删除 payload。250 的断言以现有 JavaScript 截断所用 UTF-16 code units 计量；第一代结构失败时未执行的后置断言须如实记为未达。

RED/GREEN 记录实际节点数和失败原因；合成预置次好输出仅证明纠错通路，不证明真实 provider 会纠正。独立 code review、必要受影响回归后由主代理另做真实单包及 fresh 全文、作者决定、发布和重开。审核者未改产品/测试、未启动 App/API 或读取真实资料。
