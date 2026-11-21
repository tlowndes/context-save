import { describe, expect, it } from "vitest";
import { chatPrompt, firstName, parseStep, smallerTemplate, stepUserMessage, templateStep } from "../../src/core/steps";

const e = (subject: string, body = "", fromName = "Sam Patel") => ({ fromName, subject, body });

describe("firstName", () => {
  it("uses a first name only when it looks like one", () => {
    expect(firstName("Sam Patel")).toBe("Sam");
    expect(firstName("Recruiter, Studio North")).toBe("Recruiter, Studio North");
    expect(firstName("sam@x.com")).toBe("sam@x.com");
    expect(firstName("")).toBe("them");
  });
});

describe("templateStep", () => {
  it("matches common shapes of email", () => {
    expect(templateStep(e("Saturday, are you in or out?")).text).toBe("Reply yes or no to Sam");
    expect(templateStep(e("Portfolio review", "Any times next week?")).text).toBe("Send Sam two times that work");
    expect(templateStep(e("Boiler service: which day suits?", "", "Landlord")).text).toBe("Send Landlord two times that work");
    expect(templateStep(e("Invoice 204")).text).toBe("Check what Sam needs paying, then pay or reply");
    expect(templateStep(e("New draft", "I've attached v2, thoughts?")).text).toBe("Tell Sam when you'll look at it");
    expect(templateStep(e("Hello")).text).toBe("Reply to Sam with one line");
  });

  it("gets smaller each time", () => {
    const first = templateStep(e("Hello"));
    const s1 = smallerTemplate(e("Hello"), first);
    const s2 = smallerTemplate(e("Hello"), s1);
    const s3 = smallerTemplate(e("Hello"), s2);
    expect([s1.text, s2.text, s3.text]).toEqual(["Open the email from Sam and start a reply", "Write the first word of a reply to Sam", "Open the email from Sam and read it once"]);
    expect(s1.minutes).toBe(1);
  });
});

describe("parseStep", () => {
  it("cleans a model reply", () => {
    expect(parseStep('Next step: "reply yes or no to Sam."<|im_end|>', "model")).toEqual({ text: "Reply yes or no to Sam", minutes: 2, source: "model" });
    expect(parseStep("\n- Send Priya two times that work\nBecause…", "claude")?.text).toBe("Send Priya two times that work");
  });

  it("rejects empty, one-word or rambling replies", () => {
    expect(parseStep("", "model")).toBeNull();
    expect(parseStep("Reply", "model")).toBeNull();
    expect(parseStep("You should probably think carefully about whether you really want to go to the party on Saturday", "model")).toBeNull();
  });
});

describe("prompts", () => {
  it("builds the user message and chat prompt", () => {
    const msg = stepUserMessage(e("Sat?", "In or out?"), { text: "Reply to Sam", minutes: 3, source: "template" });
    expect(msg).toContain("Subject: Sat?");
    expect(msg).toContain('"Reply to Sam" still feels too big');
    expect(chatPrompt("S", "U")).toBe("<|im_start|>system\nS<|im_end|>\n<|im_start|>user\nU<|im_end|>\n<|im_start|>assistant\n");
  });
});
