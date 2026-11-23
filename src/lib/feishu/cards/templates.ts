/**
 * 飞书交互卡片模板。
 *
 * 与 `lark.messageCard.defaultCard`（标题 + 一段文字）的本质区别是：
 * 这些卡片带 `button` 与 `value` 载荷，点击后由 `card.action.trigger` 回调
 * 命中 `src/lib/feishu/bot/card-actions.ts` 里的处理逻辑，直接写 CRM 数据，
 * 再用 `updateCard` 原地刷新——这是飞书原生消息做不到的部分。
 *
 * 卡片 JSON 采用飞书卡片 2.0 之前稳定的 v1 结构（config/elements/actions），
 * 兼容性最好。
 */

/** 卡片按钮的载荷：动作类型 + 目标对象 + 附加参数。 */
export interface CardActionValue {
  /** 动作类型，决定由哪个 handler 执行。 */
  action:
    | "claim_customer"
    | "create_followup_for_customer"
    | "advance_opportunity_stage"
    | "open_customer"
    | "bind_chat_to_customer";
  /** 业务对象 ID。 */
  targetId: string;
  /** 附加参数，如目标阶段。 */
  [key: string]: string | undefined;
}

/** 卡片头部颜色（飞书模板色板）。 */
type TemplateColor =
  "blue" | "green" | "orange" | "red" | "grey" | "wathet" | "turquoise";

interface ButtonSpec {
  text: string;
  /** primary / default / danger */
  type?: "primary" | "default" | "danger";
  value: CardActionValue;
}

interface CardSpec {
  title: string;
  color: TemplateColor;
  /** 主体 Markdown 内容。 */
  markdown: string;
  buttons?: ButtonSpec[];
  /** 底部灰色小字。 */
  note?: string;
}

/** 把内部的 CardSpec 渲染成飞书卡片 JSON。 */
function render({ title, color, markdown, buttons, note }: CardSpec): object {
  const elements: object[] = [
    {
      tag: "div",
      text: { tag: "lark_md", content: markdown },
    },
  ];

  if (buttons && buttons.length > 0) {
    elements.push({
      tag: "action",
      actions: buttons.map((button) => ({
        tag: "button",
        text: { tag: "plain_text", content: button.text },
        type: button.type ?? "default",
        value: button.value,
      })),
    });
  }

  if (note) {
    elements.push({
      tag: "note",
      elements: [{ tag: "plain_text", content: note }],
    });
  }

  return {
    config: { wide_screen_mode: true, update_multi: true },
    header: {
      template: color,
      title: { tag: "plain_text", content: title },
    },
    elements,
  };
}

/** 生成 CRM 网页链接（用于卡片里的跳转按钮）。 */
export function crmUrl(path: string): string {
  const base = process.env.APP_BASE_URL?.replace(/\/+$/, "");
  return base ? `${base}${path}` : path;
}

const MODE_LABEL: Record<string, string> = {
  CALL: "电话",
  MEETING: "面谈",
  EMAIL: "邮件",
  IM: "即时消息",
  OTHER: "其他",
};

function formatDate(date: Date | null): string {
  if (!date) return "未安排";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** 机器人刚记完一条跟进：展示结构化结果。 */
export function followUpCreatedCard(input: {
  customerId: string;
  customerName: string;
  opportunityName: string | null;
  mode: string;
  content: string;
  nextFollowUpAt: Date | null;
  amount: number | null;
  engine: "model" | "rules";
}): object {
  const lines = [
    `**客户**　${input.customerName}`,
    input.opportunityName ? `**商机**　${input.opportunityName}` : null,
    `**方式**　${MODE_LABEL[input.mode] ?? input.mode}`,
    `**内容**　${input.content}`,
    `**下一步**　${formatDate(input.nextFollowUpAt)}`,
    input.amount
      ? `**提到金额**　¥${input.amount.toLocaleString("zh-CN")}（仅记录，需你确认后写入商机）`
      : null,
  ].filter(Boolean);

  return render({
    title: "已记录到 CRM ✓",
    color: "green",
    markdown: lines.join("\n"),
    buttons: [
      {
        text: "打开客户档案",
        type: "primary",
        value: {
          action: "open_customer",
          targetId: input.customerId,
          url: crmUrl(`/customers/${input.customerId}`),
        },
      },
      {
        text: "再记一条",
        value: {
          action: "create_followup_for_customer",
          targetId: input.customerId,
        },
      },
    ],
    note:
      input.engine === "model"
        ? "由模型解析 · 如需修正可在网页端编辑这条跟进记录"
        : "按关键词识别（模型未启用或调用失败）· 建议核对内容",
  });
}

/**
 * 机器人没听懂：追问，并把候选客户做成按钮。
 *
 * 这是「机器人不是哑巴转发器」的关键设计点——认不出来就问，不瞎写。
 */
export function clarificationCard(input: {
  reason: string;
  text: string;
  candidates: { id: string; name: string }[];
}): object {
  const lines = [
    `没有直接记下来：${input.reason}`,
    "",
    `**我收到的消息**\n> ${input.text.slice(0, 200).replace(/\n/g, "\n> ")}`,
  ];
  if (input.candidates.length > 0) {
    lines.push("", "请选择要关联的客户：");
  } else {
    lines.push(
      "",
      "可以这样再说一次：`客户杭州云启科技 今天电话聊了，预算80万，下周三要方案`"
    );
  }

  return render({
    title: "需要你确认一下",
    color: "orange",
    markdown: lines.join("\n"),
    buttons: input.candidates.slice(0, 3).map((candidate) => ({
      text: candidate.name,
      value: {
        action: "create_followup_for_customer",
        targetId: candidate.id,
        originalText: input.text.slice(0, 500),
      },
    })),
    note: "选中客户后，我会把刚才那段话记成该客户的跟进记录。",
  });
}

/** 公海客户：带「认领」按钮，点击直接写 ownerId。 */
export function publicPoolCard(input: {
  customerId: string;
  customerName: string;
  level: string;
  industry: string | null;
  assignedTo?: string;
}): object {
  const claimed = Boolean(input.assignedTo);
  return render({
    title: claimed ? "公海客户 · 已被认领" : "公海客户 · 待认领",
    color: claimed ? "grey" : "blue",
    markdown: [
      `**客户**　${input.customerName}`,
      `**等级**　${input.level}`,
      input.industry ? `**行业**　${input.industry}` : null,
      claimed ? `**负责人**　${input.assignedTo}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    buttons: claimed
      ? [
          {
            text: "打开客户档案",
            value: {
              action: "open_customer",
              targetId: input.customerId,
              url: crmUrl(`/customers/${input.customerId}`),
            },
          },
        ]
      : [
          {
            text: "我来认领",
            type: "primary",
            value: { action: "claim_customer", targetId: input.customerId },
          },
        ],
    note: claimed
      ? "其他同事点击将不会生效"
      : "认领后只有你能看到该客户的完整信息与单据",
  });
}

/** 商机阶段推进卡片：按钮直接改 stage。 */
export function opportunityStageCard(input: {
  opportunityId: string;
  opportunityName: string;
  customerName: string;
  stage: string;
  stageLabel: string;
  amount: number | null;
  nextStage: { value: string; label: string } | null;
  actorName?: string;
}): object {
  return render({
    title: `商机 · ${input.stageLabel}`,
    color:
      input.stage === "WON"
        ? "green"
        : input.stage === "LOST"
          ? "red"
          : "turquoise",
    markdown: [
      `**商机**　${input.opportunityName}`,
      `**客户**　${input.customerName}`,
      input.amount
        ? `**金额**　¥${input.amount.toLocaleString("zh-CN")}`
        : null,
      input.actorName ? `**最近操作**　${input.actorName}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    buttons: input.nextStage
      ? [
          {
            text: `推进到「${input.nextStage.label}」`,
            type: "primary",
            value: {
              action: "advance_opportunity_stage",
              targetId: input.opportunityId,
              stage: input.nextStage.value,
            },
          },
          {
            text: "打开商机",
            value: {
              action: "open_customer",
              targetId: input.opportunityId,
              url: crmUrl(`/opportunities/${input.opportunityId}`),
            },
          },
        ]
      : [
          {
            text: "打开商机",
            value: {
              action: "open_customer",
              targetId: input.opportunityId,
              url: crmUrl(`/opportunities/${input.opportunityId}`),
            },
          },
        ],
    note: "在飞书里点按钮会直接更新 CRM 的销售阶段，网页端漏斗同步变化",
  });
}

/** 无 CRM 账号时的引导卡片。 */
export function unboundUserCard(openId: string): object {
  return render({
    title: "还差一步：账号未绑定",
    color: "orange",
    markdown: [
      "你的飞书身份还没有对应的 CRM 账号，所以暂时不能记录跟进。",
      "",
      "请联系管理员在「设置 → 用户与角色」里把你的飞书身份并入账号。",
      `**你的飞书 open_id**\n\`${openId}\``,
    ].join("\n"),
    note: "open_id 仅供管理员配置使用，不会对外公开",
  });
}

/** 模型未配置时的提示卡片。 */
export function modelMissingCard(): object {
  return render({
    title: "模型服务尚未配置",
    color: "orange",
    markdown: [
      "机器人需要模型服务才能理解你的话。",
      "",
      "请管理员打开 **设置 → 模型服务**，填写 OpenAI 兼容接口的地址、模型 ID 与 API Key 并点「保存并测试」。",
    ].join("\n"),
    note: "配置完成后无需重启，下一条消息即可生效",
  });
}

/** 通用操作结果卡片（认领成功、推进成功、失败原因）。 */
export function actionResultCard(input: {
  title: string;
  ok: boolean;
  markdown: string;
  buttons?: ButtonSpec[];
}): object {
  return render({
    title: input.title,
    color: input.ok ? "green" : "orange",
    markdown: input.markdown,
    buttons: input.buttons,
  });
}

/** 一类提醒卡片的标题与说明。 */
const REMINDER_META: Record<
  string,
  { title: string; color: TemplateColor; hint: string }
> = {
  followup_overdue: {
    title: "有跟进承诺到期了",
    color: "orange",
    hint: "你在 CRM 里登记的下一步时间已过，记得处理或改期",
  },
  customer_silent: {
    title: "这些客户很久没动了",
    color: "blue",
    hint: "超过 14 天没有任何跟进，趁早打个招呼",
  },
  payment_due: {
    title: "有订单还没收齐款",
    color: "wathet",
    hint: "回款差额按订单金额减去已登记回款计算",
  },
  task_due: {
    title: "有任务/日程到期了",
    color: "red",
    hint: "你在 CRM 里安排的任务或日程计划时间已过",
  },
};

/**
 * 提醒卡片：一次提醒一个负责人的一类待办。
 *
 * 刻意按「负责人 × 类别」聚合，而不是每个对象一张卡——
 * 一个负责人有 20 个沉默客户时，20 条消息只会让他把机器人免打扰。
 */
export function reminderCard(input: {
  kind: "followup_overdue" | "customer_silent" | "payment_due" | "task_due";
  ownerName: string;
  items: { id: string; title: string; detail: string; customerId?: string }[];
  total: number;
  maxItems?: number;
}): object {
  const meta = REMINDER_META[input.kind] ?? {
    title: "待处理提醒",
    color: "blue" as TemplateColor,
    hint: "",
  };
  const lines = input.items.map(
    (item, index) => `${index + 1}. **${item.title}**　${item.detail}`
  );
  const more = input.total - input.items.length;
  if (more > 0) {
    lines.push(`…… 还有 ${more} 条，见网页端`);
  }

  return render({
    title: `${meta.title}（${input.total} 条）`,
    color: meta.color,
    markdown: [`${input.ownerName}，${meta.hint}：`, "", ...lines].join("\n"),
    buttons: [
      {
        text: "打开待办列表",
        type: "primary",
        value: {
          action: "open_customer",
          targetId: "reminders",
          url: crmUrl("/reminders"),
        },
      },
    ],
    note: "机器人每天扫描一次，处理完会在下次扫描时消失",
  });
}
