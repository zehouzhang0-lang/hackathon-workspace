import type { DemoInput } from "../types";

export type DemoScenarioId = "content" | "trust" | "transaction";

export interface DemoScenario {
  id: DemoScenarioId;
  label: string;
  expectedRoute: string;
  input: DemoInput;
}

const sharedContext = {
  sourceType: "synthetic" as const,
  windowStart: "2026-08-21",
  windowEnd: "2026-08-27",
};

export const demoScenarios: DemoScenario[] = [
  {
    id: "content",
    label: "内容点击断点",
    expectedRoute: "内容承接 Skill",
    input: {
      merchantName: "轻行户外旗舰店（合成案例）",
      category: "户外用品",
      productName: "折叠露营推车",
      price: "269",
      targetCustomer: "周末露营家庭、后备箱空间有限的城市用户",
      productFacts: "承重80kg\n折叠后厚度22cm\n全国包邮\n不包含桌板",
      currentProductCopy: "露营出行好帮手，大容量更能装，轻松开启周末生活。",
      constraints: "不能降价\n没有预算重拍长视频\n可以替换前5秒字幕和封面",
      customerQuestions: "折叠以后能不能放进轿车后备箱？\n女生一个人能拉吗？\n包含桌板吗？",
      dataContext: {
        ...sharedContext,
        contentId: "VIDEO-SYN-CONTENT-01",
        productId: "SKU-SYN-CART-01",
      },
      metrics: {
        videoViews: 80000,
        productClicks: 420,
        addToCarts: 84,
        createdOrders: 58,
        paidOrders: 49,
      },
    },
  },
  {
    id: "trust",
    label: "商品信任断点",
    expectedRoute: "信任与疑问 Skill",
    input: {
      merchantName: "轻活电器旗舰店（合成案例）",
      category: "家居小电器",
      productName: "350ml便携榨汁杯",
      price: "69.9",
      targetCustomer: "租房上班族、宿舍学生、轻食人群",
      productFacts: "容量350ml\nUSB-C充电\n全国包邮\n清洗方式以商品说明书为准",
      currentProductCopy: "轻巧便携，随时鲜榨。高颜值杯身，办公室和宿舍都能用。",
      constraints: "暂时不能降价\n不能编造打冰块能力或续航次数\n当前没有时间重拍复杂视频",
      customerQuestions: "一次能榨多少？\n充一次电能用几次？\n能不能打冰块？\n杯体怎么清洗？\n坏了怎么售后？",
      dataContext: {
        ...sharedContext,
        contentId: "VIDEO-SYN-TRUST-01",
        productId: "SKU-SYN-JUICER-01",
      },
      metrics: {
        videoViews: 58000,
        productClicks: 1450,
        addToCarts: 96,
        createdOrders: 54,
        paidOrders: 42,
      },
    },
  },
  {
    id: "transaction",
    label: "支付交易断点",
    expectedRoute: "交易阻力 Skill",
    input: {
      merchantName: "声野数码专营店（合成案例）",
      category: "3C数码",
      productName: "Type-C一拖二无线领夹麦克风",
      price: "79.9",
      targetCustomer: "安卓手机短视频创作者、直播新手和小商家",
      productFacts: "Type-C接口\n一拖二双麦\n全国包邮\n支持7天无理由退货，以商品页规则为准",
      currentProductCopy: "即插即用，一拖二无线收音，新手也能快速开始拍视频。",
      constraints: "不能降价\n不承诺未经验证的降噪距离与续航\n可以调整运费、发货和售后说明",
      customerQuestions: "多久发货？\n拆封试用以后还能退吗？\n直播时突然没声音怎么办？\n有没有运费险？",
      dataContext: {
        ...sharedContext,
        contentId: "VIDEO-SYN-PAY-01",
        productId: "SKU-SYN-MIC-01",
      },
      metrics: {
        videoViews: 50000,
        productClicks: 2000,
        addToCarts: 400,
        createdOrders: 300,
        paidOrders: 60,
      },
    },
  },
];

export const demoCase = demoScenarios[1].input;

export function cloneDemoCase(id: DemoScenarioId = "trust"): DemoInput {
  const scenario = demoScenarios.find((item) => item.id === id) ?? demoScenarios[1];
  return JSON.parse(JSON.stringify(scenario.input)) as DemoInput;
}
