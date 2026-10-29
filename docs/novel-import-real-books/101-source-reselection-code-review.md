# 普通来源重新选择：独立代码审核

**当前整体101：PASS，无P1/P2。下文保留先UI、后后端的分包历史；该结论是限定代码和隔离用例通过，真实M01原生重选仍由主代理另验。**

## 101-A：冻结UI分包

2026-10-27。绑定99最终`47bba0…81942`与100审核`463c702…956b`。本轮仅审三份UI文件、其真实旧副本/字节前缀和作者TDD证据，不读正在实施的main/SR，不操作真实app/源/journal/DB/model。

| 文件 | 冻结SHA-256（执行前后均匹配） |
| --- | --- |
| src/components/desktop/NovelImportDialog.tsx | `f3459f47b2b59ccd3ba10d2e703e888700e2175d89e80737b6ccb6066a6ea046` |
| tests/browser/novel-import.test.ts | `c1a664b9555721cf88f049db1100fd05e9bc1e578e0a7d17a966b2f235f5325c` |
| tests/helpers/novel-import-ui-fixture.tsx | `2143e959cdf4f73f699568a945678440d6a4f38c65896410b736deeb90b2e72d` |

**UI分包结论：PASS，无P1/P2。** 生产仅新增canReselect条件、一枚共享outline Button及保留分类/卷章的说明；独立移除这三处即可恢复整份原UI `6335444f8bd92029990b049b577faf4fa3d252c34c34708cbe809b70fd69515f`。没有新弹窗/CSS/全局Button或主题设置修改。

入口仅针对已读取且无error/待编码确认的普通格式，要求无steps/publication/modified；busy禁用，PDF不在此枚举。按钮经原mutations队列提交reselect-source与真实fileId，id/revision由原桥接队列补全，无renderer路径或自动classify/start/discard。前端条件不代替后端阶段、grant或严格文件验证。

旧browser前20811字节完整SHA仍`0393063f5a73cc0f98dbc89469f36e9fdd89c621a95e21f190c22dcceaa83516`，U12只追加。真实旧fixture `/private/tmp/novel-import-theme-25-baseline/novel-import-ui-fixture.tsx` 的SHA为`c39878c8ccda0c32d65aea7e8f93ef17df577ed664c5811f24ba2219fff314ac`，对应旧browser也匹配039306；完整差异仅增加reselectMode、延迟/释放控制和新动作成功/取消/错误响应，旧分支不变。没有替换真实React组件或生产桥接队列来制造绿色。

### 唯一独立执行

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-U12:' tests/browser/novel-import.test.ts
```

**6/6、exit0、fail0、skip0、cancel0**（一个父组和五个子项）。独占日志：`evidence/source-reselection-ui-independent-u12.txt`；元数据：`evidence/source-reselection-ui-independent-review.json`。使用隔离headless Chrome临时配置，网络拦截仅本地文件图标响应，没有HTTP监听或用户浏览器配置修改；没有执行其它测试/类型检查。

实际React/共享Button和原store/队列下验证每文件aria-label及准确动作、源/选择/章对象不主动清空、busy与延迟回复、取消/错误保屏、无自动AI动作、后分析/发布/修改及不支持来源隐藏、再次核对原文和390宽paper/ink类切换边界。主题切换只作用临时测试文档，不改用户偏好。

作者原633544生产上新增U12取得6失败，缺按钮断言及随后等待超时有真实路径，生产新增按钮后6/6；RED/GREEN分别保留，未减旧断言。须注意fixture桥的“保留字段”只是前端采用合成权威响应，不能证明后端proof、磁盘或原生选择器行为；测试标题中的native selection亦仅受控延迟桥。U12沿用轻量样式fixture，不作为生产Tailwind主题涂装或真实安装版的额外证明；新组件复用outline且CSS未改，原生后验仍由主代理另验。

当时后端main/SR及PDF/R02待freeze，整体101保持PENDING；此为分包时点记录。真实M01草稿保留/新授权和零AI后验未提前通过，S02文学FAIL不变。


## 101-B：冻结后端与最终组合结论

**最终PASS，无P1/P2。** 独立审阅真实基线完整差异、SR全部夹具及三项定向回归；五份交付源在执行前后均匹配冻结SHA，UI沿用101-A独立6/6信用，不重复执行。

| 后端交付 | SHA-256 |
| --- | --- |
| desktop/main/novel-import.ts | `92ed3a9d6a6eceaf1a1c52f394b155ada93a913c2c13f292ac047b24a5a5491c` |
| tests/unit/novel-import-source-reselection.test.ts | `2cbb122b5732e7b06b189b3150cbe62ddceeb5653bd69ca012e549b426ede009` |

生产仅增加普通来源路由/helper，以及commitCandidate私有第三参数（缺省仍running，新增分支传source）。独立逆转这三处后，整份main严格等于真实基线`fee1997…3543d`；原PDF方法全字节SHA仍`e48c0334…094b`。文件读取、core、shared、AI service/payload和renderer bridge六项控制SHA均未变。

普通重选先限制为未分析的可读来源，异步接点检查session/epoch和业务停止状态。必须经新原生grant，扫描得到完整fresh proof/ancestors，严格同路径、格式、字节量和hash后，文本按旧已确认编码重读；最终无error/待确认且text/encoding完全相同，再严格verify。无完整读取身份的失败不能靠错误文案豁免，DOC/DOCX解析失败直接拒绝。允许旧身份到主动授权新身份更新，fresh捕获至读取/验证期间漂移仍拒绝。候选只替换该文件proof/ancestors，保留正文、单元、手动章节和其它业务字段，撤销grant/checkpoint；scopeHash未变化亦不沿用授权。

提交前失败保留旧live/disk；rename后adopt已提交paused/source候选，后验拒绝使用原blocked契约，current/retry/close不反写，不授AI或发布信用。正常重开仍通过原target重新授权门。原两参提交缺省、PDF重选和R02提交边界保留。

### 后端独立执行（仅批准三命令）

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-SR0[123]:' tests/unit/novel-import-source-reselection.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-PDF(?:04:|08: inspection and preview cancellation drain real jobs before controller serial waits$)' tests/unit/novel-import-pdf.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-R02:' tests/unit/novel-import-semantic-session.test.ts
```

分别**46/46、10/10、8/8，全部exit0、fail0、skip0、cancel0**。PDF命令只选两项既有PDF04及该精确PDF08，未执行整个PDF组。独占日志为`evidence/source-reselection-independent-{sr01-sr03,pdf04-pdf08,r02}.txt`；完整命令、结果、五源/六控制和日志SHA见`evidence/source-reselection-independent-final-review.json`。

SR使用隔离真实临时FS/捕获/扫描/解码/verify，覆盖TXT、MD、HTML/HTM、实际许可DOC fixture、DOCX、GB18030及无BOM UTF16。最后一项实际证明默认解码失败但完整fresh读取身份成立时，原确认编码可安全重读。另含取消、错路径、目录、多选、字节/格式变化、symlink、祖先与读取竞态、无效编码/解析、前分析门、excluded来源和多文件保留。真实临时journal故障注入覆盖write失败和实际rename后owner拒绝；核对live/rawdisk、blocked动作、close/reopen及原target再授权。分类只用合成AI DI，未分析/发布，无新增真实AI。

作者历史未覆盖：初RED含新fixture清理错误，另存修正fixture后原fee1997生产的干净RED（31通过/15失败）；首次实施44/46因新fixture遗漏原target再授权，仅补真实choose-target后最终46/46，未改变生产resume门。UI RED/GREEN及旧断言保留。未把fixture错误计为生产缺陷，也未把作者日志当独立执行。

本轮未操作真实M01、原件、journal、用户DB、模型或应用，未运行全量suite或独立构建。主代理构建为其另项证据，不充当本审核实测；真实原生选择和保留原草稿后验需另验。本结论不改变既有文学FAIL。
