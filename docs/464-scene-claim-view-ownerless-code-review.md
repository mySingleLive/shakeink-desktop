# 464 · claim 发送视图与无旧归属资格独立代码审核

结论：限定通过，无阻塞，可冻结后进入 R68 正常 fresh 全流程验收。本审核没有 App/API 或产品修改，不代表真实全文通过。

对照 462/463 和提前保存、逐哈希核实的 R67 源，最终三文件为：

| 文件 | SHA256 |
| --- | --- |
| `desktop/service/novel-import-scene-roster-bound-decisions.ts` | `576563aa51b075806618dbabaa1398bf8c4702ac108c76e1b7bcbbd67d5f6246` |
| `desktop/service/novel-import-ai.ts` | `98b9a019269ea85bc9300115d9a0343eddd5428e55af87cc1b3a4f1b7cd84395` |
| `desktop/service/novel-import-scene-roster-claim-patch.ts` | `994bebe8e6a75bcb03097c780d41e0f0fc52d1ff6f9aa1bc11a03c1ffd0f727c` |

A/C 仅改发送副本：按原 slot/零基 claimIndexes 还原完整 metadata，保留全部 options 与顺序；四类 CF 字段经完整共享表双射变成整数，原 opaque 文本、rr/pc/sourceRef、keep、候选和重复项均保留。缺失、重复目录身份及坏引用拒绝，手写逆投精确恢复原 rows/tasks，private 对象不变。独立逆替两个 view 函数及纯类型声明后 bound 整文件恢复 R67；AI 只替换一处静态映射说明行，逆替整文件恢复 R67。Native、decoder、编译器、fallback 排序及其它 AI 函数原字节保持。

B 只对 strict firstRecord、原 proof mentions 为空且 links 空的子集扩资格；该子集 raw-valid context 也转为待显式决定的 claim，不进入 pending 基底。mention 原检查保持，无法安全分类仍保守 fallback。逆去 ownerless 声明和两个条件后整文件恢复 R67；原 select/apply、原旧 owner/links 路径、重复/发生位置/借用限制、联合域阈值、整组 fallback 与全 owner/source/retention 门不变。未知字段、metadata 或部分类型不能借此取得新资格。

独立 Node 24 定向 **9 文件 176/176**，另两个修订夹具 **20/20**，均 exit0、fail/cancel/skip0。日志 `/private/tmp/scene-claim-view-ownerless-independent-controls.txt`、`/private/tmp/scene-claim-view-ownerless-independent-fixture-controls.txt`。覆盖新增 CV29/OC13、原 claim/budget/bound/guidance/eligible 与两类 focus，含实际 SDK 合成链的显式选择、完整保留、四代坏答拒绝及 2/3/4 代 UTF8 context 和 fixed N/N+1。新测试 SHA：CV `2b2f88b9d0e2edee253932d59d105eeeacc049f57d7be1a7cfae203175bd97d0`，OC `b08b1e3d44eb7a9c606675ab424ec4036c80e2af711702ef28f303359e9dd459`。

已审读取 helper 的严格逆投及 BG03/BG03b 手写稀疏 rows。CC02 仅把旧字符串存在断言改为真实 keep 共享号/目录 CF 检查；NR02 仅给首坏稿加合法 legacy name/aliases，继续实际覆盖完整 replacement 的三分支 Native。三处修订分别逆向后精确匹配 R67 测试哈希，原领域/Native deepEqual 断言保留；其余旧测试未改。根首次 800/802 的夹具失败记录保留，最终 **43 文件 802/802**、types/build/diff exit0；已核 43 tests、23 helpers、57 产品源及根日志当前哈希。

独立审阅并核哈希的历史工具使用冻结 R67 CJS：后续答须原实际输入前缀 SHA 已证且完整 rows/claims、task kind/slot/index/options→CF、共享目录/窗口及 schema 指纹相同，才可复用。不同或未知先测 prepared 请求再停 SDK；不靠相同 arity 或旧数字偶合判断新语义。v2 收据为 224 请求、382 prepared 历史 prompt；452 捕获中 296 使用、156 未使用（15 合同变化、141 绑定未知），无未解释项或 blind reuse。新 129/旧 130 首轮全部通过预算，4912 单元完整重拼保持；fixed 最大 64415、schema 51739、组合 92883、context 最小余量 663722，errors0。57 源、冻结 baseline CJS 和 8 工具哈希均吻合。

以上没有产生新供应商回复，不声称旧接受数不变、452 次新调用或未见答复的语义成功。R67 失败及全文、七分钟、发布/重开未通过事实保持；R68 仍须正常实际完成全部场景、完整复核、发布、重开及 DB 比较。
