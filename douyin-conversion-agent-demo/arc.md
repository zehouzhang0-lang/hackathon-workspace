# 架构草案

## 技术栈

- React + TypeScript
- Vite
- 原生CSS，不引入通用UI组件库
- `@xyflow/react`只负责只读成交决策画布
- 版本化localStorage按商家与商品保存最近20条结构化反馈
- MoneyAI本地健康检查适配器

## 目录结构

```text
douyin-conversion-agent-demo/
├── PRD.md
├── arc.md
├── project.md
├── RULES.md
├── README.md
├── package.json
├── vite.config.ts
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── styles.css
    ├── boss-mode.css
    ├── types.ts
    ├── data/demoCase.ts
    ├── engine/analyze.ts
    ├── engine/bossFlow.ts
    ├── engine/quality.ts
    ├── components/BossJourney.tsx
    ├── components/DecisionCanvas.tsx
    ├── skills/registry.ts
    └── adapters/moneyAi.ts
```

## 数据流

```text
演示案例或用户表单
→ 五段漏斗与来源校验
→ 数据质量评分
→ 本地规则锁定单一断点
→ 自动路由一个领域专家Skill
→ MoneyAI总控生成假设与成交成品
→ 本地实验Skill补齐样本、护栏、停止与回滚
→ 用户记录采用、拒绝、限制与结果
→ 版本化localStorage保存结构化反馈
→ 第二轮复盘记忆Skill改变建议与实验变量
```

## 交互分层

```text
App状态层
├── 老板模式
│   ├── DecisionCanvas：只读节点、连线、当前与已完成状态
│   └── BossJourney：一步一问、分支、成品、结果回传
└── 专业详情
    ├── InputPanel
    ├── AnalysisPanel
    └── OutputPanel
```

`bossFlow.ts`只把既有分析结果映射为可视化状态，不重新计算成交断点。老板模式与专业详情共享同一份`DemoInput`、`AnalysisResult`、MoneyAI结果和记忆记录，避免两套产品逻辑漂移。

## MoneyAI适配边界

MoneyAI调用独立sidecar，页面先检查只读健康接口：

```text
GET http://127.0.0.1:31416/health
```

真实推理封装在独立适配器中。页面组件不依赖MoneyAI内部数据结构；模型只能改写假设、方案和成品，不能覆盖本地锁定的数据质量、断点和事实。

## 状态模型

- `DemoInput`：商家、商品、来源、时间窗、五段漏斗和约束。
- `AnalysisResult`：数据质量、漏斗、Skill调用链、证据、假设、断点、路径、成品和实验处方。
- `MemoryRecord`：商家、商品、实验编号、采用状态、原因、结果和保存时间。
- `MoneyAiHealth`：检查中、可用、不可用。

## 失败降级

- MoneyAI未启动：显示“未连接”，本地规则版继续运行。
- 表单缺失：阻止分析并提示字段。
- 漏斗数值倒挂：阻止分析，提示数据应逐层递减。
- localStorage不可用：本轮仍可分析，只提示反馈未持久化。
