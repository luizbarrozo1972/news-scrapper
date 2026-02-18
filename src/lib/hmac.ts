import crypto from "crypto";

export function signPayload(secret: string, body: string): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = `${timestamp}|${body}`;
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

export function getSignatureHeaders(secret: string, body: string): {
  "X-Timestamp": string;
  "X-Signature": string;
} {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = `${timestamp}|${body}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");
  return {
    "X-Timestamp": timestamp,
    "X-Signature": signature,
  };
}
