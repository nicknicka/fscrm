/**
 * 引导式操作的步骤定义。
 *
 * 每步指向一个页面上的目标元素（通过 `data-guide` 属性选择），
 * 说明用户可以做什么。`path` 有值时，引导会先跳转到该页面再定位。
 */
export interface GuideStep {
  /** 唯一标识，同时作为目标元素的选择器：`[data-guide="<id>"]`。 */
  id: string;
  /** 步骤标题。 */
  title: string;
  /** 步骤说明。 */
  body: string;
  /** 目标所在页面路径；为空表示当前页。 */
  path?: string;
  /** 气泡相对目标的位置。 */
  placement?: "bottom" | "top" | "right" | "left";
  /**
   * 这一步的完成方式。
   *
   * - `navigate`（默认）：点一下目标就算完成，适合导航、按钮这类
   *  「点一下即达」的动作；
   * - `submit`：必须等用户把表单提交完才算完成，适合目标本身是表单、
   *  需要先填完再保存的场景。否则点到表单任意位置就会跳下一步，
   *  操作被打断。
   */
  completion?: "navigate" | "submit";
}

/** 首次使用的完整操作链路：录入客户 → 记录跟进 → 转化商机 → 收款。 */
export const ONBOARDING_STEPS: GuideStep[] = [
  {
    id: "nav-customers",
    title: "第一步：打开客户列表",
    body: "客户是 CRM 的核心对象。点击左侧「客户」进入客户列表。",
    path: "/",
    placement: "right",
  },
  {
    id: "create-customer",
    title: "第二步：新建客户",
    body: "点击「+ 新建客户」，填写名称并把自己设为负责人，保存后会收到飞书消息卡片。",
    path: "/customers",
    placement: "bottom",
  },
  {
    id: "customer-row",
    title: "第三步：点击客户名称进入详情",
    body: "客户详情里有联系人、商机和跟进记录三个区块。点一下任意客户名称即可进入。",
    path: "/customers",
    placement: "bottom",
  },
  {
    id: "followup-form",
    title: "第四步：记录一次跟进",
    body: "在客户详情下方的「跟进记录」里填写方式、内容和下次跟进时间，保存后沟通历史可追溯。填完并保存，引导才会继续。",
    placement: "top",
    completion: "submit",
  },
  {
    id: "nav-opportunities",
    title: "第五步：去商机推进",
    body: "商机是进入销售流程的机会。点击左侧「商机」。",
    placement: "right",
  },
  {
    id: "create-opportunity",
    title: "第六步：新建商机",
    body: "选择关联客户、填写金额与预计成交日期，负责人默认是你。",
    path: "/opportunities",
    placement: "bottom",
  },
  {
    id: "nav-funnel",
    title: "第七步：查看销售漏斗",
    body: "漏斗按销售阶段汇总商机数量，点击任一阶段可下钻查看明细。",
    placement: "right",
  },
  {
    id: "nav-orders",
    title: "第八步：跟踪回款",
    body: "报价转合同、合同转订单后，在订单详情登记回款，系统自动算出未收差额。",
    placement: "right",
  },
];
