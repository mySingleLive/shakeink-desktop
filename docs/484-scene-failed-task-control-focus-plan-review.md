# 484：完整失败任务控制资料聚焦方案独立审核

结论：**方案通过，可以继续按序审核485用例。** 本结论不授予产品/harness实现、真实小样或额外API执行准入；须用例独审、TDD与最终代码/私有执行层冻结审核后再推进。

锁定方案：`docs/484-scene-failed-task-control-focus-brief.md`，SHA-256 `91cc420d1f586d476fa8cf423b58a69e2184fa9c1ab87b545ad0e3dbe91d8c5e`。审核仅只读方案及已锁PRIVATE量化，没有启动App、供应商调用或产品/测试改动。

可行性与约束：

- 仅当前真实Error的可信诊断可定位当前冻结transaction/version中的唯一claims task/local claim。焦点包含该task全部原metadata、字段存在性、有序claimIndexes及完整allowedSharedChoices；共享号元素语义明确，不增加任务、不猜局部序号、不代选/删源。Native、原域、拒绝资格、编译门、九原接受声明和四代限制保持。
- occurrence共享表只压缩重复展示。每claim的每次原域引用及顺序须逐项逆回；不同窗口指向同occurrence不表示CF可互换，不自动去重、分配或排除候选。该表须依原来源/成员几何构建，完整base资料仍保留。
- ≤16KiB含标签/声明/转义，追加前重验全部原预算；不fit、无可信定位或构建失败则整块省略，基底不变。source/retention/control至多一块，不为新块裁原raw/current/source/keep或改变已冻结deck。
- 本次审核指出的清旧顺序已在正文关闭：真实拒绝生成pending；下一prepare入口一次性取只读snapshot并立即清空存储；每个新parsed candidate先清再重算。invalidJSON/incomplete/transport/abort不能重建pending或重发旧块。三类focus须满足同一consume及互斥的可观察语义，可保留现有字段和原生成算法，无须扩大重构。

PRIVATE量化收据 `r73-control-focus-feasibility-freeze-private.json`（SHA `6c98aaa392fbdeff61ea4265f951601b437b98d90acb848a496cd11032026c24`）13项工具/输出哈希及当前57源已复核匹配。14个准备点13整块fit、0618 g3因无可信定位省略；最大5657B/fixed62013，逆投全等。这里只证明展示与预算可达，不能证明模型会纠正；原超限v4及R73实际失败保留，最终源码必须重测。

有限小样的权限和证据边界足够明确：固定七份材料的两代捕获仅作SHA/operation/payload绑定的不可信离线seed，仍走原拒门；每case最多2次真实final fetch、全局最多14、无网络重试，沿用生产输出设置。g4只能消费本次live g3的完整真实回复与当前诊断；早接受即停，non-schema/abort/auth/quota/HTTP不补发。严格before/after状态、原完整业务门、完整流及私有700/600保存须在执行层落实，不将已含小说的新传输标成无小说输入。

完整实际prompt/schema/wire取证应限定请求体和闭合元数据，不能把Key/header/任意异常正文带入日志。小样不改原实际前缀或结论，成功也只证明该固定seed条件下的新后缀；仍须fresh正常全文、原420000ms、完整资料复核、发布与持久化重开全部实际通过。

无剩余方案阻塞。后续485应把一次消费/invalidJSON不重发、原子whole-omit、完整域逆投、真实g4依赖新g3及14-call硬账列为可执行控制；此处未提前审核485。
