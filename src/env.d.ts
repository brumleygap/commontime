/// <reference types="astro/client" />

type Env = {
    DB: D1Database;
};

declare namespace App {
    interface Locals {
        runtime: {
            env: Env;
        };
    }
}
