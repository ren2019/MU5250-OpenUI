# 实时诊断任务索引

2026-09-18 用户确认六张任务及依赖关系。本地任务文件已就绪；远程跟踪器尚未配置，未发布远程 issue。ready-for-agent 表示描述可执行，只有阻塞任务已完成的票才能开始。

依据：[规格](../../docs/REALTIME-DIAGNOSTICS-SPEC.md)、[Prototype A 说明](../../docs/DIAGNOSTIC-PROTOTYPE.md)、[A 截图](../../docs/images/diagnostic-prototype/A-timeline.png)、[本地交互原型](http://127.0.0.1:8089/?demo=1&prototype=diagnostics&variant=A)。原型提交 b1e2266，选定记录 ec00635；均位于本地 prototype/realtime-diagnostics 分支，尚未推送。实现前先查看 A；数据契约以规格为准。

| 任务 | 阻塞于 |
| --- | --- |
| [01 实时速率时间轴](issues/01-live-throughput.md) | None (can start immediately) |
| [02 无线质量与载波历史](issues/02-carrier-history.md) | 01 — 实时速率时间轴 |
| [03 温度与 CPU 趋势对照](issues/03-thermal-cpu.md) | 01 — 实时速率时间轴 |
| [04 变化事件与定位回看](issues/04-events.md) | 02 — 无线质量与载波历史 |
| [05 诊断记录 CSV 导出](issues/05-csv.md) | 03 — 温度与 CPU 趋势对照；04 — 变化事件与定位回看 |
| [06 完整诊断流程验收](issues/06-acceptance.md) | 05 — 诊断记录 CSV 导出 |

当前可开始：01。之后 02 与 03 可并行；04 仅等待 02；05 等待 03、04；06 等待 05。无需独立前置重构。

每票复用已确认的“页面＋可控 HTTP 模拟服务”测试边界及既有轮询/API 回归。真机只读核验为单独验收，受设备访问条件约束。

远程发布前按 to-tickets 技能运行 /setup-matt-pocock-skills，确定跟踪器及 ready-for-agent 标签。发布时为规格和原型补充可访问的引用，不能只提供 localhost 地址；按依赖顺序创建并保留阻塞关系，不修改或关闭父 issue。
