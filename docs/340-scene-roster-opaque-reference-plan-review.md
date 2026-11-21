# 340 精确片段 ref 独立技术方案审核

结论：通过，无方案阻塞。审核 SHA-256：`0da7711208c374e6a98462f75fd54bc3d283756af9bc9c918bca80f7503c5c86`。

范围限定 336 的新 scene roster wire，不改 ledger/shared/main。ref 的版本化固定 JSON 序列、全 unit.text UTF-16LE hash、真实几何及片段半开范围明确；当前整表重复即拒绝，不取首或改 nonce。显示目录和绑定快照冻结，私有 Map 不向外暴露，resolver 返回新 Anchor 副本，无全局按 ID 缓存。查找仅精确匹配当前表且只还原一片，不解析 ref 猜坐标、不拼邻片、不模糊改绑。

原 raw/半开 anchor 与新增 ref 严格互斥，坏旧分支不得 fallback。第三种省名称 record 只从第 0 条真实 literal 派生 name，其余 exact distinct literal 按首次顺序成为 aliases，全部 mentions/context/links 保留，超过原 alias20 门仍拒绝；第一条坏时不可跳过。原 full/primary 分支继续原义，包括 primary 越界必拒和混合/own undefined 必拒。

先整份 wire 严格解析，再编译副本并过原 canonical/validateSceneRosterRecords 与末端所有门。ref 唯一只代表片段绑定唯一，不能替代 quote 在原 unit 唯一、literal 在 quote 恰一次或具体地点的语义归属。需要扩大或缩窄证据时必须由模型显式选择原合法半开/raw 分支，应用不能替它修复。

全部新元数据进入原 serializer/planner/worker 完整预算，不重复 text、不删单位/尾白/片段，不增 cap/两代/并发或 16KiB reserve。固定安全反馈映射实际 wire，不回显未知 ref/业务值。R30/R31 诊断失败不当作新鲜全文或已解决的证明。

可进入 341 用例独审。审核者仅只读当前 helper/service/payload 和文档，未修改源/测试，未读取真实小说或调用 App/API。
