# 482：联合组决定、列式展示与准备头寸独立代码审核

结论：**限定通过，可以冻结本次构建并进入 R73 正常全文验证。** 本结论覆盖 480/481 的产品实现及验证基础设施，不代表真实全文、数据复核、发布或重开验收通过。审核期间未启动 App、调用供应商、读写业务数据库或修改产品/测试源码。

## 最终冻结范围

| 文件 | SHA-256 |
| --- | --- |
| `desktop/service/novel-import-ai.ts` | `5d9d4e65149867eaf92a214b94ee510a456559a0d23f650d0b1f9c67acb3a852` |
| `desktop/service/novel-import-scene-roster-bound-decisions.ts` | `e64f93a85827822d30c58f20b63b5ec6a77824d5d7a83f9628ad30207f2f68fa` |
| `desktop/service/novel-import-scene-roster-targeted-repair.ts` | `20b411e3b73538ef108484657504ac76ccaa2425f7e4dab0702bae474987a585` |

对照实施前原稿，核查完整组编译、同 slot 分区合成、列式逆投、准备版本/预览状态以及 AI 提示与激活路径。原 claim-patch、retention、核心预算和主导入控制器不在本次产品改动范围。AI 九个原严格结构/证明声明及 bound 五个原编译/结构函数的 AST text 对照一致；原 source、owner、retention、remap、patch.apply 与四代限制继续执行。

## 实现核查

- fresh `joint-groups` 只对原多 claim 组尝试完整联合枚举，保持 256/4096/65536 原编译门；singleton/失败组进入同 slot 的完整 claims remainder。降级不保留半个组、不重编译或重置计数，组降级加整行 replacement 的转换次数有界于 G+R。合成前严格检查原 claimIndexes 恰好覆盖、互不相交，再交原 patch/source/owner/retention 门。
- 新 Native selection 使用可信冻结 deck 的 `selectionEncoding:'object'`，主表示为闭合 `{selection:N}`。本地旧数字/wrapper 兼容保留；claimChoices 兼容只在完整逐位数组精确匹配唯一原 option 时成立，不排序、去重、猜号或补默认值。原默认 Native 19,491 字节 schema 的 SHA `e3b3997558bfc48b647b12b75c36dff3c9c50b12c83c36daa01370529eba9c52` 深等证明成立。
- 十列 claim 展示保留 presence mask、字段值、数组顺序及完整域；省略的 task domains 可按唯一 slot/原 claimIndexes 完整还原。未知字段、非法类型和不完整映射拒绝，未裁原 raw、current、source、keep、CF 或选项。
- 5000 字节为准备阶段软目标。先取得原三桶 hard-fit，再非破坏预览完整 bundle；只有下一候选全部硬门通过且 fixed 严格下降才原子 commit，否则 discard 并保留当前有效 bundle。预览 token 私有、绑定 owner/version、仅一次提交，废弃/过期预览不能 decode 或 activate。激活后 g3/g4 不再改变 deck，软目标不构成新的硬拒绝条件。
- 可选 focus 仍整块计量与省略，原 source/retention 互斥生命周期保持。没有增加生成次数、源范围或硬预算额度。

审核发现并关闭两项问题：其一，新 object selection 被拒后仍出现旧“不能填对象”指导；已加入可信 mode 的固定纠错文案并以真实 SDK 下一代提示测试关闭，默认旧指导不变。其二，过期 deck 的 legacy `decodeRoot` 分支仍可调用 callback；已在入口加入 `ensure()`，真实 RED 后验证 stale callback 为零、当前 legacy 仍可用。相关日志为 `scene-retry-headroom-feedback-{red,green}.txt` 与 `scene-preview-stale-legacy-{red,green}.txt`；均位于私有临时目录。

## 执行证据与边界

本审核独立执行 11 个相关产品测试文件，**143/143**，失败/取消/跳过均零，日志 `/private/tmp/scene-joint-482-independent-final.txt`。另独立执行 contract fingerprint **7/7**、正常退出 helper **6/6**，分别记录于 `/private/tmp/r73-fingerprint-reviewer-controls.log` 和 `/private/tmp/r73-normal-quit-reviewer-controls.log`；这些子集不与产品或根代理总数相加。

根代理最终 53 文件 **889/889**，失败/取消/跳过均零；`r73-scoped-tests-receipt-v2.json` 绑定 53 测试、25 helper、57 产品输入，日志 `/private/tmp/scene-joint-groups-root-combined-v2.txt`。最终 typecheck v2、desktop build v4、diff v2 均 exit 0。审核末再次核对当前源码与 scoped、budget、counterfactual 和 tools 收据共 395 个哈希匹配项，无不一致。

`r73-build-gates.json` 对应最终 v4 预算证据：

- 368 历史请求/719 捕获身份集合完整，368 个当前首提示 SHA 和 719 个原 delta SHA 均核对；612 个可达 prepared 提示，385 捕获使用、334 未使用（25 contract changed、309 binding unknown），无盲用旧数字、无未解释账项。新 129 和旧 130 首提示均计量，完整 4912 单元与源正文重组保持，errors 0。历史收据不证明新供应商行为或新提示 SHA 与旧值相同。
- 五个不同 run+payload 的四代压力共 **20** 个完整提示全部 fit；其后代使用完整新合成故意非法负载，不冒充真实新答。最大 fixed 62,227 字节、schema 20,962 字节。
- 最终两包反事实/压力收据 `r73-joint-counterfactual-v3-freeze-private.json`，SHA `19e24d05c5040f62399379cd6b07ae8039b32b61bb3232486a6a82dc86d7d1a8`：原首提示 SHA 对核、新显式决定经 Native 与完整业务门 2/2 通过、首稿已证事实全部保留、目标 10/3 完整选项保留；原坏回复完整负载可达 g3/g4，最大 fixed 64,825。该收据为 0 App/0 供应商调用的反事实，不是实际全文成功。

私有 fingerprint 对新编码绑定完整实际 provider plan/deck、Native、source 与首回复身份，未通过逆投抹去编码差异。history 工具在绑定未知或变化时停在 SDK 前并完整记账。`r73-budget-tools-freeze-v4.json` 的 20 项输入/证明哈希复核一致，旧版本工件保留。

正常退出基础设施依照 481 补充审核实现：同一绝对 deadline 覆盖 evaluate 与进程退出，超时/拒绝/非零退出不被 cleanup 0 翻案，timer/listener 清理；原 finally 的 evaluate-never 真 RED 与新 6 项纯控制均有收据。重开验证脚本纳入冻结，真实重开仍未执行；森林语义匹配不宣称数据库生成 ID 与 artifact ID 逐值相等。R73 snapshot 路径已绑定本次运行，R71 preflight 与 R72 原失败工件未改写。

本次无剩余代码审核阻塞。R72 的 33 RPC/31 成功/2 拒绝事实与原状态内容变化记录保持；R73 尚未开始正常实际运行。必须继续原总计时、完整 source/业务数据复核、发布、正常退出与持久化重开验收，未完成项继续为 false。
