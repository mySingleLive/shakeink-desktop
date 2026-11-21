# 真实小包进度/旧草稿名称治愈实施

日期：2026-10-28。按28方案/用例、29独审实施，30独立代码审核通过。范围仅两处生产逻辑及既有测试补断言；未夹带26诊断实现，不改AI推断、预算、来源、正文、证据校验、几何或持久化授权。

## RED→GREEN

先补既有E03的右包开始实际保存快照/失败/重开进度断言，E05的已提交左叶/暂停/迟到计数断言。实际RED：2项均0!=6，exit1，见`evidence/progress-healing-unit-red.txt`。NI-U05注入旧body.label并要求当前显示名称，实际RED等候“导入正文”超时，exit1，见browser-red；此前未改生产代码。

成功叶现仅在原checkpoint回调内同步对应step.completed=去重coverage长度，total=完整workingImportUnits数量，不采用递归pending子数组长度。skipped不改、state沿用原协议，不新增checkpoint/请求。运行页body名称是纯显示投影，fixture原view及真实旧journal不写回。

作者定向E02/E03/E04/E05：实际exit0，12/12，见`evidence/progress-healing-unit-green.txt`（7.83s）；既有NI-U04/U05：exit0，2/2，见browser-green（15.08s）。独立E03/E05再执行2通过/0失败/4未选，见`progress-healing-review-unit-green.txt`，30审核无新增问题。以上有重叠，不相加，也不抵扣本书完整语义或发布验收。未跑全仓测试。

## 构建与真实恢复（继续补证）

旧B3两生产源码备份到私有`B3-before-progress-source/`，备份前分别assert对应B3启动冻结hash相等。源码修改后不再把旧B3身份绑定当前checkout进行最终审计。

原生B3界面`evidence/native-progress-stale-B3.png`实际显示23/5587与旧body名称，而最新检查点已经增长。主代理正常“暂停”得到rev97，outline175/5587及50项大纲保留，正文SHA不变。经原生菜单退出，真实进程PID97710于2026-10-27T19:47:32.944833Z exit0，私有`process-exit-B3.json`/`B3-paused-for-progress-rev97.json`保留。该会话尚未完成，不能计作最终关闭/重开验收。

B4 UI构建实际exit0（包含类型检查），日志`evidence/build-ui-B4.txt`；desktop构建/新身份/实际恢复及新叶后UI增长继续由主代理补证，尚不预填通过。

## 本轮源码指纹

| 文件 | SHA-256 |
|---|---|
| `desktop/main/novel-import.ts` | `0676b4c84b21e6ce724d8a4e08503de5999b6a88450674030dc442b8043c49e8` |
| `src/components/desktop/NovelImportDialog.tsx` | `abd28f79dce781870614dd1515ef988300135b807990664df2f109ff5228a654` |
| `tests/unit/novel-import-evidence-batches.test.ts` | `6adf85be11c9527a177e16f3a7191f0508382337f7adc8982934912224c8a0c4` |
| `tests/browser/novel-import.test.ts` | `8b23c16e535f23f83d46ab7c02aadc9ebc944c805a1f375d2196049c70ba6aa9` |

## 未解决事项

本轮只修复显示正确性。25的首包语义问题及DREAM-TIME01/SCOPE01仍待生产全局review/repair后逐项复核；其余七目标、全书遗漏、正式发布、原生数据、最终审计/真实重开仍待验收，不能以本轮GREEN宣称用户全部目标完成。

## B4实际恢复补证

B4 UI及desktop构建均exit0（含类型检查），18项source/dist/BUILD_ID、63迁移及PGlite0.5.8在启动前追加冻结。B4实际PID52984，launchId `346b8cfb-a1de-461e-b17c-d6e209399d55`，2026-10-27T19:49:26.704199Z启动，私有`build-identity-B4.json`。退出父进程仍在等待真实退出，未填完成/关闭。

正常恢复同草稿、目录重新授权、允许分析并导入后，19:50:38.127Z实际继续analyze/outline，rev104。完整1394章、八targets、175覆盖/50大纲及正文hash保持。旧journal body.label仍为旧值，真实UI已显示“导入正文”；截图`evidence/native-progress-B4-start.png`显示175/5587，原生确认计划两标题亦正确。下一成功叶后UI增长仍待观察，不能仅将启动时重设175计数当作叶包增量修复已实证。

## B4新叶实际增量GREEN

2026-10-27T20:00:01Z前B4接纳23个新工作单元，大纲累计56项，coverage175→198。主代理随后真实AX读取显示大纲198/5587，截图`evidence/native-progress-B4-leaf.png`。同会话检查点step.completed==coverage、total5587、正文hash不变，历史body.label仍旧但UI显示新名，私有`B4-progress-real-green.json`记录。至此本轮“新叶后进度刷新”和“旧草稿显示导入正文”均有真实UI证据；只证明本显示修复，不证明56项文学正确或全书导入完成。
