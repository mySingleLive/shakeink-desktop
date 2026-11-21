# R66 来源分区与修复资料聚焦实际验证

R66 正常新会话实际失败，状态为 `actualFailed`。2026-11-01 11:41:38.207 UTC 允许分析，11:42:30.590 在 `detect-scene` 失败，11:42:33.373 正常关闭；App exit 0、signal null，驱动 exit 2，启动 PID 已不存在。52,383ms 是允许分析至失败的时间，不能计作七分钟完成达标。

本轮规划129个首轮请求，实际启动31个场景清单 RPC：28成功、3拒绝。失败快照覆盖1039/4912工作单元，保存699成员、425记录、422身份、16关系；正式 artifacts 为0，workingRevision 为0。这些是部分识别账本计数，不是已导入场景数。

独立核对61份私有生成捕获：全部 `captureComplete`、流闭合、provider completed，逐份 delta、done、completed 文本完全相等，解析/UTF8/终止冲突计数均0。根代理原请求零API重放凭据包含31个原请求、61代，输入 SHA 全匹配并复现28成功/3拒绝；本次独核逐 transfer、operation、payload、delta SHA、字数及结果与捕获交叉对应。3个失败事务的细分首拒仍待另行诊断，本文不以错误类别推测根因。

文本观察器61/61，pending、unmatched、ambiguous、观察/限制/写失败及 retainedBytes 均0；RPC观察器31个请求全部结束，两者均完成恢复。数字内存观察器停止后 pending/workers/timeouts/writeFailures 均0。原始回复、输入及运行快照只保留私有隔离目录，本文与公共JSON仅含标量和指纹。

独立重算冻结身份：57个源码、8个 bundle、303个 renderer 文件、38个测试、22个测试 helper、3份审核文档均匹配 R66 清单；私有驱动、Electron runtime、两观察器源码/产物也匹配。Renderer 沿用已核相同的 R65 产物，本轮没有新跑 UI 构建。正文原文件字节 SHA 未变，4,785,312 UTF16 正文与R65逐字相同，1402章的 start/end/content/title 亦完全相同。新 `sentence-1000-v3` 产生4912个工作单元，最大1000 UTF16；唯一ID、连续偏移、零重叠/遗漏、重拼正文及 surrogate/CRLF 边界检查均通过。此处只证明分区保真，不能证明全书所有称呼都不跨单元。

构建前721/721定向节点、types/build/diff通过，以及129个新首轮、130个旧首轮和357代历史材料预算通过，属于本地回归与历史资料证据；不是R66实际全书验收结果。R65旧失败报告与记录保持，未覆盖其实际结果。

本轮未完成全场景识别或导入，未进入完整正文/事实复核，未发布，未验证重开。全文、七分钟完成、发布、重开四项均保持未通过。

证据：[安全标量记录](scene-import-verification/r66-source-boundary-focus-normal-observation.json)、[R66冻结构建](scene-import-verification/build-identity-r66.json)、[代码独审](456-scene-source-boundary-focus-code-review.md)、[R65历史失败](453-scene-inline-keyed-real-verification.md)。独立离线核验脚本为私有 `verify-r66-evidence-independent.mjs`，Node v24.18.0 执行 exit0，无App、模型或业务写入。
