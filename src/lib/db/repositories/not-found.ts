/**
 * 仓储层「越权或不存在」的统一错误契约。
 *
 * 报价、合同、订单、回款都和商机/线索一样，用同一个 NOT_FOUND 错误拒绝越权与
 * 不存在，避免在响应中区分「存在但无权」与「不存在」。调用方（Server Action）
 * 用 `instanceof BusinessObjectNotFoundError` 统一映射为 `{ ok: false, error: "NOT_FOUND" }`，
 * 不依赖 message/name 字符串匹配。
 *
 * 各单据保留自己的错误类名并继承本基类，既让判定只需一处，也不必改动既有的
 * `instanceof XxxNotFoundError` 断言与页面 action 的导入。
 */

/** 权限不足、对象不存在或重复转换时统一抛出的错误。 */
export class BusinessObjectNotFoundError extends Error {
  constructor(name = "BusinessObjectNotFoundError") {
    super("NOT_FOUND");
    this.name = name;
  }
}

/** 报价越权或不存在。 */
export class QuotationNotFoundError extends BusinessObjectNotFoundError {
  constructor() {
    super("QuotationNotFoundError");
  }
}

/** 合同（或来源报价）越权、不存在或重复转换。 */
export class ContractNotFoundError extends BusinessObjectNotFoundError {
  constructor() {
    super("ContractNotFoundError");
  }
}

/** 订单（或来源合同）越权、不存在或重复转换。 */
export class OrderNotFoundError extends BusinessObjectNotFoundError {
  constructor() {
    super("OrderNotFoundError");
  }
}

/** 回款越权，或回款所挂订单不存在。 */
export class PaymentNotFoundError extends BusinessObjectNotFoundError {
  constructor() {
    super("PaymentNotFoundError");
  }
}
