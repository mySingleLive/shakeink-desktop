# 91/92 叙事线native及引用预检实施证据

2026-10-26。仅修改service请求schema及既有J测试，独立代码审核由93执行。未访问实际run、应用、小说、journal、模型/Key或用户库，没有构建。真实rev286的角色错误类别来自主代理报告，无raw不知具体角色，不能回溯129/164/203，也不宣称角色或叙事完整性已修。

两份真实只读基线保存于 `/private/tmp/narrative-schema-91-baseline/`：service `f29c2c6003c6aa513471ff3fa5acfa132ae9cade1ce7ed9baf1860950aeb1d68`、J测试 `5e44faf4e835a8a9102c5ab6492cfc2b468f4b9d22146af67e2c296a62690471`。先只新增J07，原生产及未适配J01–06上取得 [干净真实RED](evidence/narrative-schema-baseline-red.txt)：全部旧用例通过，仅新native缺chapter、新unknown narrator分别被实际生产桥直接接受，未进入纠正。合法目录/全书索引/原值、未链接框架材料与真实reconcile晚门在基线已通过，无fixture早门故障或事后变异。

生产仅新增普通semantic1 analyze/narrative、非reconcile的两独立非变换分支：artifact调用原`validateImportSemanticArtifact`，完整非空响应调用原`validateSemanticLinks`。丢弃helper返回值；已有字段问题保持原反馈，避免重复追加图错误。固定native issue路径为`artifacts.N.facts`，图issue为`artifacts`，两条完整安全指导都在原250字符反馈限额内，无catch/raw/ID/姓名/原文回显。原worldline分支及反馈、全部helper和late调用逐字不变。

严格沿用原章节/顺序安全整数、refs JSON/字段/枚举/可靠性及非客观归属规则，不添加默认或trim。narrator只用角色ID或唯一name；refs.character仍只用角色ID，refs.eventId只指可信worldline；使用完整本地catalog和全书chapters，不按provider过滤结果重编号。未链接框架称谓和讲述/转述归属可保留text/attribution，省略narrator、空refs按原规则接受，但不因此获得完整性信用。空产物/notFound仍有原late目录门，既有生成桥和一次纠正上限保持。

生产改变后先保存 [旧前提RED](evidence/narrative-schema-old-premise-red.txt)：J07全部通过，只有J04/J05/J06三个批准迁移的旧前提失败。随后才适配：J04 malformed narrative明确native非法/schema早拒；J05保普通narrative两例为早拒，两个exact角色Error通过真实reconcile `setFacts.narrator`、原baseHash/target/证据与未改primitive→validateSemanticLinks捕获并交实际main.prototype.safeError；J06同样保普通narrative早拒和真实reconcile late回归。原worldline、局部spaced-name目录和其它旧安全断言保留，未用手造Error替代。

J07覆盖18种native、10种图错误，经实际生产bridge→真实generateJSON的既有generateText DI验证首坏次好2次、持续坏2次停止；9组合法引用/原值/可选kind/安全整数/框架材料首次通过1次。完整本地目录条目即使provider未发送仍合法；全书10章仅发送index9，原`chapterIndex:'09'`保持全局语义和原字节。原JSON排版、非BMP/字符检查、归属时间字符串、raw/request/signal/role/model/wrapper不变；目录角色和事件不被制造为新叙事产物。另经真实reconcile分别捕获未知/非角色narrator两个exact Error，以及unset order的原native late Error，均无有效返回、原对象不变。

最后一次源码/测试修改后仅执行批准的两条命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J0[1234567]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[789]:' tests/unit/novel-import-ai.test.ts
```

| 证据 | 最终结果 |
| --- | --- |
| [J01–07](evidence/narrative-schema-j01-j07-green.txt) | 28/28（7顶层、21子场景），exit0，0 skipped |
| [A07–09](evidence/narrative-schema-a07-a09-green.txt) | 12/12（3顶层、9子场景），exit0，0 skipped |
| [必要类型诊断](evidence/narrative-schema-typecheck.txt) | 当前tsconfig，noEmit、incremental:false；仅报告两个owned文件，diagnostics0 |
| [完整delta](evidence/narrative-schema-baseline-delta.diff) | SHA-256 `ecb09dda81ba713ceab19c52ca313b2d086401a049179899238cfe8a81d4b578` |
| [反向逐字节核对及控制SHA](evidence/narrative-schema-delta-verification.txt) | 删除两narrative分支/数组别名后整service恢复基线，worldline/helpers/late原字节保持；撤回批准J04–06适配并移除J07后全部旧测试逐字恢复；mainfee/payload239/AI测试663保持 |

冻结文件：

```text
20b80cc24c14bde0d50e93d2521c129524aa82730805c665695aed10e7edc1ea  desktop/service/novel-import-ai.ts
4485611f4f5262fabf8f8bc142aa822e5fff8a32f6d8a1d5353e645b50fbbfa6  tests/unit/novel-import-request-schema.test.ts
```

payload、预算、权限、重试、工作流、持久信用及50项真实产物未由本轮操作。真实叙事线、框架人物/两线/角色完整性、独立文学审读、发布/重开与其余书/LIFE仍由主代理另行验收，结构和合成DI通过不能抵充。
