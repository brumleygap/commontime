/// <reference types="astro/client" />

interface Fetcher {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

type Env = {
    DB: D1Database;
    EMAIL: Fetcher;
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
