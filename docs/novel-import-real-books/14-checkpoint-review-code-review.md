# 检查点恢复与复核合包 · 独立代码审核

日期：2026-10-26（Asia/Shanghai）。审核者：独立子代理 `unified_picker_review`。

**结论：独立代码审核通过，未发现阻断项。独立限定回归 21 项通过、0 失败、0 跳过。** 此结论只覆盖本轮两个窄修复，不代表真实六书、RB-LIFE01、M02/L02生命周期或最终发布验收通过。

## 审核范围与身份

只审 `desktop/main/novel-import.ts` 的检查点恢复及review合包修改，以及 `tests/unit/novel-import-session.test.ts` 的NI-S10/S11；对照12方案、13独立方案/用例审核、03的RB-REG03/04。为核对既有依赖契约，仅定点读取 `importScopeHash` / 模型字符预算及worker完整payload最终预算闸，未扩大实现审核范围。

本次读取及测试前后确认源码SHA-256与主代理交付一致：

| 文件 | SHA-256 |
| --- | --- |
| desktop/main/novel-import.ts | `8b004ecab38be45b35394581781aaae0fc8fe2dfe82453c5d793a769bbaeccf5` |
| tests/unit/novel-import-session.test.ts | `e3e95728f11410688ed727629ff4e854d122381ce0b132fd72d990b574776610` |

审核者未修改生产文件，未操作真实应用/CUA、模型、真实journal或Key，未reset其他修改。

## RB-REG03：恢复与授权

- 私有 `analysisCheckpoint` 独立于发送授权，保存有效分析scope hash与原目标path/device/inode。scope覆盖来源hash/文本、分类区间、选择/目标类别、infer、workingProse/workingRevision及章节边界；不同有效scope不能复用。
- 重新初始化先在旧journal原分析grant仍能证明scope一致时建立检查点标记，再撤销分类/分析发送许可及目标授权。新标记随journal持久化，多次重开不会因为发送许可已撤销而丢失成功工作。旧格式缺少有效scope证明时不会被无条件认作可恢复。
- 实际 `start` 在目标重新授权、来源验证及当前发送同意检查之后，才决定是否重建coverage/artifacts/steps。拒绝同意不会先清掉成功检查点；同scope与同目标恢复保留结果，来源/范围选择仍按既有invalidate清除标记与成果。工作正文版本变化导致scope不匹配，重新分析而非跳过。
- 有效分析检查点要求重新授权原目录；不同路径或同路径不同对象拒绝。既有publishing指纹/原请求恢复分支保留，最终回执仍绑定原session/request。
- NI-S10使用真实持久化控制器，覆盖正常/旧格式/再次重开、实际choose-target及start、缺consent、范围/选择失效、不同/替换目标和工作正文修改。仅将mkdtemp合成journal转换为旧格式，没有修改真实会话。

## RB-REG04：完整复核任务与有界合包

- 仍先执行全部正文/已选来源unit的review覆盖循环；reviewFacts没有代替全书正文复核。每条设定完整text按原逻辑切片，每个facts字段单独保留，仍与各证据批次形成确定性任务。稳定任务键保留完整设定text/facts/evidence、分片序号及证据unit文本hash。
- 仅对共享来源unit按ID去重；artifacts按任务追加数组，不按相同artifact ID覆盖。合包仍实际提交每个文本片段、字段与对应证据/引用，没有摘要替代或截断。独立unit字符总量≤budget，序列化 `{units,artifacts}` ≤2×budget；单任务超限明确失败。worker完整payload≤3×budget的最终闸保留，控制器合包检查不冒充完整请求一定可装入。
- 同一包先等待AI结果，逐一验证全部冲突的精确证据及unit/artifact引用，再通过当前epoch检查，才在一次checkpoint中加入冲突及该包所有任务键。前面一条冲突合法、后面一条非法时没有部分credit；网络失败、在途暂停或旧epoch返回同样没有新增credit。
- 恢复按原任务键过滤已成功任务，不依赖上次包号；成功包不重发，失败包所有任务继续待复核。测试按任务多重集核对实际提交的text/facts/evidence及首末哨兵，而非只核对输出字符串包含末尾内容。
- NI-S11包括网络失败、证据错误、artifact/unit引用错误、暂停、不同/共享证据、源字符边界、精确2×budget及超限单任务；断言成功包保持、整包原子credit、恢复未完成任务、完整正文review及worker最终闸仍有效。

## 独立执行

审核者只运行以下获准命令，没有运行整文件、全仓或其他测试：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='NI-S(?:02|07|08|10|11):' tests/unit/novel-import-session.test.ts
```

实际结果：exit 0，tests 21，pass 21，fail 0，cancelled 0，skipped 0，duration 2430.58675ms。包括NI-S02/07/08及S10的8个、S11的8个子用例；没有运行其他session测试。

下一步仍由主代理按12方案构建，并从保留的同一真实S01检查点重新授权继续；合成测试和本审核不替代真实生命周期、模型阶段覆盖及发布后逐字/业务记录验收。
