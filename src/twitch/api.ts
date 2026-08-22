
import Z from "zod";

import { AuthSchemas } from "./schema.js";

export class Auth {
    protected constructor(
        protected client_id: string,
        protected access_token: string,
        protected expires_at: Date,
    ) {}

    public token(): string {
        return this.access_token;
    }

    public expired(): boolean {
        return this.expires_at <= new Date();
    }

    public async validate(): Promise<Z.infer<typeof AuthSchemas.AUTH_VALIDATE>> {
        const res = await fetch("https://id.twitch.tv/oauth2/validate", {
            method: "GET",
            headers: { "Authorization": `OAuth ${this.access_token}` }
        });

        if (!res.ok) {
            throw new Error("Failed to validate auth token");
        }

        const json = AuthSchemas.AUTH_VALIDATE.safeParse(await res.json());
        if (json.success) {
            return json.data;
        } else {
            throw new Error("Invalid validation json recived");
        }
    }

    public async revoke() {
        const res = await fetch("https://id.twitch.tv/oauth2/revoke", {
            method: "POST",
            body: new URLSearchParams({
                client_id: this.client_id,
                token: this.access_token,
            }),
        });

        if (!res.ok) {
            throw new Error("Failed to revoke auth token");
        }
    }
}

export class AppAuth extends Auth {
    private constructor(
        client_id: string,
        access_token: string,
        expires_at: Date,
    ) { super(client_id, access_token, expires_at) }

    static async request(client_id: string, client_secret: string): Promise<AppAuth> {
        const res = await fetch("https://id.twitch.tv/oauth2/token", {
            method: "POST",
            body: new URLSearchParams({
                client_id: client_id,
                client_secret: client_secret,
                grant_type: "client_credentials",
            }),
        });

        if (!res.ok) {
            throw new Error("Failed to request auth token")
        }

        const json = AuthSchemas.AUTH_APP.safeParse(await res.json());
        if (json.success) {
            const expires_at = new Date(Date.now() + json.data.expires_in * 1000);
            return new AppAuth(client_id ,json.data.access_token, expires_at);
        } else {
            throw new Error("Invalid app auth json recived");
        }
    }
}

export class BotAuth extends Auth {
    public constructor(
        client_id: string,
        access_token: string,
        private refresh_token: string,
        private scopes: string[],
        expires_at: Date,
    ) { super(client_id, access_token, expires_at) }

    static async request(client_id: string, client_secret: string, access_code: string, redirect_uri: string): Promise<BotAuth> {
        const res = await fetch("https://id.twitch.tv/oauth2/token", {
            method: "POST",
            body: new URLSearchParams({
                client_id: client_id,
                client_secret: client_secret,
                grant_type: "authorization_code",
                code: access_code,
                redirect_uri: redirect_uri,
            }),
        });

        if (!res.ok) {
            throw new Error("Failed to request auth token");
        }

        const json = AuthSchemas.AUTH_BOT.safeParse(await res.json());
        if (json.success) {
            const expires_at = new Date(Date.now() + json.data.expires_in * 1000);
            return new BotAuth(client_id, json.data.access_token, json.data.refresh_token, json.data.scope, expires_at);
        } else {
            throw new Error("Invalid app auth json recived");
        }
    }

    async refresh(client_secret: string) {
        const res = await fetch("https://id.twitch.tv/oauth2/token", {
            method: "POST",
            body: new URLSearchParams({
                client_id: this.client_id,
                client_secret: client_secret,
                grant_type: "refresh_token",
                refresh_token: this.refresh_token,
            }),
        });

        if (!res.ok) {
            throw new Error("Failed to refresh auth token");
        }

        const json = AuthSchemas.AUTH_REFRESH.safeParse(await res.json());
        if (json.success) {
            const expires_at = new Date(Date.now() + json.data.expires_in * 1000);

            this.access_token = json.data.access_token;
            this.refresh_token = json.data.refresh_token;
            this.scopes = json.data.scope;
            this.expires_at = expires_at;
        } else {
            throw new Error("Invalid refresh json recived");
        }
    }
}

export namespace API.Helix {
    
}