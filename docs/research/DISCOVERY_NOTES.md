# 需求讨论与 skills 候选

更新：2026-08-27。状态：讨论中的假设，不是产品定案；本轮只读搜索与审查，**没有安装新 skill**。

## 今天的约定

- 题目为“抖音做了出不了单怎么办”。明天才知道具体商家，今天主要由用户与助手讨论、挖需求并搜索合适 skills。
- 暂不确定六个模块、诊断报告、长期记忆或具体技术栈；MoneyAI / Codex CLI 的实现细节后置。
- 今天的产出是值得明天核验的问题和候选方向，不把我们的推演写成商家已经表达的需求。

## 当前值得讨论的分歧

以下是讨论假设，不能当作实际商家分类或发生率。

| 可能的卡点 | 需要核实的具体情况 | 产品可能交付什么 |
| --- | --- | --- |
| 不知道先改哪里 | 现有数据和工具是否能给出解释，商家能否理解和信任 | 有依据的一项优先判断，以及补证方法 |
| 知道问题但做不出改法 | 是否缺商品表达、脚本、拍摄素材、套餐设计或执行时间 | 一件能实际使用的交付物，而不只是另一份建议 |
| 已经有人咨询但没成交 | 是否有有效线索，报价和回复过程如何，结果是否记录 | 对某一次咨询或跟进工作的辅助；不能凭空假定需要 CRM |

还可能存在产品竞争力、价格/成本、服务范围、库存、履约或经营权限等限制。不能预设它们都能靠更好的视频解决。

“出单”还需与商家一起定义：实物支付订单、团购核销、私信后的预约/签约、有利润的净成交，并不是同一个结果。

一个已核实的背景是：[抖音罗盘](https://compass.jinritemai.com/welcome/product)已经公开列出流量诊断、优化建议和商品复盘能力。因此，**另做一份 AI 诊断报告是否有价值，仍需说明现有办法具体在哪一步没解决问题**。这不代表我们已经验证了商家不需要诊断。

公开来源及其局限见 [证据台账](MERCHANT_EVIDENCE.md) 和 [替代方案](ALTERNATIVES.md)。尚无我们的商家访谈、后台观察或付费验证。

## Skill 搜索范围与状态

本轮检查了 `openai/skills` 官方精选清单、当前可用的 Product Design 研究说明，并阅读以下 5 个社区仓库中的 12 项候选技能正文；按需检查了被引用的资料或实现。下面是适用性判断，**不是整仓安全认证，也不是对经营效果的认证**。

[官方精选清单](https://github.com/openai/skills/tree/main/skills/.curated)由本机 `skill-installer` 的列表脚本读取。本轮没有在该清单中找到比下列候选更贴近早期需求挖掘的专用技能。脚本的“未安装”标记不能代表插件技能不存在，因此现有能力同时以本次会话的技能目录为准。

### 今天优先考虑的三项

| Skill 与原始文件 | 适合做什么 | 使用边界 |
| --- | --- | --- |
| [jobs-to-be-done](https://github.com/deanpeters/Product-Manager-Skills/blob/main/skills/jobs-to-be-done/SKILL.md) | 把“不出单”拆成具体情境、想完成的任务、现有办法、阻力和代价 | 今天只能形成任务假设。明天补真实行为和原话；不凭空填写情绪、付费意愿或“根因”。同目录有模板/示例，另引用相关技能 |
| [identify-assumptions-new](https://github.com/phuryn/pm-skills/blob/main/pm-product-discovery/skills/identify-assumptions-new/SKILL.md) | 检查“商家需要报告”“愿意提供数据”“能执行建议”等尚未证明的前提 | 只挑会改变产品方向的少量假设；没有证据时不填看似精确的置信度，不展开庞大的商业与技术报告 |
| [interview-script](https://github.com/phuryn/pm-skills/blob/main/pm-product-discovery/skills/interview-script/SKILL.md) | 把今天的未知转成明天能问的最近一次经历、已有投入和已尝试办法 | 今天准备问题，明天才执行；优先过去行为，愿望性回答不当作需求验证；不向受访者推销预设产品 |

建议先用这些方法帮助讨论，不一次安装整个技能库。若用户决定安装，再核对选定版本、必需的引用文件与实际运行行为。

### 后续候选与未优先采用的原因

| Skill 与来源 | 时机及本轮判断 |
| --- | --- |
| [brainstorm-experiments-new](https://github.com/phuryn/pm-skills/blob/main/pm-product-discovery/skills/brainstorm-experiments-new/SKILL.md) | 明天有具体任务后，设计一次人工交付试验。预先提出的成功门槛只是试验约定，不是市场事实；不未经授权发邮件、收款或预售 |
| [opportunity-solution-tree](https://github.com/phuryn/pm-skills/blob/main/pm-product-discovery/skills/opportunity-solution-tree/SKILL.md) | 有商家证据后整理“目标—需求—方案—试验”。今天可以比较假设，但不能把自动生成的机会树当调研结论 |
| [prioritize-assumptions](https://github.com/phuryn/pm-skills/blob/main/pm-product-discovery/skills/prioritize-assumptions/SKILL.md) | 可参考定性排序。当前版本对 Confidence 同时出现 1—10 量表和 `1 - Confidence` 写法；不直接照搬数值公式，尤其不在无样本时计算分数 |
| [competitor-analysis](https://github.com/phuryn/pm-skills/blob/main/pm-market-research/skills/competitor-analysis/SKILL.md) | 可研究罗盘、来客、人工陪跑等替代；完整模板要求五个直接竞品和市场估计，对今天过重，未知信息应留空，不能为了填表凑事实 |
| [discovery-interview-prep](https://github.com/deanpeters/Product-Manager-Skills/blob/main/skills/discovery-interview-prep/SKILL.md) | 可替代 interview-script，但依赖 workshop-facilitation 等引用，流程更重；无需同时安装两套访谈流程 |
| [problem-statement](https://github.com/deanpeters/Product-Manager-Skills/blob/main/skills/problem-statement/SKILL.md) | 有真实资料后写问题陈述。当前模板含根因和情绪字段，缺证据时容易过早补成故事，因此暂后置 |
| [audience-research](https://github.com/social-media-skills/skills/blob/main/skills/audience-research/SKILL.md) | 明天研究商家的顾客时有用，尤其区分买家与粉丝、收集原话；依赖 brand-profile 及参考资料。它研究内容受众，不等同于验证商家会买我们的产品 |
| [ecommerce-video-marketing](https://github.com/anbeime/skill/blob/main/skills/ecommerce-video-marketing/ecommerce-video-marketing/SKILL.md) | 若确认缺口是商品表达，再用于脚本与分镜，需要商品事实、顾客、卖点依据和素材。已查目录是方法文档，不能把“后期/A-B 测试”文字流程当成已实现工具 |
| [jtbd-knowledge-skill](https://github.com/AliDujie/jtbd-knowledge-skill/blob/main/SKILL.md) | 中文 JTBD 参考较全，但含 Python 分析、评分与商业化流程，当前无具体商家的阶段不宜默认全量执行；可参考情境、挣扎和替代方案部分 |

本机已可用的 Product Design 研究流程适合公开来源扫描、证据与推断区分，但更偏已有数字产品的使用问题，不能替代明天对商家的需求访谈。浏览器、表格和文档等已有技能在需要时再用；今天不进入视觉设计或开发流程。

## 继续讨论的起点

**老板用完我们的产品，马上能完成哪一件以前做不成的事？**

先描述具体成果，再讨论需要怎样的产品。可以先拿一个明确标为假设的商家情境推演；明天使用 [访谈提纲](INTERVIEW_GUIDE.md) 寻找支持和反证。讨论中若没有证据，记录为“尚不知道”，不要急着变成功能。
