# R28 私有驱动与持久化验收器独立审核

## 结论与范围

R28 驱动准入通过，可使用下列冻结版本启动真实新会话。相对已审 R23 驱动的三处增量不执行作者决定，不改业务状态，不放宽原场景计时、复核、发布或正常关闭条件。

持久化森林比较方案成立：按真实 parentId 建边，比较七个完整映射业务字段及子树的多重集合，允许数据库重新生成 ID，同时保留同名、同父、同型节点的数量。初审指出的两项验证器边界已由主代理修复并经独立复验，当前驱动及末端脚本均无审核阻塞。

本次只读审源与运行合成检查；没有读取小说、配置、私有会话数据，没有启动应用、调用模型或执行真实重开/数据库验收。全书发布、持久化和重开仍须本轮实际执行后判断。

## 驱动增量

对比 `/private/tmp/shakeink-scene-import-20261031/run-r23-review-conflicts-hold.mjs` 与 R28 驱动，实际只有三组差异：增加 identityHeldHash；场景边界新增账本形状/交叉引用/哈希检查及标量统计；detect-scene waiting 时若存在选中的 unresolved 候选，保存私有会话证据并等待正常 UI 作者操作。

- hold 分支没有自动 source/inferred、分配、合并、改名、parent 或 defer 操作，没有直写 journal，也没有伪造成功或 coverage。
- 原 420000ms 场景钟仍从“允许分析并导入”开始，身份确认等待不暂停、不重置场景钟。lastChange 的更新只避免将作者等待误判为无响应，不能使超时通过。
- 原全部选中、任务/候选/产物 ID 全等、零 skip/drop、正文/源文件不变、章节几何、正常复核/check/publish/final-close 条件保持。
- 场景边界调用 assertSceneIdentityLedger 不提供 sources，因此这里是账本内部合法性证明，不能据此声称独立重证所有原文锚点。
- 数字 observer 加载、退出和清理保持 R23 原版本，没有新业务包装或产品热补丁。新增原始会话证据仍写入本轮隔离目录；已核其父目录权限为 0700。不得把该私有证据复制进仓库或普通日志。

驱动 SHA-256：`8d5b2e32b26e500115c50c5c840a095768152786ac6b26046908cd21a306e0a5`。

## 末端组合门

`verify-r28-final.mjs` 保留正常 shutdown/app exit、420000ms、全部场景任务/层级、零丢弃、原文/章节、原完整 review coverage 门；新增严格检查 ledger、无 unresolved、当前 expectedSceneOwnershipKeys 与完整 ownershipReviewed 集合恰等。没有把旧来源覆盖替换成新 ownership 指标。

`verify-r28-snapshot.mjs` 在应用正常关闭后的隔离数据库中执行 BEGIN READ ONLY 和 SELECT，按 scene material ID 逐项 isDeepStrictEqual 比较 `{...artifact, characters: artifact.text.length}`，包括原 text、facts、evidence、sourceUnitIds、schema 与其余元数据；同时深等完整账本和正文，最后 ROLLBACK/close。它没有把材料比对缩为名称或字段子集。此轮 targets 恰为 scene，结论准确范围是全部场景材料。

`scripts/verify-lotm-scenes-persistence.mjs` 通过真实应用只读 IPC 重开读取七个映射业务字段、实际 parentId 森林、章节与正文、导入记录账本；其材料检查本身只比较 scene ID 集合，完整材料证明由上述独立快照门补足，不能单独把此 IPC 脚本当完整材料深等验收。

森林 helper 以叶到根的迭代过程计算 `{fields, sorted child hashes}`，不按显示名去重，不配第一个同名节点。完整 root hash 数组保留重复数量；独立 visited 计数会拒绝与正常根分离的环。没有递归深度限制引起的栈溢出。七个字段为 name、description、coordinates、exteriorDescription、interiorDescription、backstory、entryMethod；其余导入 facts 由完整材料快照检查。

## 初审边界与修复复验

1. 初审 helper 对 `id:''` 未拒绝，且把 `parentId:''` 或缺失值当作 null root。独立合成已证明这会把非法 ID/root 形状视为合法森林。应要求非空 string ID，仅显式 null 表示根，其余 parentId 必须为非空 string 并实际存在；已有重复、孤儿、自环和非根环门保留。
2. IPC 重开输出 `comparedBusinessFields` 当前按节点数乘 4，实际比较七个完整字段。应改为乘 7，或明确改名为四个 profile 字段的统计，避免验收摘要与真实门不符。

以上只涉及验证脚本，审核者未修改脚本、测试或产品。主代理随后仅收紧 ID/root 形状，保留原森林算法，并把字段计数改为乘 7。独立重跑新增用例后的定向组 3/3 通过；重复运行七字段突变、ID 重排、同型节点数量、20000 深链与孤立环合成均通过，空 ID、空 parent、缺失 parent、数字 parent 四个反例均拒绝。R28 运行中的产品构建与驱动未因该验证脚本修正而改变。

## 实际检查

使用 `/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node`：

- R28 driver、IPC 重开脚本、两个 R28 私有末端脚本的 `--check` 均 exit 0。
- `--import tsx --test tests/unit/scene-import-persistence-verifier.test.ts`：2/2，通过。
- 独立内存合成：七字段逐个单字符突变均使森林不同；重排节点并改数据库 ID 后森林相等；相同根节点数量不丢；20000 节点深链正常；正常森林外附独立环被拒绝。全部断言通过。
- 独立边界反例：emptyIdAccepted=true、emptyParentEqualsNull=true，已及时反馈主代理。

初审核对的 SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| `scripts/lib/scene-import-persistence.mjs` | `f52175dea2b3aca04ea102bba5d20a4697c8ea6fab327ede9e84f678c733005a` |
| `scripts/verify-lotm-scenes-persistence.mjs` | `b874652eea2e563e1191693835b3dadb9f41f5d5e4f7375b6386b2c3cd3cfde2` |
| `tests/unit/scene-import-persistence-verifier.test.ts` | `64a4c96c85bc3ed019c0e955ff67525b7e41d938996a24963c157edec5e11904` |
| `verify-r28-final.mjs`（私有目录） | `13a1d7cd3713990f10dd53e9dcd8f3f9c8377bf5bbca9eb6c217c6e948233155` |
| `verify-r28-snapshot.mjs`（私有目录） | `b8f124ec3f0365328458a02d8303519039e42dcbf9e431f2ac21b742292a5f06` |

最终复验冻结 SHA-256（替代上表前三项初审版本）：

| 文件 | SHA-256 |
| --- | --- |
| `scripts/lib/scene-import-persistence.mjs` | `509ebad1a048748b6baa3c8c2153ece9eff7d6bd1656f506d36ecaf367b0a1a1` |
| `scripts/verify-lotm-scenes-persistence.mjs` | `51f771932246f1511768ec7ad9baa1a59d365c1de8f7588f11bc2bc1c4bc553a` |
| `tests/unit/scene-import-persistence-verifier.test.ts` | `e7be53438911cfd7759243fee2e6e58392172e4fcbf996ec006b418e00c3f9be` |

R28 driver 与两个私有末端脚本最终 SHA 仍与初审表完全一致。批准的是这些静态脚本及其合成验证；没有预先批准或宣称尚未执行的真实全文、发布和重开验收通过。

## R29 私有诊断保留增量

R29 driver 相对上述 R28 冻结版本的精确 diff 只有三处：新 evidence 目录显式 0700、save 文件显式 0600、preserveSceneCheckpoint 额外读取同一 session 的 runtime.json 并原字节写入私有目录的 `scene-${reason}-runtime-private.json`（0600、wx）。它只忽略文件不存在的 ENOENT，其他读取错误重抛；没有解析或修改 runtime、没有从其注入状态或控制操作，也没有将其正文打印到普通日志。session checkpoint 原逻辑与完成标记顺序保持。

AI 调用、业务状态、证据/引用门、正常 UI 作者操作、原 420000ms 计时和后续发布/关闭条件均没有改动。Node24 `--check` exit 0，实际 SHA-256 与声明一致：`7dc85c5c8b963e6eea47080c4e77827ec908f300ef07599452093f305f808c46`。该增量准入通过，无阻塞。

本次没有读取真实 runtime/小说/配置或启动 App/API。R28 已实际失败；此处批准诊断保留方式，不将其失败改记通过，也不预判 R29 真实结果。

## JSONB 键顺序纠正

IPC 重开脚本的完整账本比较由 JSON.stringify 字符串相等改为 node:util 的 isDeepStrictEqual，准入通过。独立反移新增 import 和该单个比较表达式后，字节哈希精确恢复上述最终旧 SHA `51f77193…`，没有其它门变化。对象键顺序不承载 JSON 数据语义，深等仍保留全部字段、值及数组顺序；独立合成验证键重排通过，数组重排、缺失/额外字段和值变化仍拒绝。Node24 `--check` exit 0。

该只读验证脚本新 SHA-256 为 `01c891c678b7aeba8aa2d3eb0f7db6ae026e417a6f8cf4d0421c4166a1b35f25`，替代前面的 `51f77193…`。完整材料快照脚本原已使用 isDeepStrictEqual，森林及其他验收门保持原版本。没有访问真实目标数据库或改变运行中的 App/产品构建；真实持久化和重开仍须实际执行。

## R34 私有脚本差异审核

限定五分钟只读差异审核：通过，无新增阻塞。helper/reconstructor 相对 R33 仅文件标签更新；final 逐字节相同，snapshot 仅 R34 路径标签。build 新增 esbuild metafile 本地输入哈希记录，runner 在启动前比较 manifest 列出的全部源哈希和 helper bundle 哈希。运行前提是主代理先冻结最终产品/源，再构建该 helper/manifest；这不是并发改源时的原子构建证明，也不替代主产品独立 freeze。

原拒绝模型元数据写入、数据库 Proxy 拒绝访问、native 授权、模型状态哈希不变、正常 quit/exit0 与私有原始输出 0600 均保持。六文件 Node24 `--check` 全部 exit0；审核者未运行 build/App/API、未读 request/raw/小说/Key。下表仅批准脚本，不能作当前请求或全文已通过的证据。

| 私有文件 | SHA-256 |
| --- | --- |
| `diagnose-r34-scene-roster-readonly.mjs` | `25267b0899ab99284e2729f2ed17dd82fb47b1a1148c98ca7398e4204c8aea5b` |
| `build-scene-identity-roster-r34-diagnostics.mjs` | `8a708bba2a5cddf7ed54ec4c21abeaf5fc54bc3727d3f3a11c5f7d1637a6a0b2` |
| `scene-identity-roster-r34-diagnostic-helper.ts` | `7d7619c07706aa932370ca2bc62edeb62d74902a0f00766b20e69dd4d1e42f6d` |
| `reconstruct-r34-scene-roster.mts` | `7ec31005d0b2eec945c1846e36ff6c4adbe6b66561621bdd99df5cb4b618c7b8` |
| `verify-r34-final.mjs` | `13a1d7cd3713990f10dd53e9dcd8f3f9c8377bf5bbca9eb6c217c6e948233155` |
| `verify-r34-snapshot.mjs` | `d6f6ebfb6ef9376b6b7f8876f5a7cbfc408a8351a2f01f55e723244b4e84d15a` |
