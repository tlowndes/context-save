/**
 * The read-only view of the original email behind a step.
 * Fetched from Bridge (BODY.PEEK, so it stays unread) every time it's opened,
 * and only ever held in memory: email bodies are never saved anywhere.
 */
import { readableEmail, type ReadableEmail } from "../core/mime";
import type { Ports } from "./ports";

/** The email, or null when it's no longer in the inbox. */
export async function readEmail(ports: Ports, messageId: string): Promise<ReadableEmail | null> {
  const raw = await ports.mail.message(messageId);
  return raw ? readableEmail(raw) : null;
}
