# S01旧世界条目归属修复：实际冻结证据独立审核

日期：2026-10-27。审核者：独立子代理 `cross_platform_picker_design`。

**限定结论：apply01归档数据核对PASS。** 七个原World已转为同一中性World下的七项Setting，原名称/描述逐字保留，13组保护数据及原NOVEL_IMPORT不变。此结论只针对下述冻结文件，不替代正在进行的实际UI重开核验，不将旧整书文学FAIL改为PASS。

## 证据身份与方法

仅只读外部 `执行证据/S01-20261026-0355/` 的指定文件，完整解析JSON并自行重算/逐对象比较；没有仅采信主代理断言里的true值，没有连接数据库、操作应用、调用模型、修改实际数据或运行测试。未读取当时尚在生成的readonlyverify01。

| 文件 | 原始文件SHA-256 |
| --- | --- |
| world-setting-repair-plan-v1.json | `9f5220274efff40c03dab6256f79120b076ecee341c97c441f01623e7db70f57` |
| world-grouping-dryrun-02-world-setting-repair/before.json | `3af4d6ca97211fcc0d671ea8e451bbce88351016f31de53e98fe5df33f3f1f3b` |
| world-grouping-dryrun-02-world-setting-repair/preview.json | `27b80f75ad43b1019028636a6cea8abc0ff1b339f56f0a99badcb1ae5e7d068b` |
| world-grouping-apply-01-world-setting-repair/before.json | `73c0b405eb526a3498a2330728fb6144c3c19cee07f7fb8608e096869cbc1a5d` |
| world-grouping-apply-01-world-setting-repair/preview.json | `8fefdbc92a79f31f2143363c3baeecb5d51c28373c827915f0738f5d5d3ed9ba` |
| world-grouping-apply-01-world-setting-repair/after.json | `379c1a37a1abd500e7b512518622f71098ef1e1c173f68f8d365f11d7acc8639` |
| world-grouping-apply-01-world-setting-repair/ack.json | `6b12c095217236e07ab936e5c3d9601d130dde2651d5a4a2f004790f47b65c47` |
| publication-01-audit/business-records.json | `c9f67b07c95ee2d4ef7a582071e201cced0ec43ceaf1cee955510741bac663ce` |
| latest-checkpoint.json | `32e7e1d1ad2b5086521fe816cabda9683210e29e276a51b3aa52c4cce6b84f47` |

同时只读主代理dryrun02/apply01断言及本run expected-body。操作绑定：work `6d6d3c82-bc69-4641-b710-5efdba574200`，novel `cmvobvvvt000loo6vdretjykm`，原import request `ef97e681-df26-420b-a7ff-2c42758548b1`。96最终独立代码审核追溯SHA为 `95d95df8c4ccf4c08681b23b1d41a295c49da74b9db2540be0ac41ddfbe0c269`；本报告不重审其实现，也不把代码测试当实际修复证据。

## 哈希、预览与回执方向

本次用递归对象键排序、数组原序、非ASCII原文及紧凑JSON重新计算SHA，得到：

| 对象 | 独立计算值 |
| --- | --- |
| 完整计划canonical hash | `42bdf2ecfcc0b4215e8b7bac7a4acf506695bcabd628c95e415678938e3d5a62` |
| apply before.rows | `d6bb707db21a3fa4cb155b678c7464ea74ef642f2f76995c14aeaa3b1e253899` |
| apply after.rows | `13c3cfed7f962b05d9870a196a3de388a4092bdc9e78f88786fa5fad5d3c53ec` |
| 原NOVEL_IMPORT snapshot | `f048c62efb03a49e7d9d8ce41ee3acf7e3dfc7cd66449a4f08ef50af0ae6552e` |
| before中除worlds外的保护组 | `4005d4e3ca741456a53a7b26b734eaa7c00832729f825c8d8c85fa5ea5cac575` |

这些值分别与plan、preview、after.result及ack的相应绑定相等；计划原文件hash与canonical planHash不同是编码层次不同，不是计划漂移。两preview内嵌plan均与实际计划完整相等。dryrun02.rows与apply.before.rows完整相等；两个preview除mode为dry-run/apply外全对象相等，beforeHash相同。

ack为committed，operationId `6be72425-98ec-4112-9b1f-64fa2ac3c4b9`，snapshotId `a3e92445-21d0-4b6e-98ae-13e0fc9167d8`。ack整个对象与after.result相等，beforeHash确实指转换前七World数据，afterHash指转换后一World/新增Setting数据，没有反向或沿用旧hash。ack.settings中的worldId是**旧World到newSettingId的稳定映射**；实际新Setting.worldId则全部是新rootId，两种用途已逐项区分核对。

本报告核对的是导出回执/result及其数据绑定，没有直接查询数据库中的修复专属回执/快照；独立持久性重开结果须由后续readonlyverify/UI证据另验，不能仅由同次导出推导。

## 七项内容与共同归属

逐项比较链为冻结artifact的name/text → 原发布World → plan.expectedWorlds → apply.before → preview → after.Setting。七个artifactId、旧worldId和新settingId各自唯一；原七World完整行含日期与plan/原发布记录精确一致。七项对应原name不变，content严格等于 `{text: 原description}`，没有trim、换行替换、知识前缀或文字补写。

| artifactId | 实际新类型 |
| --- | --- |
| world-luzhen-hotel-layout | CULTURE |
| world-customer-class | SOCIETY |
| world-hotel-consumption-prices | SOCIETY |
| world-xianheng-hotel-operations | SOCIETY |
| world-keju-status | SOCIETY |
| world-ding-juren-power | SOCIETY |
| world-onlooker-culture | CULTURE |

after恰有一个World：rootId `world-repair-root-ee208d3d-bef5-4dae-baa4-5ab432d4d1bc`，name为“小说世界”，description为空，parentId为空。原七World ID均已移除，不是保留为七个子World。新七Setting同属计划novel，worldId均为该root，parentId为空；内容/名称/类型及预览投影全部精确相符，CULTURE2/SOCIETY5，与[先前独立类型审核](S01-legacy-world-setting-grouping.md)一致。

Setting表**总计8项**，不是7项：新增世界级Setting7项，另有原STYLE项1项（worldId为空）整个对象原样保留。没有重复转换、遗漏原文风项或额外新Setting。

## 原内容与13组保护数据

对原publication记录 → dryrun02.before → apply.before → apply.after完整逐对象比较，以下12组全部相等：novels、themes、volumes、chapters、characters、scenes、items、foreshadows、tropes、planning、versions、mutations。第13组为原有Setting，通过ID逐对象核对，完整保留；新七项是唯一允许增加的Setting。比较包括字段、JSON、原文、版本及日期，而非只比较行数或摘要。

原NOVEL_IMPORT snapshot与mutation整对象保持，原requestHash/importHash仍为 `d51702f08aef8b33b736c6295acb369c9748a20418c6cfd092654528a610faee`。其materials内七项的id/kind/name/text/facts/evidence/sourceUnitIds/origin逐字段与冻结checkpoint原artifact相同；归组没有覆写原facts或证据。章节content、snapshot.originalProse、snapshot.workingProse都逐字等于expected-body：2723字符，SHA `b6360470a56ab29b0c8a1e327db72ac552651b206a63b1392dd94749e8381d4a`。

这些结果独立支持主代理两份断言的相应数据结论。该导出中的versions/mutations是受保护的原NOVEL_IMPORT组，不把它们误说成全库所有审计行，也没有读取或证明其他作品的数据状态。

## 保留历史与未完成验收

主代理报告首次dryrun01因stale lease退出且无业务写；只对该唯一own work确认原PID40433已退出后，使用应用已有“修复作品锁”操作，重启并正常退出，另两未命名作品stale未处理。此段属于主代理操作记录，本审核没有进程/UI证据重放；dryrun02与原发布业务对象相等支持“未观察到业务漂移”，不把JSON相等扩张为全部锁生命周期的独立实测。apply01的exit0/cleanup closed同样按主代理命令结果归属，本人仅独立核对其committed归档。

实际UI重开当时由主代理进行，本报告暂不代其标通过。后续readonlyverify与UI可补充持久性和真实面板证据；旧丁举人转述被直接表述等文学问题、旧整书FAIL及其他遗漏保持，修复层级不等于修复文学质量。本PASS仅限这份明确作品/计划/冻结数据，不推广为所有作品单世界或其他旧作品已修。
