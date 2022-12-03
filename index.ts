import {CreateEvent, PushEvent, User, WebhookEvent} from "npm:@octokit/webhooks-types@^6.7.0";
import {serve} from "https://deno.land/std@0.157.0/http/server.ts";

const port = Deno.env.get("PORT") || 1337;
const target = Deno.env.get("TARGET") || "http://localhost:1337/mock-target";

const handler = async (request: Request): Promise<Response> => {
    if (request.url === "http://localhost:1337/mock-target") return new Response("Mock");
    if (request.method !== "POST") return new Response("Not post", {status: 405});
    if (!request.headers.get("X-GitHub-Event")) return new Response("No github", {status: 400});
    const eventType = request.headers.get("X-GitHub-Event") || "dum";
    const event = await request.json() as WebhookEvent;

    console.log("▶️Incoming " + eventType);
    const response = shouldForward(eventType, event);
    if (!response) {
        return await forward(request, target, event);
    } else {
        console.log("⛔ Not forwarding: " + response);
        return new Response("Not forwarding: " + response);
    }
};
await serve(handler, {port});

function shouldForward(eventType: string, event: WebhookEvent): string | null {
    let reason: string | null = null;
    if (isPush(eventType, event) || isCreate(eventType, event)) {
        reason = validSender(event.sender);
    }
    return reason;
}

function validSender(sender: User) {
    if (sender.login.includes("[bot]") || sender.login.endsWith("-bot")) {
        return "because sender is a bot (" + sender.login + ")";
    }
    return null;
}

async function forward(request: Request, target: string, event: WebhookEvent): Promise<Response> {
    try {
        console.log("🆗 Forwarding to", target);
        const body = JSON.stringify(event);

        const headers: Record<string, string> = {
            "content-type": "application/json",
        };
        // forward headers
        for (const [key, value] of Object.entries(request.headers)) {
            if (
                typeof value === "string" &&
                (key.includes("github") ||
                    key.includes("user-agent") ||
                    key.includes("authorization"))
            ) {
                headers[key] = value;
            }
        }
        // do request
        const result = await fetch(target, {
            headers,
            body,
            method: request.method,
        });

        if (result.ok) {
            console.log("✅ Forwarded");
            return new Response("Forwarded");
        }
        console.error("❌ Failed to forward:", result.status);
        return new Response("Failed to forward: " + result.status, {status: 502});
    } catch (err) {
        console.error("❌ Failed to forward:", err);
        return new Response("Failed to forward: " + err, {status: 502});
    }
}

function isPush(eventType: string, _event: WebhookEvent): _event is PushEvent {
    return eventType === "push";
}

function isCreate(eventType: string, _event: WebhookEvent): _event is CreateEvent {
    return eventType === "create";
}
