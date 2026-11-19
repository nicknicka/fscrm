/**
 * 飞书事件的数据结构定义。
 *
 * 事件数据结构直接对应 SDK `EventDispatcher.register` 中各事件键的入参，
 * 便于处理器以类型安全的方式读取字段。字段均为可选，因事件可能来自不同版本。
 */

/** 事件公共字段，飞书推送的每个事件都携带。 */
export interface FeishuEventBase {
  event_id?: string;
  token?: string;
  create_time?: string;
  event_type?: string;
  tenant_key?: string;
  ts?: string;
  uuid?: string;
  type?: string;
  app_id?: string;
}

/** 发送者信息。 */
export interface FeishuEventSender {
  sender_id?: {
    union_id?: string;
    user_id?: string;
    open_id?: string;
  };
  sender_type?: string;
  tenant_key?: string;
}

/** 消息提及信息。 */
export interface FeishuMessageMention {
  key?: string;
  id?: {
    union_id?: string;
    user_id?: string;
    open_id?: string;
  };
  name?: string;
}

/** `im.message.receive_v1` 事件载荷。 */
export interface FeishuMessageReceiveEvent extends FeishuEventBase {
  sender?: FeishuEventSender;
  message: {
    message_id: string;
    root_id?: string;
    parent_id?: string;
    create_time: string;
    update_time?: string;
    chat_id: string;
    thread_id?: string;
    chat_type: string;
    message_type: string;
    content: string;
    mentions?: FeishuMessageMention[];
  };
}

/**
 * 事件处理器的统一入参：事件键 + 事件数据。
 *
 * 分发边界上 `data` 为 `unknown`，由具体处理器在读取前收窄为对应事件类型，
 * 避免注册表因泛型逆变而无法容纳不同类型的处理器。
 */
export interface FeishuEventPayload {
  /** 事件键，如 `im.message.receive_v1`。 */
  key: string;
  /** 事件数据。 */
  data: unknown;
}

/** 事件处理器函数类型。 */
export type FeishuEventHandler = (
  payload: FeishuEventPayload
) => void | Promise<void>;
