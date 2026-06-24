import { Composio } from "@composio/core";
import dotenv from "dotenv";
dotenv.config();

const apiKey = process.env.COMPOSIO_API_KEY;
if (!apiKey) {
  console.error("❌ Error: COMPOSIO_API_KEY is not defined in the environment.");
  process.exit(1);
}

const composio = new Composio({ apiKey });

async function register() {
  console.log("📡 Subscribing to Slack channel message events via Composio SDK...");
  try {
    const response = await composio.triggers.subscribe({
      connectedAccountId: "ac_CoECmAGNbbL9",
      triggerName: "slack_channel_message_event",
      webhookUrl: "http://localhost:5001/api/integration/webhook"
    });
    console.log("✅ Success! Trigger subscribed successfully:", response);
  } catch (error) {
    console.error("❌ Failed to subscribe trigger:", error.message);
  }
}

register();
