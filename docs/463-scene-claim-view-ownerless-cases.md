# 发送视图与无旧归属claim用例

462技术独审通过后再独审本用例，正式准入前不改产品。

1. 用原数据手写A/C roundtrip：多slot稀疏bad-row、mention/context/link全部claim metadata与keep、多候选/重复项/特殊Unicode值完整保留；slot匹配行而非rows[slot]；claimIndexes原零基顺序；完整options及所有局部号不变，private plan/tasks不变。CF共享表严格1..N双射，missing/duplicate/malformed映射拒绝，不取首/去重/局部编号。只变四类CF字段，不替换literal/label中恰含CF的文本、rr/pc、sourceRef或opaque反馈。实际缺失功能先RED，再GREEN。
2. 手写归属负控：旧owner/links路径行为保持；仅strict三数组、proof mentions为空且links=[]才扩资格。metadata/unknown/部分类型、重复raw mention/context、同发生位置、可用发生位置不足、有源跨unit无单unit候选全部原fallback。所有未证mention/context位置必须为显式claim，无proof的raw-valid context也不能暗冻结；无源和reject资格按原门，借oldMembers/oldContext、联合重复window/成员图桥接仍拒。
3. 真业务桥RED复现a3bb形态：没有旧归属且context存在时原fallback完整replacement会反复错误窗口；新有限selection须经模型明确选择后通过所有原source/canonical/retention/owner门，非法option/共享号混淆/源不匹配/遗漏/重复claim/非法0持续四代拒，不能自动选择1。空半开范围保持原拒，不能改为单片。
4. 组合A+B+C真实资料零API preflight：同原3a首输入/首稿SHA及完整payload，全部原fallback停点数据逐项保真、至少一个同时fit原prompt/schema/context；保留A单独通过及AB不fit历史，不冒SDK第二代或新供应商通过。原Native、原decoder/编译器/阈值/fallback排序/接受门不变。
5. 两个可选focus的完整16KiB、实际parser清除/更新、互斥、原base优先和fixed/context N/N+1回归。预算不得因新view漏记任何数据；A/C可还原完整数据，不能把压缩后计费冒原旧SHA一致。
6. 224请求/452原捕获：每次后续复用前比较完整语义binding并证明旧输入；不兼容或不可证时只测prepared prompt、SDK前停并明确unused，不把旧数字当新答案。used+互斥unused=452；新旧129/130首轮与各历史首稿准备预算、原文件/正文/1402章/4912单元完整覆盖，严格无API。更后代用合成真实业务失败验证2/3/4代完整draft/current预算，不冒历史结果。
7. 保留原测试领域断言；仅最小适配helper从共享号/claimIndexes还原相同原元数据。所有相关定向、types/desktop build/diff及独立代码审核后冻结，再R68正常fresh全书、原420000ms、全部场景/完整资料、无skip/drop/错误、发布/正常重开/DB全量相等真实验收。未过仍actualFailed，不跑全仓。
