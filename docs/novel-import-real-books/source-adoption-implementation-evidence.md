# 61/62 已有来源草稿观察绑定实施证据

日期：2026-10-26。61 生效方案 SHA `4f2643c7906f2eb7cc9f84fd6c928ca2434652357863a2d86ded84ed9b1bae74`。仅修改 observer，新增 source-adoption verifier；已冻结交 63 独审。没有读取实际 S02、真实 corpus/journal、用户库或模型，也没有操作应用、写入真实 journal、修改 oracle/原件或构建。实际绑定由 root 在审核后执行，不在此追加真实首次 AI、LIFE 或文学质量信用。

## 最小实现

- freeze 新增可选 `--adopt-source-session`，canonical UUID 且仅 freeze 可用。existingJournalIds 仍完整记录并包含该 ID；另存 adoptedExistingSession 的模式、UUID、原 createdAt/revision、目录身份、首次 journal 读取身份/hash 和 owner hash。未使用新参数时不新增 null/默认 adoption 字段。
- 创建 run 前校验指定 UUID 的真实目录、精确 owner、journal.id、完整冻结源路径/hash/included，以及 semantic1/source/working0 空正文、零产物/作者数据/信用、无 grant/checkpoint/semantic/runtime 记录。来源与独立 oracle 继续原完整 hash 流程。
- **64MiB 仅用于首次 source 绑定窗口**：打开后 fstat 先拒超限，有界 read（不超过 limit+1），核对前后文件/目录身份。写 run.json 前再读同一来源草稿，比较原字节及设备/inode/size/mode/link/mtime/ctime 等读取身份；并发变化即拒绝，保留 partial 证据并要求新 run 名，不回写 journal。run 目录独占创建，adopt run.json 亦拒已存在输出。
- 后续 observe 仅 pin 目录身份、UUID/journal.id、原 createdAt、owner 与 corpus 内完整来源集合/hash/included；只读该 UUID，不扫描或 fallback 到 decoy。正常 journal 原子 rename、phase/revision、AI 产物和工作正文推进允许，**不继续要求首次 inode/hash/0AI，不沿用 source 的 64MiB 容量**，journal 读取使用原 regular_bytes。
- 默认新建扫描分支与后续安全投影保持；regular_bytes、runtime_diagnostics、record_build 的源码字节 hash 对照真实旧基线不变。严格 runtime parser、build identity 与旧 runtime verifier 未改。

## RED 与收敛

真实旧 observer 先存 `/private/tmp/adoption-61-baseline/observe-real-novel-import.py`，SHA `2f7db9e979798b888c9e5be1c186800d3135a43478ee13a04726db1987051a4e`。

[初始 RED](evidence/source-adoption-red.txt) 与独占 `/private/tmp/novel-import-adoption-author-red-1.json`：新 verifier 在重绑为临时合成根目录后，执行原 observer 的真实 CLI guard，原版没有接续选项，0 passed/1 failed、exit 1。此 RED 仅证明原工具没有该模式，不声称所有后续安全反例都已在旧版逐项失败。

首次实现验证在 92 个必要断言后遇到新 verifier 的 read spy 把旧 corpus/oracle 读取也当作 adoption 读取；[原始日志](evidence/source-adoption-first-implementation.txt) 和独占 green-1 结果保留。只将 spy 限定到候选 journal/owner fd；普通读取没有因此加全局容量。收尾补齐新 mode 的 corpus containment（即使篡改后的 metadata 与 journal 一起指向外部也拒绝），并收掉 verifier 内部合成 freeze 的额外 stdout。之前结果均保留，未覆写独占 JSON。

最终仅两条批准检查，各次只使用新 output 路径：

```sh
python3 scripts/verify-real-novel-source-adoption.py --output /private/tmp/novel-import-adoption-author-final-3.json
python3 scripts/verify-real-novel-runtime-observer.py --output /private/tmp/novel-import-adoption-runtime-author-final-3.json
```

| 最终日志 | 实际结果 |
| --- | --- |
| [source adoption](evidence/source-adoption-final.txt) | 130 passed / 0 failed，exit 0；JSON 通过 `open('x')` 独占创建 |
| [原 runtime observer](evidence/source-adoption-runtime-final.txt) | 原 24 passed / 0 failed，exit 0，未改旧 verifier |
| [必要 py_compile](evidence/source-adoption-pycompile-final.txt) | 两脚本 OK，编译产物写临时目录 |

新验证仅使用临时合成 corpus/oracle/journal：完整 existing IDs、明确绑定、无模型凭据导出；UUID/owner/链接/别名/来源/hash/included/各类已处理数据拒绝；64MiB sparse 超限 stat 拒绝、字节边界和有界请求；读取中变化、原子同字节替换、同尺寸恢复 mtime 的双读失败；partial/旧 run 不覆盖；后续目录/createdAt/source 漂移拒绝、decoy 不接管；正常原子 journal 替换与 AI 增长可观察。将 source cap 临时降到 1 后后续观察仍通过，以防误套首次容量。投影仍排除 endpoint、Key、grant 和无效 runtime 自由字段，默认 freeze 元数据字段集合及新建 journal 观察保持原口径。

## 冻结身份

```text
138767ccdf6fc6cfc479fe3736a72435e689b9da80bbcfacefd5e833603acfca  scripts/observe-real-novel-import.py
d4b2253f60c8d914bda93ddae637e32ff0e518baadc20eda92e23ac8d769c37e  scripts/verify-real-novel-source-adoption.py
```

[完整两文件差异](evidence/source-adoption-implementation-delta.diff) SHA `e258a09f6e6546dab06a6570c9cb44712af76cafa1e6f991baa4a2ae23772abb`。原 `verify-real-novel-runtime-observer.py` SHA 始终为 `e0ab69b0c80e8637200e7412b59c919bf3ce05a274e4298d0a739ab45edf2032`。未执行其它 suite、真实数据探针或应用动作。
