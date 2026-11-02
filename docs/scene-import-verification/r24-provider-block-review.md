# R24供应商阻塞独立核验

2026-10-31，`scene_fix_review`只读核对R24私有失败/关窗前检查点、events末尾、observer停止及page-errors，并重新计算18项冻结文件哈希。未启动App、调用模型、重试HTTP402或执行产品/测试/构建变更；本文仅含计数与哈希。

**结论：R24被记录中的外部HTTP402中断，完整验收未完成。** [公开阻塞记录](r24-provider-block.json)与所核私有证据一致，部分场景成功不能记为全量通过。

| 快照 | 已完成 | HTTP402失败 | 当时running | waiting | 场景资料 |
|---|---:|---:|---:|---:|---:|
| 首次失败，revision126 | 555 | 5 | 30 | 386 | 555 |
| 关窗前，revision128 | 560 | 18 | 21 | 377 | 560 |

两个快照来自同一运行，不能相加。关窗前的running是该检查点状态，不代表应用退出后仍有这些请求在运行；该快照也不是最终发布结果。

- 976候选全部选中，976任务均为entity，任务candidateId与候选ID集合精确匹配；0跳过、0丢弃。两份快照的失败项均记录HTTP402。
- 1402章标题/卷/边界与冻结基线匹配，workingRevision为0；工作正文SHA-256为`81d901770a84a1280664fa77dbf30922aa5b8d52a208417af0c99dbb7ad07414`，与原基线相同。检查点记录的源文件hash亦匹配基线；本核验未重新读取原始TXT。
- 最后一条events为shutdown：driver退出2，Electron退出code0、signal为null；page-errors为0。主代理另报告PS确认应用PID不存在，本核验未把该PS检查冒认为独立执行。
- 数字observer停止记录为stopped1、pending0、workers0、samples41，unavailable/writeFailures/timeouts均0。
- 检查点无publication，未生成published-session或final-integrity文件；完整场景阶段、后置review、发布及重开均未通过。没有执行任何成功验收脚本来覆盖此失败。

[R24构建身份](build-identity-r24.json)的18项source/dist/相关文件全部重新计算匹配，0变动。身份文件SHA-256仍为`f6edbaba80279a1c3a30b6f9e7d6f7a715143e2a02c2942bebec555d8c7a6358`。后续恢复接口后的真实运行须继续使用明确构建/会话身份，不能将本轮部分成功或历史单包/离线预检合并为完整通过。

执行范围仅为Node24的本地JSON标量读取、基线内部逐值比较和SHA-256计算，以及本文限定的diff检查；没有新增网络访问、App或模型调用。恢复额度/接口的请求已由主代理发给用户，本核验未继续尝试接口。
