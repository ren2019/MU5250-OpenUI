# 实时诊断任务索引

2026-09-18 用户确认六张任务及依赖关系。实现由 [PR #1](https://github.com/ren2019/MU5250-OpenUI/pull/1) 跟踪；保留本地任务，不创建或关闭父 issue。状态区分代码完成与最终验收。

依据：[规格](../../docs/REALTIME-DIAGNOSTICS-SPEC.md)、[Prototype A 说明](../../docs/DIAGNOSTIC-PROTOTYPE.md)、[A 截图](../../docs/images/diagnostic-prototype/A-timeline.png)。固定原型为 [b1e2266](https://github.com/ren2019/MU5250-OpenUI/commit/b1e2266)，选定记录为 [ec00635](https://github.com/ren2019/MU5250-OpenUI/commit/ec00635)，保留在远程 prototype/realtime-diagnostics 分支。正式实现已移除一次性原型。

| 任务 | 阻塞于 |
| --- | --- |
| [01 实时速率时间轴](issues/01-live-throughput.md) | None (can start immediately) |
| [02 无线质量与载波历史](issues/02-carrier-history.md) | 01 — 实时速率时间轴 |
| [03 温度与 CPU 趋势对照](issues/03-thermal-cpu.md) | 01 — 实时速率时间轴 |
| [04 变化事件与定位回看](issues/04-events.md) | 02 — 无线质量与载波历史 |
| [05 诊断记录 CSV 导出](issues/05-csv.md) | 03 — 温度与 CPU 趋势对照；04 — 变化事件与定位回看 |
| [06 完整诊断流程验收](issues/06-acceptance.md) | 05 — 诊断记录 CSV 导出 |

01–05 代码已完成并集成，逐项验证见各票和[验收记录](../../docs/REALTIME-DIAGNOSTICS-ACCEPTANCE.md)。06 进行中：模拟页面主要流程已核验，剩余页面边界矩阵及真机门槛未全部完成，不能据此认定上线验收完成。

各票保留未直接验证的复合验收项，不将模型/轮询测试描述成已经操作过浏览器。每票复用已确认的“页面＋可控 HTTP 模拟服务”边界及既有轮询/API 回归。真实设备尚未访问；只读核验仍受设备可用性和授权约束。
