# R47 正常全文复验

398 独审、主代理 28 文件 594/594、类型/diff/桌面构建通过，最终源与完整 130/77 零 API 新提示预算一致后冻结 R47。未重建 UI，复核 303 renderer 及 UI 源与既有已验构建同 hash。driver 与 R46 逐字相同，两只 PRIVATE 旁观器及依赖 hash 不变。首轮预算失败 v1（be8e 超 fixed 1813 字节）保留；只有 native 且有 patch 的同义指导压缩，完整 data/原 draft/当前回复/choices/keep/3015 schema 保留，v2 全部通过且接受集仍 31/7。该离线证据不能预称供应商新输出通过。

全部 1402 章、5589 工作单元正常 fresh。2026-11-01 04:31:47.113 UTC 允许分析，04:32:36.837 在场景识别失败，04:32:39.333 正常 App exit 0、driver exit 2。25 实际 RPC 中 19 成功、6 失败，固定标签均为修复事务；成功覆盖 791 单元、426 成员、315 记录、309 身份、31 关系。不能按不同随机输出和停止位置的部分计数，声称整书改善或回退已量化。

59 次生成全部完成私有捕获，deltaText 与 completedOutputText 59/59 相同。观察器所有 pending/unmatched/ambiguous/observationFailures/limitFailures/writeFailures/retainedBytes 为 0，已恢复。根据同次结束快照完整规划 130 包，25 个 actual payload hash 全匹配并保留原 operationId；原样喂同次 59 回复、每代 inputTextSHA 全吻合，0 API 准确复现 19 成功、6 invalid_schema 拒绝。下一步仅据本轮失败定位 guard、展示候选与反馈是否被遵守，不继续盲改。

[固定标量与同轮回放](scene-import-verification/r47-normal-captured-replay.json)。全部场景、完整正文/事实/归属复核、发布及正常退出重开仍未通过，任务未完成。

## 同轮具体拒绝原因

六个失败包已分支定位：2 包末代为 old-mention，1 包为 old-context，1 包为同组完整 anchor 重复，1 包为对无 patch 资格的行输出 patch，1 包为 reply-shape（3 个无 patch 行的 patch.claims 为空，违反 minItems=1）。后三项由私有副本固定标签观察，原输入哈希仍同轮吻合，不改生产源。

两 old-mention 和一 old-context 包三轮均有选择当前 eligible 列表之外的真实 CF，后续实际 prompt 已收到准确的前代 reason；不能再称只是缺候选或缺反馈。同组重复包 slot22/context1 两未证位置各有相同的唯一候选、canReject=true，前两轮均选列表外 CF，末轮都改为唯一合法 CF 后又重复窗口。单项资格不代表联合合法。

无 patch 资格的回复不作部分采用：一包反复给 slot0 无资格行使用 patch 且借其它行已声明 pc；另一包对 3 个无资格行输出空 claims，原 reply shape 在 apply 前拒绝。不得为消除错误放宽资格或空数组门。下一步先用不含真实资料/密钥的合成 SDK transport 检查实际 body text.format，再讨论更强请求级契约；该检查不能追认历史 R47 未保存的 schema 正文或新供应商行为。

## 当前 SDK 传输格式核对

复用当前生产 factory/SDK/localModelFetch/ModelService/Gateway，在不联网且不读取真实凭据的合成最终 fetch 中观察两次 body。只检查 text.format 的固定结构及 schema 字节，未检查 headers 或保存 prompt；不追认未捕获的历史 wire。

- required=roster：type=json_schema，strict=true，schema 3272 bytes，SHA-256 `d8387207408d83b6510c3fc4c4b9770b5f327c6b496cdd570e1b88801e29c190`。

- required=repairs：type=json_schema，strict=true，schema 3015 bytes，SHA-256 `24bab9493e4fbf3707b5a2bfe20312a92c4f5c4885cd5cd048ca38f2abd83cfc`。

schema 与生成 options 对应 schema 字节深等；当前通用 schema 没有请求绑定 rr/pc/cf 枚举。主进程代码无 body 格式重写。以上只证明当前本地链传参，不证明供应商硬执行全部子约束。官方 [Responses 参考](https://api-docs.deepseek.com/api/create-response/) 列有 json_schema、name/schema；[兼容说明](https://api-docs.deepseek.com/guides/responses_api/) 表述 format 支持且不支持参数会忽略。下一步使用少量无小说资料的静态反指令例验证当前接口实际表现，继续保留全部本地门。
