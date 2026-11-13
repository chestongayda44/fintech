const MESSAGING_URL = "https://api.messaging-partner.example/v1/messages";
const MESSAGING_TOKEN = "fintechco-msg-prod-7f3a9c21e44b";

export async function sendSms(phone: string, text: string): Promise<void> {
  const res = await fetch(MESSAGING_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${MESSAGING_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to: phone, text }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`messaging partner HTTP ${res.status}`);
}
