/// <reference types="astro/client" />

interface SendEmail {
    send(message: {
        to: string | string[];
        from: string | { email: string; name: string };
        subject: string;
        text?: string;
        html?: string;
    }): Promise<{ messageId: string }>;
}

type Env = {
    DB: D1Database;
    EMAIL: SendEmail;
};

declare namespace App {
    interface Locals {
        runtime: {
            env: Env;
        };
        user?: {
            id: number;
            email: string;
        };
    }
}
