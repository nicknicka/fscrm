import { describe, expect, it } from "vitest";
import { createEventDispatcher } from "./dispatcher";
import type { FeishuEventLogger } from "./dispatcher";

/** 构造 v2（schema 2.0）格式的事件数据，SDK 按 header.event_type 路由。 */
function v2Event(eventType: string): Record<string, unknown> {
  return {
    schema: "2.0",
    header: { event_type: eventType, event_id: "evt_test" },
    event: {},
  };
}

describe("createEventDispatcher", () => {
  it("返回 EventDispatcher 实例", () => {
    const dispatcher = createEventDispatcher({});
    expect(dispatcher).toBeDefined();
    expect(typeof dispatcher.invoke).toBe("function");
  });

  it("处理器抛错时被兜底：记录错误且不中断", async () => {
    const errors: string[] = [];
    const logger: FeishuEventLogger = {
      info: () => {},
      error: (message) => errors.push(message),
    };

    const dispatcher = createEventDispatcher(
      {
        "test.event": () => {
          throw new Error("boom");
        },
      },
      logger
    );

    // 处理器抛错不应让 invoke 拒绝（被错误兜底捕获），resolve 为 undefined
    await expect(
      dispatcher.invoke(v2Event("test.event"), { needCheck: false })
    ).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("test.event");
  });

  it("处理器正常执行时记录信息", async () => {
    const ran: string[] = [];
    const dispatcher = createEventDispatcher({
      "test.ok": ({ key }) => {
        ran.push(key);
      },
    });

    await dispatcher.invoke(v2Event("test.ok"), { needCheck: false });
    expect(ran).toEqual(["test.ok"]);
  });
});
