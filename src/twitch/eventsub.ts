
import Z from "zod";

import Twitch from "../twitch.js";

import { WebSocketSchemas } from "./schema.js";

export class EventSubWebSocket {

    private ws?: WebSocket;
    private ws_old?: WebSocket;

    private first_welcome: boolean = true;

    private event_listeners: { type: string, callback: (ev: unknown) => void }[] = [];
    private welcome_listeners: { callback: (ev: Z.infer<typeof WebSocketSchemas.WELCOME>) => void }[] = [];
    private keepalive_listeners: { callback: (ev: Z.infer<typeof WebSocketSchemas.KEEPALIVE>) => void }[] = [];
    private close_listeners: { callback: (code: number) => void }[] = [];

    public constructor() {}

    public addEventListener(type: string, callback: (ev: unknown) => void) {
        this.event_listeners.push({ 
            type: type,
            callback: callback
        });
    }

    public addWelcomeListener(callback: (ev: Z.infer<typeof WebSocketSchemas.WELCOME>) => void) {
        this.welcome_listeners.push({ 
            callback: callback
        });
    }

    public addKeepaliveListener(callback: (ev: Z.infer<typeof WebSocketSchemas.KEEPALIVE>) => void) {
        this.keepalive_listeners.push({ 
            callback: callback
        });
    }

    public addCloseListener(callback: (code: number) => void) {
        this.close_listeners.push({ 
            callback: callback
        });
    }

    private onWelcome(ev: MessageEvent) {
        const json = WebSocketSchemas.WELCOME.safeParse(ev.data);

        if (!json.success) {
            return;
        }

        if (this.first_welcome) {
            this.welcome_listeners.forEach((listener) => {
                listener.callback(json.data);
            });
            this.first_welcome = false;
        }

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

        this.keepalive_listeners.forEach((listener) => {
            listener.callback(json.data);
        });
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
            this.close_listeners.forEach((listener) => {
                listener.callback(ev.code);
            })
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
