# 场景清单有限恢复用例

待 372 方案审核通过后独审本用例，再实施。

1. 实际服务 DI：首答 stop、非空括号错误，第二答完整合法 roster，通过所有原门；首 native schema 保持且两次均有 quota/usage/abort 路径。空白/非法 JSON 多次仍不采结果，最多四次；generic 默认两次。
2. 第一次不可解析，第二次可解析但有坏行，第三次只按同一 CF 定点事务修复；完整好行、完整窗口和来源 owner 精确不变，不重命名、不靠缩窗或删项通过。
3. 首 draft 已冻结，第二次 JSON 非法或无据 context.label，第三次合法同事务可通过。所有 repairRef、原 stable slot 和保留证明不变；不得把第二答 repairs 当 roster，不能再次 prepare 或更改好行。四次全坏仍失败。
4. 原来源证明完整控制：改好行、删除提及/限定/关系、挪 owner、缩 quote、新增跨成员桥、dangling target 均继续拒绝。新增不在引文中的 label 不能因恢复而通过。
5. 无 draft 的 null/数组/非 roster 根、额外根字段、超额 roster 均保留原失败边界；无 draft 及 active 两态的非 stop finish（含缺失/unknown）均立即失败，不扩张长度恢复；网络/授权/取消/usage 错误不进行格式恢复，维持原异常及次数。
6. 每次完整纠错的 schema+prompt+原草稿+当前失败回复预算先验；超额第二次/后续次数不得实际生成，不截断正文或回复。请求和输入模型快照不变。
7. 受信 maxGenerations 参数必须为 1..4 的安全整数且不进入 SDK options；非法值在供应商前拒绝。无参数默认两次，非场景服务不注入；总用量累计所有真实代次，取消立即终止。
8. 新增合成边界数据不使用小说或 Key；真实 R40 回复只私有离线控制，不能提交为测试 fixture。先有具体功能 RED，再 GREEN；不把 missing module 当业务 RED。独立 code review 后本任务定向测试/类型/构建，再正常 fresh 全文真实验收。
