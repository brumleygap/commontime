function he(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function sendFinalizationEmail(
    emailBinding: Fetcher,
    to: string,
    pollTitle: string,
    pollDescription: string | null,
    chosenDatetime: string,
    pollUrl: string,
    calendarUrl: string,
) {
    const d = new Date(chosenDatetime);
    const displayDate =
        d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) +
        " · " +
        d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

    const descText = pollDescription ? `\n\n${pollDescription}` : "";
    const descHtml = pollDescription
        ? `<p style="font-style:italic;color:#555;margin:0 0 16px">${he(pollDescription)}</p>`
        : "";

    const response = await emailBinding.fetch("https://commontime-email-sender/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            to,
            from: { email: "hello@commontime.app", name: "CommonTime" },
            subject: `It's happening: ${pollTitle}`,
            text: `Great news — a date has been confirmed for "${pollTitle}".${descText}\n\n${displayDate}\n\nAdd to your calendar:\n${calendarUrl}\n\nView the poll:\n${pollUrl}\n\nSee you there!`,
            html: `<p>Great news — a date has been confirmed.</p>
<h2 style="font-family:Georgia,serif;margin:0 0 8px">${he(pollTitle)}</h2>
${descHtml}<p style="font-size:18px;font-weight:bold;margin:0 0 16px">${displayDate}</p>
<p style="margin:0 0 8px"><a href="${calendarUrl}" style="color:#c8102e;font-weight:bold">Add to calendar →</a></p>
<p style="margin:0 0 16px"><a href="${pollUrl}" style="color:#888;font-size:13px">View poll</a></p>
<p style="color:#888;font-size:12px">CommonTime helps groups find a time that works for everyone.</p>`,
        }),
    });

    if (!response.ok) {
        const error = await response.json() as { error?: string };
        throw new Error(error?.error ?? `Email service returned ${response.status}`);
    }
}

export async function sendReopenEmail(
    emailBinding: Fetcher,
    to: string,
    pollTitle: string,
    pollUrl: string,
) {
    const response = await emailBinding.fetch("https://commontime-email-sender/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            to,
            from: { email: "hello@commontime.app", name: "CommonTime" },
            subject: `Voting re-opened: ${pollTitle}`,
            text: `The organiser has re-opened voting for "${pollTitle}". Head back to the poll to update your availability.\n\n${pollUrl}`,
            html: `<p>The organiser has re-opened voting for this poll.</p>
<h2 style="font-family:Georgia,serif;margin:0 0 16px">${he(pollTitle)}</h2>
<p><a href="${pollUrl}" style="color:#c8102e;font-weight:bold">Update your availability →</a></p>
<p style="color:#888;font-size:12px">CommonTime helps groups find a time that works for everyone.</p>`,
        }),
    });

    if (!response.ok) {
        const error = await response.json() as { error?: string };
        throw new Error(error?.error ?? `Email service returned ${response.status}`);
    }
}

export async function sendPollInviteEmail(
    emailBinding: Fetcher,
    to: string,
    inviteeName: string,
    pollTitle: string,
    pollDescription: string | null,
    pollUrl: string,
    inviterEmail: string,
) {
    const descText = pollDescription ? `\n\n${pollDescription}` : "";
    const descHtml = pollDescription
        ? `<p style="font-size:14px;color:#555;font-style:italic;line-height:1.4;margin:0 0 16px">${he(pollDescription)}</p>`
        : "";

    const response = await emailBinding.fetch("https://commontime-email-sender/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            to,
            from: { email: "hello@commontime.app", name: "CommonTime" },
            replyTo: creatorEmail,
            subject: `You're invited: ${pollTitle}`,
            text: `${inviterEmail} has invited you to respond to a scheduling poll.\n\nPoll: ${pollTitle}${descText}\n\n${pollUrl}\n\nClick the link to see the options and mark your availability.`,
            html: `<p><strong>${inviterEmail}</strong> has invited you to respond to a scheduling poll.</p>
<h2 style="font-family:Georgia,serif;margin:0 0 8px">${he(pollTitle)}</h2>
${descHtml}<p><a href="${pollUrl}" style="color:#c8102e">View poll and mark your availability →</a></p>
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
