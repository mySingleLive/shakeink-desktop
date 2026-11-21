# 本地确认覆盖人工章界：窄修方案与用例

日期：2026-10-26。待独立审核；尚未编码。

## 真实失败

S02 rev12通过真实UI确认文言引子及十三则日记，共14阅读单元。`chapters-checkpoint-rev12.json`与`chapter-assertions.json`已独占保存：mode manual，拼接严格等5310字符/1df1。随后按来源流程点“识别内容→仅本地分类”，rev13变为select、mode auto、1个未分章章节。`local-confirmation-chapter-loss-rev13.json`保留失败，正文hash仍1df1、selected body及12目标保持，尚未开始设定分析。

原因：`importSessionChapters(session,text)`在未显式给cuts时总重新detect并把mode改auto。classify(local)及recognize完成都会隐式调用它，覆盖刚确认的用户章界。不能把仍保真的正文当作章界保持成功，不能通过改oracle或journal恢复来掩盖失败。

## 最小行为

只改`desktop/core/novel-import.ts`的importSessionChapters及直接定向测试`tests/unit/novel-import-chapters.test.ts`、`tests/unit/novel-import-session.test.ts`。不改检测器/正则、UI、main、AI/预算/授权/保存/发布/源文件或schema。

- 仅semanticVersion1、未传显式cuts、当前mode manual且已有完整chapters的content拼接逐字等当前text时，沿用其start/title，用现有importChapters重新校验合法起点、标题、字符边界和完整覆盖，保留人工模式及既有诊断。返回正常章节结构，正文不变，不把它标成自动识别。
- 显式cuts仍按原路径确认新人工章界；自动模式仍原检测。text有任何变化、没有可复用完整人工章界时，仍原自动检测及mode/diagnostic，不把旧位置沿到新正文。legacy入口原样返回原importChapters，不改变旧计划/键/结果。
- 合法人工章界的ID/位置/标题/内容、正常卷信息保持现有构造合同；旧章界无效时不能静默跳过原校验。不自动补造日记日期或把作者署写日期当事件时间。

## 定向用例

- 新NI-CH04：同文本隐式重算保留人工分段、manual及原文；显式新cuts生效；文本变动不复用旧cuts；auto/legacy原行为及非法人工起点仍按原门。原NI-CH03保留模糊标题不乱拆的保障，不扩大自动检测能力。
- 新NI-S12：隔离真实controller choose/分类→set-chapters→classify(local)复现RED后GREEN，实际journal人工章界/原文/选项保持、local零AI；随后真实synthetic classify(ai)完成也保留同文本人工章界，必要close/reopen继续仍保留。只用合成资料及DI，不碰真实S02或模型，不减少旧断言。

仅两命令，先当前冻结版真实RED，再最小GREEN和独立代码复审：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-CH0[34]:' tests/unit/novel-import-chapters.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-S12:' tests/unit/novel-import-session.test.ts
```

必要全项目/audit类型检查和desktop build另记；UI及worker源未改，不重复UI构建/全量/全包。实际重开同S02后，通过原UI重新确认14单元再本地确认，独立比较原文/章界/模式；rev13失败永久保留，不手写journal。之后才继续12目标分析与全书验收。
