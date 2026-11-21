# 438 独立用例审核

结论：437 通过后，438 按序通过，可先 RED 再实现。审核版本：`438-scene-bound-answer-guidance-cases.md`，SHA256 `72108c94a72d57f101b51fa783b2bbfb317d2fc905b2058aff33e9b01665dc62`。

九项用例覆盖完整 provider-only 投影/独立严格反投影及深冻结、不同合法局部方案的真实业务桥、实际已证 11/10 与 34/40/38 数量首门、各类型/局部范围/0 资格、三种 metadata 互斥、active/legacy/root 隔离、秘密哨兵和最多六项，以及原 BD 编译/禁止拒绝/悬空/桥接/来源/权限门，足以约束没有解码放宽。

局部方案号与共享 choices 号必须用可信显号一一反投影；坏格式的跳号、重排、重复、错层/列数不得被读取器修复。保持应用 decoder 和已有业务 oracle 不变，不能更新业务负控去适应模型错误。原 root shape 优先于 decode；数量拒绝后不得把尚未触达的后项作为实际首因。数量正确的独立负控才能验证后续 task 指导。

新反馈只用已声明任务号、种类、数量/局部范围及固定结构模板，不回显 raw 值、Zod issue 消息或任意业务异常；原安全 source/retention/owner 反馈继续保留。mixed answers/repairs 仍拒，显式旧 repairs 路径仍用旧合同，不能由 parse 失败自动切换接受分支。

130 首轮和 196 历史代全部原材料/Native schema/新反馈计原限额，70/20 本地结果比较必须如实保留；新的 prompt 不冒称旧 input SHA。容量不 fit 时只调整显示/指导开销，不裁材料或抬限。最终类型/构建/定向回归/独立 code review 与正常 fresh 全文、发布和重开均另行实测；本审核未改产品/测试或调用 API。

case4 窄补审通过，当前 438 SHA256 `bc4c0c576dc2a5cc9c876949ea5e3cff38965d7c6b20fa7d5fcb0d1d5df520a2`。mention evidence 数组及旧 `{ref}` 必须先被原严格门拒绝，再获得固定“单 choice 对象、context/link 才是数组”指导；不得为通过而自动转形、展开旧引用或选择其中一项。应保持原 3 元数据互斥、缺三数组/extra 拒绝及隐私反控，消息只来自固定模板与可信任务号。除此两段解释外原审查范围/预算及全部负控不变，可继续 TDD。
