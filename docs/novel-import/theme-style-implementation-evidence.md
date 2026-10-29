# 25/26 导入主题样式窄修实施证据

日期：2026-10-26。仅修改 `src/components/desktop/novel-import.css`，新增主题 fixture/test；三文件已冻结交 27 独立代码审核。没有构建或操作真实应用、S02/C1、用户主题偏好、真实数据或模型。合成视觉验证不计整书语义通过。

## 最小变化

删除 `.ni-dialog [data-slot="button"]` 对共享 Button 的涂装/字体/几何、无效 data-variant 分支、hover filter、disabled opacity 和统一 svg 大小；局部 focus 只保留原生控件，不覆盖共享 Button。保留按钮原 variant/size/事件、手型和禁用语义。弹窗使用 input 边框、chat-overlay（回退 popover）表面和 shadow-2；页脚同 overlay。宽高、定位、滚动、响应式及业务状态未改。

新 fixture import 原真实 React fixture，在独立页面另 mount 真共享 Button；参照不在 ni-dialog 祖先下。两页都加载同一份以真实 globals.css 绝对 from 编译的完整 PostCSS/Tailwind，以及真实 ni.css。没有手写 Button 近似 CSS、translate 补丁或脚本 focus。双主题仅设置可销毁页面的 html class；全部网络拦截，文件图标由测试读取公开资源供给。

UT01 比较 default/outline/ghost icon、禁用图标与禁用主按钮的真实 computed paint、尺寸、padding、圆角、字体、opacity、SVG、filter 和 focus ring；使用物理 hover、实际 Tab 及禁用物理点击。另独立要求 primary/primary-foreground 真实 tokens，以及 ghost 背景/边框透明，防止同错相等。UT02 在双主题与三个尺寸、三个真实页面标题下核对表面/页脚 tokens、模态边界、页脚可见、无横向溢出、Tab trap、禁用及选择状态保持。

## 真实 RED 与最终执行

最初 Chrome 子进程在沙箱启动时 SIGABRT/EPERM，未到断言，[原日志](evidence/theme-ut01-ut02-launch-failure.txt) 明确不是功能 RED。同一精确测试命令经 require_escalated 自动审核允许，使用全新临时 headless Chrome profile；没有修改用户 Chrome 配置或换命令绕过限制。

生产 CSS 仍为真实基线 `a96bddd9…35efebd` 时，[行为 RED](evidence/theme-ut01-ut02-red.txt) 0/2、exit 1：玄墨主按钮实际 `rgb(13, 11, 10)`，主题 primary 为 `rgb(224, 122, 95)`；弹窗实际 popover/border/自定义阴影与 overlay/input/shadow-2 不符。RED 合成截图保留于编译 CSS 身份 `909301f9998f`。

CSS 最小修改后，UT01 首次已绿；新 UT02 首次立即读取焦点守卫、第二次在 resize/页面切换过渡中读 bbox 的 [中间日志一](evidence/theme-ut01-ut02-first-implementation.txt)、[中间日志二](evidence/theme-ut01-ut02-green-attempt.txt) 均原样保留。随后只在新测试等待 BaseUI 实际焦点回流、实际新页面标题和 Dialog 动画 finished，再维持同一 contains/边界断言；未手动 focus、改布局或放宽边界。

最后一次修改后，仅执行批准的两条命令（隔离 Chrome 所需 require_escalated）：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-UT0[12]:' tests/browser/novel-import-theme.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-U02:' tests/browser/novel-import.test.ts
```

| 最终日志 | 结果 |
| --- | --- |
| [UT01/UT02](evidence/theme-ut01-ut02-final.txt) | 2/2，0 skip，exit 0，15983 ms |
| [原 U02](evidence/theme-u02-final.txt) | 1/1，0 skip，exit 0，3117 ms；旧 fixture/断言逐字未改 |
| [必要静态诊断](evidence/theme-typecheck-final.txt) | 当前 tsconfig/noEmit/incremental:false，两个新 TS 文件 diagnostics 0，exit 0 |

[截图清单及逐图 SHA](evidence/theme-screenshots.json)：GREEN 编译 CSS 身份 `5efe93c3d138`，22 张（双主题 × source/select/confirm × 三尺寸 18 张及两页按钮参照 4 张）；RED 3 张。已目视宣纸 select 390×640、玄墨 confirm 680×460，主/次/ghost/禁用层级和页脚可见。它们均为隔离合成页面，不是真实应用验收截图。

## 冻结 SHA-256

```text
a3a5a67b554148469fb2788380124c031b221a43a35d40d55bcf40e9eecf6f92  src/components/desktop/novel-import.css
9f2709d95fc2cff9512e3fac7a2b908a8df23f91cba7fe63a2f4435c6d2c2530  tests/helpers/novel-import-theme-fixture.tsx
7ff5fd38e47dc72574d0725818e2cd3ea6243f5d32ab9b9baa0b4b2b72313499  tests/browser/novel-import-theme.test.ts
```

[完整三文件差异](evidence/theme-implementation-delta.diff) SHA `be70a4dd90d6a724f73baba4806704045cca27b5da9e1e4e48ff1356d3df2852`。对照 `/private/tmp/novel-import-theme-25-baseline/sha256.json`，共享 Button、globals、批准 preview、旧 browser test、旧 React fixture 五项 SHA 全部未变。未执行其它 suite；正式构建与当前用户主题/原会话核对由主代理后续完成。
