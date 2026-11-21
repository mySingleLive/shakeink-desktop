# 462 · 技术方案独立审核

结论：通过，无阻塞。审核方案 SHA256 `9ebe05590fcb2a3b033d2309849f484a41dace376481fa9563bf8b9c060117b0`；须在 463 用例独审通过后才实施。当前 R67 的 57 个产品源哈希均未变，本审核没有 App/API 或产品修改。

A/C 仅发送视图可逆压缩：task 按 slot 查原 row、按原零基 claimIndexes 顺序取完整 metadata，全部 options 不变；四类 CF 路径按完整共享表双射转换，保留顺序、重复项及所有其它字段。应以手写逐字段 roundtrip 和原对象不变证明无损，不能全文替换、局部重编号或缩域。private tasks、编译、fallback 排序、Native 和输出/解码协议保持。

B 的扩展界线明确且可实现：仅 strict firstRecord、无原 proof mentions、links 空的行；所有未证 mention 和无原 proof 的 context evidence 均待显式 claim，不把 raw 可定位窗口变成冻结基底。原 source-present、合法单 unit 候选、发生位置数量、重复位置、oldMembers/oldContext 借用禁令、联合域阈值与整组 fallback、全 owner/source/retention 门保持。有旧 owner、links、metadata、未知键及部分类型不借此扩展。

已核联合私有安全收据：0 API/0 SDK，原首输入 SHA 相符；联合第 2 个 fallback 停点 47 tasks（44 selection/3 replacement），Native 16580B、fixed 64403B、contextNeed 384842B，613 个 CF 引用逐点逆投原 rows 一致。A+B 不 fit 的旧证据应保留；联合可行性与七记录反事实均不等于供应商或全文通过。

历史验证口径可操作：完整最终语义绑定必须包括 task kind/slot、claim 分组及顺序、option 的完整 CF assignment、共享号对应窗口。相同 arity 不足以复用数字；不能证明旧实际输入及绑定时，按 changed/unknown 只测已准备的下一完整请求预算，在 SDK 前停止。用于兼容回放、提前接受未使用、合同变化/未知未使用的捕获必须互斥，总计 452；不能把缺证记作新拒绝或成功。新 prompt 无旧下一答仅为 preflight，后代预算另用明确标注的合成真实业务失败覆盖。所有首轮及历史首稿准备预算仍需通过，随后须 R68 正常实际验收，原 R67 失败事实保持。
