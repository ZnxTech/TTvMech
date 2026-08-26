
import Z from "zod";

import { WebSocketSchemas } from "./schema.js";

export type EventSubWebSocketSession = {
    id: string,
    total: number,
    total_cost: number,
    total_max_cost: number,
};

export class EventSubWebSocket {

    private ws?: WebSocket;
    private ws_old?: WebSocket;

    private event_listeners: { type: string, callback: (ev: unknown) => void }[] = [];
    private welcome_listener: (ev: Z.infer<typeof WebSocketSchemas.WELCOME>) => void = () => {};
    private keepalive_listener: (ev: Z.infer<typeof WebSocketSchemas.KEEPALIVE>) => void = () => {};
    private revocation_listener: (ev: Z.infer<typeof WebSocketSchemas.REVOCATION>) => void = () => {};
    private close_listener: (code: number) => void = () => {};

    public constructor() {}

    public addEventListener(type: string, callback: (ev: unknown) => void) {
        this.event_listeners.push({ 
            type: type,
            callback: callback
        });
    }

    public setWelcomeListener(callback: (ev: Z.infer<typeof WebSocketSchemas.WELCOME>) => void) {
        this.welcome_listener = callback;
    }

    public setKeepaliveListener(callback: (ev: Z.infer<typeof WebSocketSchemas.KEEPALIVE>) => void) {
        this.keepalive_listener = callback;
    }

    public setRevocationListener(callback: (ev: Z.infer<typeof WebSocketSchemas.REVOCATION>) => void) {
        this.revocation_listener = callback;
    }

    public setCloseListener(callback: (code: number) => void) {
        this.close_listener = callback;
    }

    private onWelcome(ev: MessageEvent) {
        const json = WebSocketSchemas.WELCOME.safeParse(ev.data);

        if (!json.success) {
            return;
        }

        this.welcome_listener(ev.data);
        this.welcome_listener = () => {};

        // When reconnecting, close the old WebSocket only after
        // the welcome message of the new WebSocket. 
        if (this.ws_old !== undefined) {
            this.ws_old.close();
            this.ws_old = undefined;
        }
    }

    private onKeepalive(ev: MessageEvent) {
        const json = WebSocketSchemas.KEEPALIVE.safeParse(ev.data);
        
        if (!json.success) {
            return;
        }

        this.keepalive_listener(json.data);
    }

    private onNotification(ev: MessageEvent) {
        const json = WebSocketSchemas.NOTIFICATION.safeParse(ev.data);

        if (!json.success) {
            return;
        }

        this.event_listeners.forEach((listener) => {
            if (listener.type === json.data.metadata.subscription_type) {
                listener.callback(json.data.payload.event);
            }
        });
    }

    private onReconnect(ev: MessageEvent) {
        const json = WebSocketSchemas.RECONNECT.safeParse(ev.data);
        
        if (!json.success) {
            return;
        }

        const reconnect_url = new URL(json.data.payload.session.reconnect_url);

        // Save the old WebSocket until the new WebSocket
        // sends the welcome message.
        this.ws_old = this.ws;
        this.connect(reconnect_url);
    }

    private onRevocation(ev: MessageEvent) {
        const json = WebSocketSchemas.REVOCATION.safeParse(ev.data);

        if (!json.success) {
            return;
        }

        this.revocation_listener(json.data);
    }

    public connect(url?: URL) {
        this.ws = new WebSocket(url ?? new URL("wss://eventsub.wss.twitch.tv/ws"));

        this.ws.addEventListener("open", (ev) => {
            
        });

        this.ws.addEventListener("message", (ev) => {
            const generic = WebSocketSchemas.META.safeParse(ev.data);

            if (generic.success) {
                switch (generic.data.metadata.message_type) {
                case "session_welcome":
                    this.onWelcome(ev);
                    break;
                    
                case "session_keepalive":
                    this.onKeepalive(ev);
                    break;

                case "notification":
                    this.onNotification(ev);
                    break;

                case "session_reconnect":
                    this.onReconnect(ev);
                    break;

                case "revocation":
                    this.onRevocation(ev);
                    break;

                default:
                    break;
                }
            }
        });

        this.ws.addEventListener("close", (ev) => {
            this.close_listener(ev.code);
            this.close_listener = () => {};
        });
    }

    public close() {
        if (this.ws !== undefined) {
            this.ws.close();
        }

        if (this.ws_old !== undefined) {
            this.ws_old.close();
        }
    }
}
