# S01-C1 同源真实分类重测独立复审

日期：2026-10-26。审核者：`remaining_books_oracle`。**限定结论：正文来源类别修复 PASS；自动精确正文边界尚未通过，仍须既定人工边界核对。** 原rev5分类FAIL保留，不能记整书导入／分析／语义／发布通过。

只读本run新旧分类快照、事前oracle／run、构建身份及重测断言，独立重算单位、范围、原字符和hash，没有只相信断言文件的true值。没有改输入、oracle、应用或journal，没有运行测试suite、用户DB或模型。原生UI重新授权与识别等待由主代理实际操作记录，本代理未操作UI。

## 身份及新真实调用

同run `S01-20261026-C1`、同session `d65ceffa-b91f-42a8-84bc-65ea9ee0ab47`；旧rev5和新rev12均保留，新rev12为epoch5、phase=source。

| 外部只读证据 | SHA-256 |
| --- | --- |
| classification-checkpoint-rev5.json | `bad80dd1954d8a5a0b597a6305db1d37a9bd437961a38c2bcfdc7cd5cdbf790e` |
| classification-checkpoint-rev12.json | `5fd18688d7451ad08809fd40f6bde68415caef731bb91ab469005c4cfcc808b2` |
| oracle-frozen.json | `c3b8fb1b0d17ccafc78222087310c212ec1940448bd9896feaf6b55f33455c67` |
| run.json | `a9ab69c9283e26e35f1b05b6ad41f8892f9b39641d498f50eefd57a356c6ef82` |
| classification-contract-build.json | `62f05a283856509a2577b71094bd2c469859afe0466a8de8731de5220311fde1` |
| classification-retest-assertions.json | `037a2015aab12fefbad259683f9859f5d0fd72a651515f791c869433b0c3f764` |

构建记录绑定47已审核的main `b869c403…2250c9`、payload `4bc38491…2098e6`，运行时helper仍 `ed77bbf8…8bf5d7`。实际dist main=`8b3d9a34d16eb9058744cd14466ace689c84e98a57e2ceb039fb8378d3eff57e`，service=`3dc16ee03c369bc8bc9ca07aad4d037531c2b0b263ab7c0c5da26490009dba50`，PDF worker仍 `52645a7d85a982d1b4135fb09109061162d596f450c37abbc07be2e32e6e810a`；这些只是本run构建身份，不另宣称安装包或其它格式通过。

新classify operation=`6f843830-00f9-407e-aec4-6befbd0a6e4f`，不同于旧rev5；新processRunId也不同，记录为settled/fulfilled，时间为2026-10-26 04:04:24.711–04:04:35.165 UTC。两角色模型元数据与旧快照完整相同，仍同一DeepSeek-V4.1-Flash／deepseek-flash。26个单位的classify coverage恰好各出现一次。这不是重用旧26覆盖得出的静态成功；但不提供供应商内部请求ID、尝试数或账单证明。

## 独立重算结果

- 新旧全部26个单位除kind以外的完整字段逐项相等，包括id/fileId/start/end/text/part及原顺序。原文拼接仍3609字符，UTF-8 SHA=`54921ed14bde39f62be97c151ee40618fff62b51bde6c46800bf0139cc0752c4`，等于run和两快照的源hash。
- 事前正文[69,2792)对应原13段现在**全部为body**，无world／character／theme／narrative误分；与该固定范围相交后原字符拼接2723字符，UTF-8 SHA=`b6360470a56ab29b0c8a1e327db72ac552651b206a63b1392dd94749e8381d4a`，严格等于事前冻结值。此前逐段核对的开篇背景、人物介绍、对话、转述、评论与结尾均回到小说正文类别，实际修复了rev5的核心缺陷。
- 全部body为14段、2762字符，UTF-8 SHA=`e87a17c92e53fe34faf427f0c6c77d223c2fe26c47f62ea26ec26a8e12f85327`，**不等于冻结正文**。多出的范围精确为[0,37)装饰标题／起始代码围栏，以及[2792,2794)末尾两换行，共39字符；没有额外故事正文被遗漏。
- 12个unknown全部位于冻结正文外，包括作者行、日期、现代注释和末围栏。当前selected仅body，但phase仍为source；识别后的2762字符预分章不是最终确认正文。originalProse／workingProse仍空、无analysis覆盖、artifacts或publication；十二目标虽列全，尚未执行。

主代理第一次直接比较全body与冻结正文得到失败，这与独立重算一致；保存断言中 `preBoundaryFullBodySelectionEqualsFrozen:false` 继续存在。后续相交范围核对证明的是“全部事前正文已正确分类且原字不变”，不能替换／抹去该全body边界比较失败。

## 与03／45一致的后续动作

可以按事前oracle已固定的[0,69)及[2792,3609)通过现有原生来源核对排除附属区域；不需要也不应把正文13段手工改kind。这是03允许、45明定在自动正文类别修复后进行的首尾边界核对，原文／oracle／固定正文均不变，不把现代注释导作设定。正文内部原注号保持原字，不能顺手删去。

**本报告只认可拟动作符合口径，不声称它已经执行。** 边界操作后必须再保存实际检查点并确认所选完整body严格等于2723字符／既定UTF-8 SHA、unknown处理完成、sourceReady满足；不能仅凭本次相交hash就开始声称正文精确导入通过。随后可进入原定十二目标真实分析／复核；人物、转述、不确定结尾、伏笔与情绪点仍须完整独立语义审核，最后实际发布／查表／正常重开也各自待验。

此次限定核心修复PASS不回溯改变rev5 FAIL，不称完全自动边界通过，也不改变旧S01语义FAIL或其它作品／正式LIFE尚未执行状态。
