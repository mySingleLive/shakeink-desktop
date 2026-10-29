# 88/89 世界线引用前置实施证据

2026-10-26。仅修改service请求schema与既有J测试；独立代码审核由90执行。未访问实际run、应用、小说、journal、模型/Key或用户库，没有构建。rev242已知角色引用错误类别，但无raw仍不知具体名称/ID；不能回溯认定129/164/203原因，也不宣称角色完整性或文学FAIL已修。

真实只读基线位于 `/private/tmp/worldline-references-88-baseline/`：service `d86eb08bcb6c909a5338c76efab787ccb8a1cbf9ef9c2d40a4b90c46679d98ad`、J测试 `afb0983cc6536549a7826ef30284e9784ac2de0964d80e79cfa2084cf11c250d`。先仅新增J06，在原生产及未改旧用例上取得 [干净真实RED](evidence/worldline-references-baseline-red.txt)：J01–05全绿，仅实际生成桥直接接受未知角色引用、没有进入既有纠正而失败；合法引用/完整本地目录/empty及narrative晚门保护均通过。无fixture早门故障或事后变异。

生产只在semantic1普通analyze/worldline的非空artifacts响应上非变换调用原 `validateSemanticLinks(request, items)`。保留已有字段/native问题的原反馈，不重复追加图错误；使用原完整可信request目录及本批候选，绝不拿有损provider目录替换本地验证。catch只产生固定 `artifacts` issue，完整指导小于原250字符限额，限制角色id/唯一name、同类父节点和ID身份，要求保留有据事件及原称谓/认知归属，不造外键、不丢事件、不改正文；空people不证明完整。未改变helper、native/图晚门、空结果后late、其它kind/阶段、legacy、prompt/payload、预算、授权或重试上限。

生产改变后先保留 [旧前提RED](evidence/worldline-references-old-premise-red.txt)：J06已全绿，J04/J05原schema通过前提按预期失效。随后才执行事前批准适配：

- J04非法worldline引用改为schema早拒，纯native合法及真实run拒绝继续保留。唯一合法people-raw-strings行原本引用带空格姓名；主代理明确批准仅该局部input新增独立ID且逐字相同姓名的可信character目录，保留原catalog/context、原facts/空白/不transform断言，不改global r，不trim或建立别名回退。
- J05保留原两个worldline fixture为native通过/schema早拒反例；另用合法narrative的narrator未知/非角色ID经过同一未改late helper，仍捕获两个原exact角色Error并调用实际main.prototype.safeError。没有手造Error替代或删除零有效结果、原值和安全映射断言。

J06实际生产bridge及真实generateJSON DI覆盖8类引用错误的首坏次好2次、持续坏2次停止；6组合法ID/唯一name/批内父节点/已有父节点/本地完整目录及可引用子集首次通过1次。被provider过滤但仍在可信本地目录的角色可合法引用，不制造目录角色产物。固定反馈无姓名、ID、原文或catch回显，raw/request/signal/role/wrapper保持。空产物/notFound不会吞掉原late目录错误，narrative引用仍由原late拒绝。

最后一次源码/测试修改后仅执行批准的两条命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J0[123456]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[789]:' tests/unit/novel-import-ai.test.ts
```

| 证据 | 最终结果 |
| --- | --- |
| [J01–06](evidence/worldline-references-j01-j06-green.txt) | 22/22（6顶层、16子场景），exit0，0 skipped |
| [A07–09](evidence/worldline-references-a07-a09-green.txt) | 12/12（3顶层、9子场景），exit0，0 skipped |
| [必要类型诊断](evidence/worldline-references-typecheck.txt) | 当前tsconfig，noEmit、incremental:false；仅报告两个owned文件，diagnostics0 |
| [完整delta](evidence/worldline-references-baseline-delta.diff) | SHA-256 `7c7ea5d366e509f207b6ae663d96c161cc31e354f918eaa9d5f1a7bca53343dd` |
| [反向逐字节核对及控制SHA](evidence/worldline-references-delta-verification.txt) | 删除唯一响应预检后整service恢复真基线；撤回批准J04/J05适配并移除J06后全部旧测试逐字恢复；mainfee/payload239/AI测试663保持 |

冻结文件：

```text
f29c2c6003c6aa513471ff3fa5acfa132ae9cade1ce7ed9baf1860950aeb1d68  desktop/service/novel-import-ai.ts
5e44faf4e835a8a9102c5ab6492cfc2b468f4b9d22146af67e2c296a62690471  tests/unit/novel-import-request-schema.test.ts
```

既有信用和文学FAIL不改。真实43产物/覆盖/正文/14章/预算保持、世界线/两线与角色完整性、最终文学、发布和重开仍由主代理实际验收，合成DI不能抵充。
