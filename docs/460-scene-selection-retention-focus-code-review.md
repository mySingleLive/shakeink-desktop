# 460 · selection 兼容与保留背景独立代码审核

结论：限定通过，未发现阻塞，可进入 R67 fresh 正常全流程验收。本审核没有启动 App、调用供应商或读取小说、模型回复、Key；不代表真实全书导入通过。

已按 458/459 对照 R66 冻结源核实，57 个产品输入仅以下三文件变化，当前 SHA256 为：

| 文件 | SHA256 |
| --- | --- |
| `desktop/service/novel-import-ai.ts` | `b7572d8ffefa7e4d80639aa4207f0644d4d44beeb4151b37dd7c9c39acb99b2d` |
| `desktop/service/novel-import-scene-roster-bound-decisions.ts` | `323c65406279f60d830ca95b42bca9f8fed7807350a08b9dd2249f1ff955fc5c` |
| `desktop/service/novel-import-scene-roster-retention.ts` | `5d6314b01ca8c09364beb60b75c586952bbf3a4a95a3e687e11dcdb6f2d792a7` |

- selection 只接纳唯一 own data 字段的显式包装，再进入原整数及任务局部范围门；Proxy、accessor、额外键、继承值、非法数值拒绝，replacement 不解包。独立逆去兼容读取后，bound 整文件精确恢复 R66；Native、首次指导、编译器及其它解码逻辑不变。
- retention 原 `read/capture/verifiedRows/accepts` 保持原字节；独立逆去新增诊断后整文件恢复 R66。只读诊断按旧 universe 精确交集投影，保留完整受影响旧 owner 组、原 slot、已证窗口及出链端点闭包；新成员、重排及旧组重叠不误判桥接。返回数据复制并冻结，不能回写首轮证明。
- 背景仅在原来源门通过、原 retention 拒绝后构建，完整 anchor 仅唯一匹配原冻结目录时附既有 CF/共享号。完整转义块含标签最多 16384 UTF8 字节；先验证完整 base，附加后重验原预算，不适配则整块省略。每次实际 schema 候选清除两类背景；来源提前拒绝与保留背景互斥，未进入 schema 的 invalidJSON 仅保留标明旧值的背景。根恢复仍走原完整第一阶段校验，无局部采用或自动修复。

独立执行 Node 24 的新增三文件及旧 retention、source-focus、bound、Native、预算、strict-mode 共 **9 文件 152/152**，fail/cancel/skip 均 0。日志：`/private/tmp/scene-selection-retention-independent-controls.txt`。此前 retention 两文件独跑 **50/50** 与本组重叠，不累加。真实 SDK 合成链测试核实 Native 拒包装、本地兼容通过原门、四代持续坏答仍拒、真实 parser 多候选清除/更新、根恢复、16KiB 和 fixed/context 的 N/N+1、互斥、并发及数据转义。

已核 root 最终 **41 文件 760/760**、typecheck/build/diff exit 0 的收据及日志哈希，41 tests、22 helpers、57 产品源当前哈希吻合；未运行全仓测试。新增测试冻结 SHA：SW `239b394703101660135c5cad1bec5664e18d41c591cdb24225a2342b1a52f6e8`，RF `fb299df64b7ff00400ed2ffefcda6484f3ecd8fc164f365d8a8b7a7ad00575d1`，RD `8df62dfe70adce21815dbee9e1ecf21ec777b33a1de233eae060899a4e8aed0a`。

只读预算收据的 57 源哈希与最终源一致：fresh 129 与旧 130 首包、204 历史请求全部测量；418 旧回复分为 417 实际可达新 prompt 和因包装提前成功而未使用的 1 条，唯一结果变化对应显式包装，175 接受/29 拒绝。全部预算通过，fixed 最大 61304、schema 51739、组合 94017、最小完整 context 余量 663152。组合额度来自既有 450 的独立 schema 桶，本轮未增额度；不声称旧 prompt SHA 相同或新供应商行为通过。

已核已知失败的安全焦点收据：一组 5205B、1 owner/8 完整 anchors/8 精确既有 CF；另一组第 3/4 代均 6477B、10 完整旧 owner 组，来源及任务绑定检查通过。原坏答仍拒。全部为 0 API 离线证据；R66 历史失败、七分钟、发布及重开未通过的事实保持，须由 R67 正常实际验收另证。
