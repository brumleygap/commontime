function he(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function sendFinalizationEmail(
    emailBinding: Fetcher,
    to: string,
    pollTitle: string,
    pollDescription: string | null,
    chosenDatetimes: string[],
    pollUrl: string,
    calendarUrl: string,
) {
    const fmt = (dt: string) => {
        const d = new Date(dt);
        return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) +
            " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    };

    const isMulti = chosenDatetimes.length > 1;
    const displayDates = chosenDatetimes.map(fmt);
    const displayDatesHtml = displayDates.map(he);

    const descText = pollDescription ? `\n\n${pollDescription}` : "";
    const descHtml = pollDescription
        ? `<p style="font-style:italic;color:#555;margin:0 0 16px">${he(pollDescription)}</p>`
        : "";

    const subject = isMulti ? `Dates confirmed: ${pollTitle}` : `It's happening: ${pollTitle}`;

    const textBody = isMulti
        ? `Great news — ${chosenDatetimes.length} dates have been confirmed for "${pollTitle}".${descText}\n\n${displayDates.map(d => `  • ${d}`).join("\n")}\n\nAdd all to your calendar:\n${calendarUrl}\n\nView the poll:\n${pollUrl}`
        : `Great news — a date has been confirmed for "${pollTitle}".${descText}\n\n${displayDates[0]}\n\nAdd to your calendar:\n${calendarUrl}\n\nView the poll:\n${pollUrl}\n\nSee you there!`;

    const datesHtml = isMulti
        ? `<ul style="margin:0 0 16px;padding-left:20px">${displayDatesHtml.map(d => `<li style="margin-bottom:6px;font-size:16px;font-weight:bold">${d}</li>`).join("")}</ul>`
        : `<p style="font-size:18px;font-weight:bold;margin:0 0 16px">${displayDatesHtml[0]}</p>`;

    const calLabel = isMulti ? "Add all to calendar →" : "Add to calendar →";

    const response = await emailBinding.fetch("https://commontime-email-sender/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            to,
            from: { email: "hello@commontime.app", name: "CommonTime" },
            subject,
            text: textBody,
            html: `<p>${isMulti ? `Great news — ${chosenDatetimes.length} dates have been confirmed.` : "Great news — a date has been confirmed."}</p>
<h2 style="font-family:Georgia,serif;margin:0 0 8px">${he(pollTitle)}</h2>
${descHtml}${datesHtml}<p style="margin:0 0 8px"><a href="${calendarUrl}" style="color:#c8102e;font-weight:bold">${calLabel}</a></p>
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
    inviteUrl: string,
    creatorName: string,
    creatorEmail: string,
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
            text: `Hello, ${inviteeName}. ${creatorName} has invited you to help find a time for "${pollTitle}".${descText}\n\nClick below to see the options and mark your availability:\n\n${inviteUrl}\n\nThis link signs you in automatically.`,
            html: `<p>Hello, <strong>${he(inviteeName)}</strong>.</p>
<p><strong>${he(creatorName)}</strong> has invited you to help find a time for this event:</p>
<h2 style="font-family:Georgia,serif;margin:8px 0 8px">${he(pollTitle)}</h2>
${descHtml}<p><a href="${inviteUrl}" style="color:#c8102e;font-weight:bold">View poll and mark your availability →</a></p>
<p style="color:#888;font-size:12px">This link signs you in automatically. CommonTime helps groups find a time that works for everyone.</p>`,
        }),
    });

    if (!response.ok) {
        const error = await response.json() as { error?: string };
        throw new Error(error?.error ?? `Email service returned ${response.status}`);
    }
}

export async function sendCancellationEmail(
    emailBinding: Fetcher,
    to: string,
    pollTitle: string,
    pollUrl: string,
    organizerEmail: string,
) {
    const response = await emailBinding.fetch("https://commontime-email-sender/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            to,
            from: { email: "hello@commontime.app", name: "CommonTime" },
            replyTo: organizerEmail,
            subject: `Cancelled: ${pollTitle}`,
            text: `The organiser has cancelled "${pollTitle}". If you have questions, reply to this email.\n\nView poll:\n${pollUrl}`,
            html: `<p>The organiser has cancelled this event.</p>
<h2 style="font-family:Georgia,serif;margin:0 0 16px">${he(pollTitle)}</h2>
<p style="color:#888;font-size:13px">If you have questions, reply to this email.</p>
<p style="margin:0 0 16px"><a href="${pollUrl}" style="color:#888;font-size:13px">View poll</a></p>
<p style="color:#888;font-size:12px">CommonTime helps groups find a time that works for everyone.</p>`,
        }),
    });

    if (!response.ok) {
        const error = await response.json() as { error?: string };
        throw new Error(error?.error ?? `Email service returned ${response.status}`);
    }
}

export async function sendRescheduleEmail(
    emailBinding: Fetcher,
    to: string,
    pollTitle: string,
    newPollUrl: string,
    organizerEmail: string,
) {
    const response = await emailBinding.fetch("https://commontime-email-sender/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            to,
            from: { email: "hello@commontime.app", name: "CommonTime" },
            replyTo: organizerEmail,
            subject: `New dates: ${pollTitle}`,
            text: `The organiser has cancelled "${pollTitle}" and started a new poll with new date options. Head over to vote on the new options.\n\n${newPollUrl}`,
            html: `<p>The organiser has cancelled this event and started a new poll with new date options.</p>
<h2 style="font-family:Georgia,serif;margin:0 0 16px">${he(pollTitle)}</h2>
<p><a href="${newPollUrl}" style="color:#c8102e;font-weight:bold">Vote on new dates →</a></p>
<p style="color:#888;font-size:12px">CommonTime helps groups find a time that works for everyone.</p>`,
        }),
    });

    if (!response.ok) {
        const error = await response.json() as { error?: string };
        throw new Error(error?.error ?? `Email service returned ${response.status}`);
    }
}

export async function sendReminderEmail(
    emailBinding: Fetcher,
    to: string,
    recipientName: string,
    pollTitle: string,
    pollDescription: string | null,
    optionDatetimes: string[],
    durationMinutes: number,
    inviteUrl: string,
    organizerName: string,
    organizerEmail: string,
) {
    const fmtOption = (dt: string) => {
        const start = new Date(dt);
        const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
        const fmtDate = start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
        const fmtT = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
        return `${fmtDate} · ${fmtT(start)} – ${fmtT(end)}`;
    };

    const formattedOptions = optionDatetimes.map(fmtOption);

    const descText = pollDescription ? `\n\n${pollDescription}` : "";
    const descHtml = pollDescription
        ? `<p style="font-size:14px;color:#555;font-style:italic;margin:0 0 16px">${he(pollDescription)}</p>`
        : "";

    const optionsText = formattedOptions.map(d => `  • ${d}`).join("\n");
    const optionsHtml = formattedOptions
        .map(d => `<li style="margin-bottom:6px">${he(d)}</li>`)
        .join("");

    const textBody = [
        `Hi ${recipientName},`,
        ``,
        `${organizerName} is waiting for your response on "${pollTitle}".${descText}`,
        ``,
        `We're looking at these times:`,
        ``,
        optionsText,
        ``,
        `Mark your availability:`,
        inviteUrl,
        ``,
        `This link signs you in automatically.`,
    ].join("\n");

    const htmlBody = `<p>Hi <strong>${he(recipientName)}</strong>,</p>
<p><strong>${he(organizerName)}</strong> is waiting for your response on this event:</p>
<h2 style="font-family:Georgia,serif;margin:8px 0 8px">${he(pollTitle)}</h2>
${descHtml}<p style="margin:0 0 8px;font-size:14px;color:#555">We're looking at these times:</p>
<ul style="margin:0 0 16px;padding-left:20px;font-size:15px">${optionsHtml}</ul>
<p style="margin:0 0 16px"><a href="${inviteUrl}" style="color:#c8102e;font-weight:bold">Mark your availability →</a></p>
<p style="color:#888;font-size:12px">This link signs you in automatically. CommonTime helps groups find a time that works for everyone.</p>`;

    const response = await emailBinding.fetch("https://commontime-email-sender/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            to,
            from: { email: "hello@commontime.app", name: "CommonTime" },
            replyTo: organizerEmail,
            subject: `Reminder: ${pollTitle}`,
            text: textBody,
            html: htmlBody,
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
