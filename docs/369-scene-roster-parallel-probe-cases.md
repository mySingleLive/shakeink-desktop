# 并发诊断控制

- 纯合成多请求交错stream/先后成功失败，结果、原异常身份及代次按对应请求隔离，raw输出前缀不碰撞；一个完成不关闭其它transport。
- 共用broker只configure一次，全部settle后才close；同一请求仍最多原两代，原source/retention/授权门不绕过。
- 成功/失败计数真实，异常只白名单分类，秘密headers/options/cause不写，生成text仅私有指定文件；路径/权限/重复文件拒绝。
- 实际请求列表并集与原首15包逐项payload SHA一致；其它包、正文、原文件均不改。私有runner与单包基准只增加列表并发/唯一输出及全settle后关闭，正常退出和state hash校验保留。

Mock不称实际API；新并发只读回复不称R39历史回复，不声明全书验收或普通用量DB已通过。
