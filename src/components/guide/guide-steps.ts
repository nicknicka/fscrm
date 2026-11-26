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
   * 这一步要求的完成动作。默认 `click`。
   *
   * 引导的原则是「用户真的做完了才推进」，而不是点一下就跳走：
   *
   * - `click`：点击目标元素本身。目标外的点击不算；
   * - `submit`：表单真正提交。点表单任意位置不算——
   *   否则用户刚点开下拉框、还没填内容，引导就跳走了；
   * - `confirm`：目标内的按钮被点击，并且相应内容已经出现。
   *   用于「打开面板 → 填完保存」这类要两步才完成的动作，
   *   例如新建客户：先点「+ 新建客户」弹窗，保存成功后列表里出现新客户才推进；
   * - `navigate`：完成了页面跳转（路径变化）。用于点客户名称进详情的行内链接；
   * - `leave`：目标元素消失。用于「点击后列表重新渲染」的场景，
   *   例如点完跟进表单保存，表单被提交后刷新，原节点不复存在即视为完成。
   *
   * 另外所有步骤都接受 `signalSelector`（见下）作为「确已生效」的判据。
   */
  completion?: "click" | "submit" | "confirm" | "navigate" | "leave";
  /**
   * 完成信号元素选择器：出现它才推进。
   *
   * 例如第二步等待新建的客户名出现在列表里、第四步等待新的跟进记录出现。
   * 这比「点了一下」可靠，用户点了但保存失败时引导会停在原地并提示。
   */
  signalSelector?: string;
  /**
   * 完成信号需要“新增内容”时，从哪个时刻开始记录已有内容。
   *
   * 默认在点击目标那一刻记录。但「先弹表单、填完再保存」的步骤，
   * 点击时还没有新内容，必须改成提交时再记录，否则基线里已经包含新行，
   * 判定永远不成立、引导会卡在等待上。
   */
  signalBaseline?: "action" | "submit";
  /** 等待完成信号的最长时间（毫秒），超时仍留在本步并提示用户。 */
  signalTimeout?: number;
}

/** 首次使用的完整操作链路：录入客户 → 记录跟进 → 转化商机 → 收款。 */
export const ONBOARDING_STEPS: GuideStep[] = [
  {
    id: "nav-customers",
    title: "第一步：打开客户列表",
    body: "客户是 CRM 的核心对象。点击左侧高亮的「客户」进入客户列表。",
    path: "/",
    placement: "right",
    completion: "navigate",
  },
  {
    id: "create-customer",
    title: "第二步：新建一个客户",
    body: "点击「+ 新建客户」打开表单，填好客户名称并保存。保存成功后列表里出现这个客户，引导才会继续。",
    path: "/customers",
    placement: "bottom",
    completion: "confirm",
    /** 保存后页面会刷新，新客户名会出现在客户名称链接里。 */
    signalSelector: "tbody a",
    /** 点「+ 新建客户」只是开表单，基线要等真正提交时再取。 */
    signalBaseline: "submit",
    signalTimeout: 60000,
  },
  {
    id: "customer-row",
    title: "第三步：点击客户名称进入详情",
    body: "点一下高亮的那个客户名称行，进入客户详情。详情里有联系人、商机和跟进记录。",
    path: "/customers",
    placement: "bottom",
    completion: "navigate",
  },
  {
    id: "followup-form",
    title: "第四步：记录一次跟进",
    body: "在「新增跟进」里填写沟通方式、内容和下次跟进时间，然后点「保存跟进」。保存成功后引导才会继续。",
    placement: "top",
    completion: "submit",
    /** 保存后出现新的跟进记录，才说明真的写入了。 */
    signalSelector: '[data-guide="followup-form"] ~ ol li',
    signalTimeout: 60000,
  },
  {
    id: "nav-opportunities",
    title: "第五步：去商机推进",
    body: "商机是进入销售流程的机会。点击左侧高亮的「商机」。",
    placement: "right",
    completion: "navigate",
  },
  {
    id: "create-opportunity",
    title: "第六步：新建一个商机",
    body: "点击「+ 新建商机」打开表单，选好客户、填上金额并保存。保存成功后引导才会继续。",
    path: "/opportunities",
    placement: "bottom",
    completion: "confirm",
    /** 保存后列表里出现新的商机链接（与「新建商机」按钮区分开）。 */
    signalSelector: "table tbody tr a",
    signalBaseline: "submit",
    signalTimeout: 60000,
  },
  {
    id: "nav-funnel",
    title: "第七步：查看销售漏斗",
    body: "漏斗按销售阶段汇总商机数量。点击左侧高亮的「销售漏斗」。",
    placement: "right",
    completion: "navigate",
  },
  {
    id: "nav-orders",
    title: "第八步：跟踪回款",
    body: "报价转合同、合同转订单后，在订单详情登记回款，系统自动算出未收差额。点击左侧高亮的「订单」。",
    placement: "right",
    completion: "navigate",
  },
];
