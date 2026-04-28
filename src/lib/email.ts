export async function sendPollInviteEmail(
    emailBinding: Fetcher,
    to: string,
    pollTitle: string,
    pollUrl: string,
    inviterEmail: string,
) {
    const response = await emailBinding.fetch("https://commontime-email-sender/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            to,
            from: { email: "hello@commontime.app", name: "CommonTime" },
            subject: `You're invited: ${pollTitle}`,
            text: `${inviterEmail} has invited you to respond to a scheduling poll.\n\nPoll: ${pollTitle}\n\n${pollUrl}\n\nClick the link to see the options and mark your availability.`,
            html: `<p><strong>${inviterEmail}</strong> has invited you to respond to a scheduling poll.</p>
<h2 style="font-family:Georgia,serif">${pollTitle}</h2>
<p><a href="${pollUrl}" style="color:#c8102e">View poll and mark your availability →</a></p>
<p style="color:#888;font-size:12px">CommonTime helps groups find a time that works for everyone.</p>`,
        }),
    });

    if (!response.ok) {
        const error = await response.json() as { error?: string };
        throw new Error(error?.error ?? `Email service returned ${response.status}`);
    }
}

export async function sendMagicLinkEmail(
    emailBinding: Fetcher,
    to: string,
    magicLink: string,
) {
    const response = await emailBinding.fetch("https://commontime-email-sender/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            to,
            from: { email: "hello@commontime.app", name: "CommonTime" },
            subject: "Your CommonTime login link",
            text: `Click this link to log in. It expires in 15 minutes.\n\n${magicLink}\n\nIf you didn't request this, ignore this email.`,
            html: `<p>Click the link below to log in to CommonTime. It expires in 15 minutes.</p>
<p><a href="${magicLink}">${magicLink}</a></p>
<p>If you didn't request this, you can safely ignore this email.</p>`,
        }),
    });

    if (!response.ok) {
        const error = await response.json() as { error?: string };
        throw new Error(error?.error ?? `Email service returned ${response.status}`);
    }
}
