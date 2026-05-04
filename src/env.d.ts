/// <reference types="astro/client" />

interface Fetcher {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

// Global Env interface used by the Cloudflare adapter and cloudflare:workers module.
interface Env {
    DB: D1Database;
    EMAIL: Fetcher;
    ASSETS: Fetcher;
}

declare module "cloudflare:workers" {
    const env: Env;
    export { env };
}

declare namespace App {
    interface Locals {
        cfContext: ExecutionContext;
        user?: {
            id: number;
            email: string;
            name: string | null;
        };
    }
}
