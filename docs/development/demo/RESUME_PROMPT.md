# 可直接复制：路芽统筹恢复提示词

更新：2026-08-28，用户明确要求再次接续，避免当前任务上下文过长。本提示词恢复项目状态、边界与下一步，不保证转移旧任务逐字历史或工具会话。

当前移交发起人为`黑客松 Demo 统筹接续`（`01a04697-8ecd-7663-8d03-a5d59511abdd`）。新任务先只读，正式责任人、迁移状态和Git锚点以[接续记录](COORDINATOR_HANDOFF.md)为准；已经完成正式接任的任务不需要反复等旧统筹授权。若未来再次使用本提示词，须按接续记录替换上一任及任务状态，不能与现任同时写入。

```text
我是张泽厚。这是我授权的新统筹接续任务，接手“路芽”三页Demo的产品、设计、开发协调、验收和Git。上一任统筹为“黑客松 Demo 统筹接续”，任务ID 01a04697-8ecd-7663-8d03-a5d59511abdd。你先只读验收，上一任核验并发出“正式接管”后再写入；不要把迁移当成UI验收。

直接使用 C:/Users/Administrator/Documents/ChatGPT/大战黑客松，与现有任务共享工作区，不另建工程或工作树。先实际读取根AGENTS.md、docs/development/README.md、CURRENT_BRIEF.md、inbox/README.md，再读docs/development/demo/COORDINATOR_HANDOFF.md、RESUME_PROMPT.md、README.md、IMPLEMENTATION_QUEUE.md、SHARED_CONTRACT.md、CONTRACT_DETAILS.md、DESIGN_BRIEF.md、QA_MATRIX.md、QA_INTEGRATION.md及QA_AGENT_1/2/3.md。实现前按需读SHARED_BUILD_PLAN、MONEYAI_INTEGRATION、各页PROMPT及已有品牌/视觉反馈记录；不再拆原始私人ZIP、读凭据或私有聊天。

已确认范围：原生HTML/CSS/ES modules、三页隔离、共享状态。REQ-25最高优先：首页语音主入口，TXT/CSV/JSON材料次入口，手动默认折叠，九组理解确认，最多3问、一次1问、跨页额度不重置。原始transcript与编辑description、来源账本和更正由INTAKE_SET一起保存；回答只QUESTION_SET，不暗中再提取或二次INTAKE_SET。新图片入口关闭，旧原件/历史保留。第二页看清并选择下一步，第三页先拿内容复制/下载，再自愿反馈。新需求冲突处优先，但不换栈、不扩展云服务授权。

最新视觉：PC主验收1920×1080，先网页基础稿/实际主流程，再手机或手机Figma；过程应实际查看并展示图像。产品名“路芽”、现版IP和理念“把下一步看清楚，把每一次选择接起来”已定，不重新选名或重画。REQ-28已撤回NotebookLM三栏专业工作台主布局，保留三页渐进、清楚功能区和具名可返回的信息入口；不能退回Word平铺，也不隐藏关键风险、重要未知或来源。具体色值、最终UI仍未批准；IP原图入Git许可未定。REQ-23固定单标题FoldText已授权并由共享原生实现，第一/三页已接入，动效实看未验，不再重复求开工许可或安装React/GSAP。

保留以下五个原任务，使用任务工具核对，不创建替代任务：
- 第一页开发agent：01a04682-028f-77c0-a049-75cee44974a8。REQ-25本批HTML/CSS/JS/QA四文件已固定停写；九组/三问/原文保存、外部更正A/B显式恢复、旧回执防误清dirty、revision-only重试、示例/重置空理解清理已交付。最终intake.js为125378字节，SHA256 4b854d917c9652cb4d132b4b97f6d85baecdd2dcb9de1576095fe2bb6a8872ca；其他哈希和未验项见QA/交接。
- 第二页开发agent：01a04682-8d35-7a00-991b-f994f6fbf0d2。基础文件在场，但工具仍显示旧轮active，后续REQ-20/23/25/28已发送且未收到新回执。已知待修：查看与已选状态分开、已选有效路径直接继续、多问快照及intake/txt来源/判断标签。未授权你抢写其文件；上一任已请用户在原任务停止旧轮并继续最新待办，尚未得到处理回执。
- 第三页开发agent：01a04682-e43a-7292-89b1-7c2da672ba54。REQ-20功能区、REQ-23固定标题及REQ-25来源/导出限定回归已交回停写；统筹已独立复跑其8组reducer组合。REQ-28进一步布局与真实UI仍未验。
- 视觉反馈与动效评审：01a046ec-d06b-75b3-85fe-e02a9c9c9a34。独占docs/development/design-feedback/和demo/assets/design/feedback/，本批已停写；DF003已明确撤回NotebookLM主布局。
- 产品 IP 与品牌设计：01a04706-a4a9-72e3-b13f-c4fdb78bda1b。品牌三文档已交回停写，独占品牌目录；私有IP原件仍不入Git。两设计任务只向统筹交接，不给页面派活。

公共文件、共享代码/后端/测试/公共资产和Git只归现任统筹。页面Agent只改归属页面文件及自己的QA，不pull/切分支/提交。新统筹未登记ID不算冲突，但正式移交前不得写入或派活；不要重复生图、重写schema/准备文档、改MCP/信任或新建页面任务。实际前端工作继续用Build Web Apps、Product Design及已核验的21st/React Bits，按需读skill，不重复三页前检。

检查事实：根任务最终复跑Node 45/45、Python后端12/12、18份JS语法通过；内容检查与15个素材定义、git diff --check需按当前文件重跑。P1内存/假DOM与P3纯函数不是UI、真实BFCache、麦克风、IME、IndexedDB/Blob、下载落盘或动效验收。共享浏览器宿主有13个定义，实际浏览器执行0项；SHARED_READY和VISUAL_APPROVED仍false。合成案例/规则生成与真实能力分别标识，未知不填0，情景不冒充统计概率，查看/选择/采用/执行/复制/下载/保存/读回各自独立。

统一服务最近实际在 http://127.0.0.1:4188/01-intake.html 可达，三页与模块HTTP200且响应字节和磁盘一致。先核对现有服务，不重复抢端口。Browser插件因Trusted RPC dependency可信路径错误无法初始化；上一任已询问是否允许现有Playwright在独立合成配置做PC验证，尚未获明确答复。不得修改信任或静默回退，不用参考图冒充运行截图。

MoneyAI是分析、路径与历史决策核心，不是可省略附属物。本机安装/健康已核验；当前serviceReachable=true但analysisReady/historyWriteReady/historyReadVerified/extractionReady均false。专用项目会话、模型/费用/材料发送范围与真实写入读回未落实，不因健康可达就启用真实调用。提取未就绪时明确手动核对；未经许可不POST商家原文、不读个人历史或凭据。

磁盘曾满造成截断，现C盘约7GB仅为历史测值，受损文件已恢复且通过检查；每批写前实际核对>1GiB、D盘留备份、同目录临时文件flush/校验/原子替换，失败暂停，不清用户/其他任务文件。D恢复副本不是新工程，当前C路径为准，旧恢复稿不得覆盖最新代码。Git同步不包含浏览器保存数据、原始ZIP、IP私有原图、凭据或运行进程。

第一轮请只读核对文件、git status/log、实际代码与哈希，并用任务工具查询五个原任务；可运行现有内容检查，明确不是UI验收。简短回执覆盖：已确认/未确认；五任务及停写/未回执；真实实现与检查；唯一写入归属；隐私/模型/执行语义；浏览器与MoneyAI授权缺口；U1—U7未完成项；正式接任后的第一步。回执后停止，等上一任明确“正式接管”。接任后保持三页推进与PC优先，不重新要求用户批准已接受的最小范围；继续解决P2原任务恢复、获准浏览器验证、MoneyAI核心通路、品牌/渐进布局及Git，不因迁移重做已有成果。
```
