import { describe, expect, it } from "vitest";
import { check, markAvoiding } from "../../src/services/inbox";
import type { ModelStatus, Ports } from "../../src/services/ports";
import { finishStep, makeStep, restoreMark } from "../../src/services/steps";
import { fakePorts, fromSam, settings } from "../fakes";

const SAM_RAW = "From: Sam <sam@example.com>\r\nContent-Type: text/plain\r\n\r\nSaturday at Rob's. Are you in or out?\r\n";

async function setup(opts: { model?: ModelStatus; generate?: string; claude?: string | Error } = {}) {
  const ports = fakePorts({ inbox: [fromSam(6)], sent: [] }) as Ports & { files: Map<string, string> };
  const prompts: string[] = [];
  ports.mail.message = async () => SAM_RAW;
  ports.model = {
    status: async () => opts.model ?? { state: "missing", sizeMb: 1100 },
    download: async () => undefined,
    generate: async (p) => (prompts.push(p), opts.generate ?? ""),
  };
  ports.claude = {
    ask: async (_s, u) => {
      prompts.push(u);
      if (opts.claude instanceof Error) throw opts.claude;
      return opts.claude ?? "";
    },
  };
  const [sam] = (await check(ports, settings())).candidates;
  await markAvoiding(ports, sam);
  return { ports, id: sam.messageId, prompts };
}

describe("makeStep", () => {
  it("falls back to a template and says how to get better steps", async () => {
    const { ports, id } = await setup();
    const v = await makeStep(ports, id, "first");
    expect(v.step).toEqual({ text: "Reply yes or no to Sam", minutes: 2, source: "template" });
    expect(v.email.body).toBe("Saturday at Rob's. Are you in or out?");
    expect(v.note).toMatch(/Download the built-in model/);
  });

  it("uses the built-in model when it's ready, and remembers the step", async () => {
    const { ports, id, prompts } = await setup({ model: { state: "ready" }, generate: "Tell Sam you're in for Saturday" });
    const v = await makeStep(ports, id, "first");
    expect(v.step.source).toBe("model");
    expect(prompts[0]).toContain("Are you in or out?");
    const view = await check(ports, settings());
    expect(view.avoiding[0].step?.text).toBe("Tell Sam you're in for Saturday");
    // Opening it again doesn't re-run the model.
    expect((await makeStep(ports, id, "first")).step.text).toBe("Tell Sam you're in for Saturday");
    expect(prompts).toHaveLength(1);
  });

  it("makes it smaller, never repeating the same step", async () => {
    const { ports, id } = await setup({ model: { state: "ready" }, generate: "Reply yes or no to Sam" });
    await makeStep(ports, id, "first");
    const v = await makeStep(ports, id, "smaller");
    expect(v.step.text).toBe("Open the email from Sam and start a reply");
  });

  it("asks Claude only in claude mode, and falls back with a note on failure", async () => {
    const ok = await setup({ claude: "Text Sam: I'm in" });
    expect((await makeStep(ok.ports, ok.id, "claude")).step).toMatchObject({ text: "Text Sam: I'm in", source: "claude" });

    const bad = await setup({ claude: new Error("Add a Claude API key in Settings first.") });
    const v = await makeStep(bad.ports, bad.id, "claude");
    expect(v.step.source).toBe("template");
    expect(v.note).toBe("Add a Claude API key in Settings first.");
  });

  it("Done takes it off the list until tomorrow, and Undo puts it back with its step", async () => {
    const { ports, id } = await setup();
    await makeStep(ports, id, "first");
    const before = await finishStep(ports, id);
    let view = await check(ports, settings());
    expect(view.avoiding).toHaveLength(0);
    expect(view.candidates).toHaveLength(0);
    await restoreMark(ports, id, before);
    view = await check(ports, settings());
    expect(view.avoiding[0].step?.text).toBe("Reply yes or no to Sam");
  });
});
