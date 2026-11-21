# 468 · 同称呼联合选项独立代码审核

结论：限定通过，无阻塞，可冻结后进入 R69 正常 fresh 全流程验收。本审核没有 App/API 或产品修改，不代表实际全文成功。

最终源 `desktop/service/novel-import-scene-roster-claim-patch.ts` SHA256 `0a6e9e07bf74381a0b407520bca92b87afbe7fdd71ff537f5d25ab65b0481030`，新测试 `tests/unit/novel-import-scene-roster-joint-mentions.test.ts` SHA256 `9c63c8f11a24511f52400e262641ef352ca4bc381a35062b6d8d93bd9139dfce`。

已按 466/467 对照改源前核哈希保存的 R68 文件。唯一变化是 boundGroups 内三个 mention 分组语句：按原 claims 扫描、以 exact literal 的 Map 首次出现顺序建组，组内原 claimRef 顺序调用同一个 select。独立逆替后整文件精确恢复 R68 `994bebe8…`，其余 56 产品源相同；select/apply/memberKey、资格/eligible、context/link 组、原编译器/Native 工厂/fallback、source/retention/owner 门均未改。不同 literal 不合并，无窗口或 CF 域裁减、默认选择或额外生成。

独立 Node 24 **7 文件 159/159**，exit0，fail/cancel/skip0；日志 `/private/tmp/scene-joint-mentions-independent-controls.txt`。包括新 JM6、旧 bound/claim/ownerless、A/C 和两类 focus。JM01 用真实业务入口及 Mock SDK 明确作答；手写8组合完整 oracle 保留不同窗口，拒绝不同 CF 指向同一 occurrence。交错 literal/Unicode、原 claimIndexes 与 context/link 顺序检查通过。

阈值测试经过实际原编译器和原 select：完整256合法窗口方案保留；下一源域触限时此前成功组也清除，整行仅 replacement，目录不裁。自然工作量4095/4096保留完整组、4097整行fallback；16行各4096累计到65536后，下一行在首个验证前fallback，既有行不丢。没有修改阈值、注入镜像计数器或保留部分组合。

已核 root **44 文件 808/808**、types/build/diff exit0，当前44 tests/23 helpers/57产品源和根日志哈希匹配；全部旧43测试及23 helper均与R68逐哈希相同。未运行全仓测试。

已核冻结 R68 baseline CJS、8个历史工具及最终预算源哈希。260请求/519原捕获中，仅原实际输入前缀和完整最终语义 binding 均确证时复用；300使用+219未使用（4合同变化、215绑定未知），无盲数字或未解释项。440个prepared历史请求及新129/旧130首轮全部预算通过，fixed最大65396、schema51739、组合99577、最小context余量645140，errors0；现有独立schema桶及其它额度未增加。已知失败事务由39变32任务时停止旧3条后续答，不把旧数字解释为新选择或伪造未见回复。

单例私有反事实与上述离线预算均为0 API，不是新供应商结果。R68 actualFailed及全文、七分钟、发布/重开未通过保持；R69仍须按原计时正常完成全部场景、完整复核、发布、重开及全量DB比较。
