# 337 片段与名称编码独立用例审核

前置：336 技术方案已按序独审通过。审核用例 SHA-256：`e8c529b3d0f967b0d9ff37de04a4ebac4bf482da473d9ff551e2ff5f3062d17d`。

结论：通过，无用例阻塞，可进行合成 TDD。

- FA01 验证完整原文重组而非只有片段数；覆盖连续标点、空白、CRLF/CR/LF、surrogate、组合字符、空 text 与无标点，并以同 ID 改文字/交换当前单位顺序防止旧目录复用。
- FA02 经真实 JSON generation 桥与 service-final 对照完整合法 raw/canonical，覆盖两种 anchor、两种 record、混用及首坏次好；检查所有 mentions/context/links、长引文和全部 exact 别名保留。
- FA02-N 保留整体严格形状、非法索引/primary、混合键、直接 own undefined、后置坏行/证据、双唯一失败、原名称不对应及 21 个别名反例。坏 raw 不得 fallback，新分支不得截断别名；反馈只允许固定字段/安全索引与静态理由，最多六条、250 UTF-16 code units。
- FA03 验证真正替换发送 text 且完整保留其它 metadata/输入；同一 serializer 在 planner/worker 与实际角色预算边界生效，新增 metadata 不豁免、不裁剪。保留非 scope byte 黄金、旧 raw 与 canonical 回归，以及原 cap/两次和 16KiB reserve。

先用旧真实 generation 入口证明新合法 wire 不被支持；未实现 helper 的模块缺失只说明尚未实现，不能充作整条功能 RED。记录真实执行节点和未达断言，不用表格数量代替结果。私密哨兵仅检查模型 raw 引入部分或新增反馈，不应把原 payload 中合法保留的合成资料误判为泄漏。

GREEN 后须独立 code review、必要服务回归、tsc 与 diff 检查。合成成功不保证模型选择可唯一定位的片段；实际接口仍坏须原门拒绝，fresh 全文、作者决定、发布与重开由主代理另验。审核者未改产品/测试、未启动 App/API 或读取真实资料。

实施前增量复核：版本 `c4e7f7da4032996d00b29bbc10f51939462bb957b4eaf383ad12c0f5d5096705` 仍通过。FA02-N 增加实际 wire 路径映射与扩大连续片段但保持 literal 唯一的指导断言，与 336 同步；没有改接受集合或放松持续坏值拒绝。实际新 payload 必须由最新 planner 产生并完整计 metadata，不能假称旧包几何/哈希保持。
