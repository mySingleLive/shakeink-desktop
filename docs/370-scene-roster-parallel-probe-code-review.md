# 同批只读并发探针：独立审核

结论：**限定最终冻结版本通过，无剩余阻塞。**368/369已按序独审；root可先构建另名helper，再经runner冻结门执行一次batch。审核者未修改产品/测试、构建桌面产品或启动App、调用供应商、读取实际列表/小说/raw/配置/Key；只运行合成控制及write:false内存编译。

- helper一次创建共享Repository/Gateway/ModelService，transport仅open配置一次；15请求各有独立operationId/AbortController/observations/代次/文件前缀。core用Promise.allSettled收齐所有invoke后才close，setup异常仍关闭；不会一个请求完成就重设或关闭其它请求的transport。原异常/结果只留内存settled，返回前只映射固定计数/白名单，未序列化异常对象。
- 每项原request clone后先验证固定15项及index顺序、scope和完整serializeImportAiPayload SHA，再发请求；root另已比对原runtime前15的hash来源，本独审没有读取这些真实内容，不能把仅自算hash冒称原始一致。每项仍走原runImportAi及instantiate→light→native→原SDK→canonical/source/retention/授权末端门，原最多两代；readonlyUsage和零网络重试明确属于本次诊断差异，不能认证普通usage DB或重现历史回复。
- 新目录0700、raw文件0600/wx/O_NOFOLLOW，路径/别名/重复拒绝。仅构造text、闭合finish和token计数的raw对象；prompt/schema只记hash/字节。headers/options/Key/端点及任意异常/cause不写。raw writer故障只记writeFailures，原业务结果继续，runner最终仍会因缺证据失败。classifier固定字典已用Object.hasOwn，SRU1全锚定闭合，其余字段白名单，未知不回显。
- runner校验input/state/protected hash不变、正常退出、完整15条及capture/close状态；不自动重试batch。summary.ok只表示诊断批次运行成功，允许记录真实rejected计数，不能解释成15次成功或全书验收。

已发现并关闭唯一阻塞：旧runner的quit-timeout会被后续app.close清理的code0覆盖。最终版本保留quitTimedOut/initialQuitExit，cleanupExit单列，exit不被清理覆盖且最终强制quitTimedOut=false。新增控制直接在VM执行runner字面的finally和最终assert：实际RED7为6pass/1fail，原门Missing expected exception；修后timeout→cleanup0仍失败，真正normal0无cleanup继续通过。没有把初始module-missing计为功能RED。

实际独立命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --test /private/tmp/shakeink-scene-import-20261031/scene-roster-parallel-probe-controls.test.mjs
```

最终**7/7、exit0**，日志`/private/tmp/scene-roster-parallel-probe-independent-final.txt`。覆盖交错并发/原错误身份、单次broker、全settle后close、独立前缀/两代、秘密字段不入观察、writer失败不改业务结果、路径/权限及退出门。helper按builder同参数独立esbuild write:false内存编译通过，输出文件写入0；builder/runner node --check exit0。产品generate/service仍为R39冻结`0b9b0aed…`/`4014a2ee…`。

五文件均位于`/private/tmp/shakeink-scene-import-20261031`：

| 文件 | SHA256 |
| --- | --- |
| scene-roster-parallel-probe-core.mjs | b57140537e3233844fad334437907ca20f1f6786a10102ceb589007939230aa0 |
| scene-roster-parallel-probe-helper.ts | 8b680684e09076141bcde93ad76556e52899b6ed729de6ea31f5f86dd805e697 |
| build-scene-roster-parallel-probe.mjs | 45874011c65e7da6ea26989ca44dbfeaf497f23b1ad30e9e1cf59b440196a706 |
| run-scene-roster-parallel-probe.mjs | dc1238c0f8d3c468e7a79ebd26adb865f348aecb782afdc49097f00bab414248 |
| scene-roster-parallel-probe-controls.test.mjs | 53f562cc822f094d59efd60b15f12c228eaceb1a57b0be641b04e12bd57560c4 |

builder只写另名helper及manifest，拒覆盖，构建前后保护main/service及旧R37 helper；runner实际执行前再验全部source、entry/core/output及保护产物。该实际构建/列表内容/模型结果由root另验。本准入仅一次新并发诊断，不代表R39历史原因、普通用量DB或全书/全部场景/发布/重开通过。
