export async function sendPushToUsers(
    userIds: number[],
    title: string,
    body: string,
    url: string,
    appId: string,
    apiKey: string,
) {
    if (userIds.length === 0) return;
    const res = await fetch("https://onesignal.com/api/v1/notifications", {
        method: "POST",
        headers: {
            Authorization: `Key ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            app_id: appId,
            include_external_user_ids: userIds.map(String),
            headings: { en: title },
            contents: { en: body },
            url,
        }),
    });
    if (!res.ok) {
        console.error("OneSignal push failed:", await res.text());
    }
}
