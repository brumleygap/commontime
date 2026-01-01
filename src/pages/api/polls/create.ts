export const prerender = false;

import type { APIRoute } from "astro";

function json(status: number, data: unknown) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

export const POST: APIRoute = async ({ request }) => {
    const formData = await request.formData();

    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();

    // quorum: default to 2 if blank/missing; must be an integer >= 2
    const quorumStr = String(formData.get("quorum") ?? "").trim();
    const quorum = quorumStr === "" ? 2 : Number.parseInt(quorumStr, 10);

    // slots: accept repeated fields named "slots"
    // (later your form will submit multiple <input name="slots" ...>)
    const slots = formData
        .getAll("slots")
        .map((v) => String(v).trim())
        .filter(Boolean);

    // Validate
    const errors: Record<string, string> = {};

    if (!title) errors.title = "Title is required.";
    if (!Number.isFinite(quorum) || !Number.isInteger(quorum) || quorum < 2) {
        errors.quorum = "Minimum people needed must be 2 or more.";
    }
    if (slots.length < 2) errors.slots = "Add at least 2 options.";

    // Duplicate slots check (exact string match for now)
    const unique = new Set(slots);
    if (slots.length >= 2 && unique.size !== slots.length) {
        errors.slots = "Duplicate options aren’t allowed.";
    }

    if (Object.keys(errors).length > 0) {
        return json(400, { ok: false, errors });
    }

    // For now, just echo the validated payload
    return json(200, { ok: true, poll: { title, description, quorum, slots } });
};
