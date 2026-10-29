# 人工章界保持方案与限定用例独立审核

日期：2026-10-26。审核者：`remaining_books_oracle`。只审64、已知core helper及controller分类接点／定向测试结构；没有编码、执行测试、操作应用／模型或读取实际S02／journal。

64 SHA-256：`602c7a81fd7bebe753cc5532b955522e1f59a18106e6249e72499364daf44fd4`。

**技术方案PASS；限定用例PASS，无方案级必须修订的P1/P2。** 允许按指定三文件进入真实RED→最小GREEN及冻结代码独立审核；不表示真实rev13已修复或人工14阅读单元已在实际应用保持。

## 同正文保留人工决定

现helper在未给cuts时总执行detector并改auto，classify(local)及recognize完成都调用它，因此64描述的同正文人工章界被覆盖机制成立。修复应在core单一接点保留已有作者边界，不通过改oracle、journal、检测器或主进程规避实际失败。

复用条件严格限于semanticVersion1、没有显式cuts、当前manual且有完整现存章节，其content拼接与当前text**逐字相等**。不得以字符数、去空白、源文件hash或大致相同替代正文相等；换行／标点／非BMP字符变化也不能套旧起点。

复用时只取旧start／title交原importChapters(text,cuts,1)重新校验，保持现有构造的ID／顺序／内容合同。合法manual与既有diagnostic保留，不调用detector或改标auto；同正文但人工起点／标题／字符边界非法仍须原门拒绝，不能catch后静默回退自动。

显式新cuts优先走原确认路径；auto、正文有变化、没有完整人工章界及legacy均原行为。空章节集合不能仅因拼接为空就被误当完整人工决定。返回现有章节结构，不引入卷字段／日期推测、改旧计划或扩自动标题能力。

## 用例与反例边界

CH04直接验证保留start／title／内容、manual／diagnostic以及精确原文；显式新cuts生效，正文任意变化不复用，auto／legacy不变。同正文的非法人工起点须确实进入复用校验后拒绝，包括字符边界，不可只用正文不同的输入让auto分支提前避开。

S12经真实controller choose／分类／set-chapters／classify(local)复现原失败并核对实际合成journal。local路径0AI，来源／selected／targets／infer及精确正文保持；随后受控classify(ai)实际完成、close／reopen后仍保持同文本manual章界。应断言调用仅为合成分类，不进入analyze／review／publish，避免把正文保真冒充章界保持。

全部资料在隔离临时目录及DI内，不能读取真实S02或模型。CH03继续保护模糊标题不乱拆，旧测试断言不删减；只改helper及CH04／S12相关测试，不改main、检测器、UI、预算、授权、保存／发布或schema。

## 精确执行范围

仅认可64两条命令，本文未执行：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-CH0[34]:' tests/unit/novel-import-chapters.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-S12:' tests/unit/novel-import-session.test.ts
```

先在当前冻结版取得真实行为RED，再最小实现及独立代码审核；必要类型检查／desktop build另记，不重复无变更UI／worker构建或全suite。合成模型回调不能作为真实模型质量或正式AI成功证据。

代码审核及构建通过后，主代理同S02原UI重新确认14阅读单元、再次本地确认，独立比较模式、全部章界／标题／内容与正文hash。rev13失败永久保留，不手改journal恢复；实际保持通过后才继续12目标与全书验收，本方案PASS不回填这些结果。
