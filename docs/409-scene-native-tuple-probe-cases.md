# Native items 静态对照用例

408先独审，再审本用例；全部实现与合成controls仅PRIVATE，产品/API禁止提前变更。

| ID | 固定合成输入 | 必须证据 |
| --- | --- | --- |
| TP01 schema单变量 | 当前工厂两task/3choices构造A；B仅items对象anyOf与删additionalItems | 共同witness直接Ajv均过，A仍tuple、B同质items对象；defs/refs及其余字段深等；去重键序无关；原生产schema未变，不用私造近似A。 |
| TP02真实SDK出口 | 合成模型授权、真实generateText→本helper同匹配→生产ModelService/Gateway→fake最终fetch | 2例串行，each1/global2/retries0；type/strict/schema/input SHA与预定一致，thinking/cap默认不变；无真实配置/Key/API，DB写失败关闭；第二次/第三次fetch被gate拦，gateway/SDK包装后仍harness失败。 |
| TP03HTTP投影 | fake400 JSON含secret哨兵的message/unknown code/param/header；另合法已知code/param，非JSON体 | 只固定枚举/关键词布尔和body状态；safe结果、文件和stdout不含哨兵或开放串。HTTP验证not-run；A400/B200记录transport兼容差异，不称schema遵守。未知code/param→other，null/缺省→none。 |
| TP04有界clone | 64KiB边界/超界、多块UTF8、永不settle的read/cancel、clone抛错、原fetch抛错 | 原Response身份/返回值/throws不变；observer不await后台读取，1000ms后任务有限终结、超界不完整；原delegate先完成的纯控制可用短注入时钟，正常真实链也有HTTP400释放控。不能await clone.cancel卡主链，不以截断正文作完整解析。 |
| TP05存储/授权/结束 | 已存在/错目录、wx重复、撤权、写失败、原quit timeout后cleanup0 | 初始化失败0fetch；末例撤权仍失败，观察/写故障不变原模型业务结果但诊断ok=false；所有settled后统一close/active0，资源失败不得误报完成。0700/0600、R49产品/state/helper hash前后不变。 |

单次实际root验收另记：最多2generate/2finalfetch、正常App0/无cleanup掩timeout、模型及输入参数相同。保存安全scalar/private合成回复，不回显真实配置；每一结果仅本次观测，未知保持未知。沿用R48控制可引用，但新两例及本helper真实链必须实跑合成controls，不能只靠旧四例或mock options。若body投影完全unknown，也不能省略失败或再补一次请求寻找想要的结论。

TP04补充真实链：用原ModelService/Gateway+真实Response400分别制造慢body、read永不产出、超64KiB，验证observer立即返回原Response，而ModelService原cancel可有限等到诊断deadline/上限取消clone之后settle，transfer/close/drain均结束。另造原底层cancel本来永挂的未观测baseline，只标识原有失败，不能把这种source故障当observer已修好或正常退出。等界64KiB若尚未确认EOF必须不完整，已知EOF则允许完整。
