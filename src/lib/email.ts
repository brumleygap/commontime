function he(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Table-based email wrapper — renders consistently across Gmail, Apple Mail, Outlook
function wrap(body: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
</head>
<body style="margin:0;padding:0;background:#f5f2ec;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f2ec" style="background:#f5f2ec;padding:32px 0;">
<tr><td align="center" style="padding:0 16px;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

  <!-- Wordmark header -->
  <tr>
    <td bgcolor="#0f0f0e" style="background:#0f0f0e;padding:20px 32px;">
      <span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:bold;color:#f5f2ec;letter-spacing:-0.3px;">Common</span><span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:bold;color:#e8392a;letter-spacing:-0.3px;font-style:italic;">Time</span>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td bgcolor="#ffffff" style="background:#ffffff;padding:32px;border-left:1px solid #d4cfc6;border-right:1px solid #d4cfc6;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#0f0f0e;line-height:1.6;">
      ${body}
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td bgcolor="#f5f2ec" style="background:#f5f2ec;padding:16px 32px;border:1px solid #d4cfc6;border-top:none;">
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#999;line-height:1.6;">
        You received this because you are invited to a CommonTime scheduling poll.<br>
        Questions? Reply to this email to reach the organizer directly.
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// Table-based CTA button — background color renders in Outlook unlike CSS buttons
function btn(url: string, label: string): string {
    return `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;">
  <tr>
    <td bgcolor="#c8102e" style="background:#c8102e;padding:13px 24px;">
      <a href="${url}" style="color:#ffffff;font-weight:bold;text-decoration:none;font-size:15px;font-family:Arial,Helvetica,sans-serif;white-space:nowrap;display:block;">${label}</a>
    </td>
  </tr>
</table>`;
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
        ? `<p style="font-size:14px;color:#555;font-style:italic;margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;">${he(pollDescription)}</p>`
        : "";

    const subject = isMulti ? `Dates confirmed: ${pollTitle}` : `It's happening: ${pollTitle}`;

    const textBody = isMulti
        ? `Great news — ${chosenDatetimes.length} dates have been confirmed for "${pollTitle}".${descText}\n\n${displayDates.map(d => `  • ${d}`).join("\n")}\n\nAdd all to your calendar:\n${calendarUrl}\n\nView the poll:\n${pollUrl}`
        : `Great news — a date has been confirmed for "${pollTitle}".${descText}\n\n${displayDates[0]}\n\nAdd to your calendar:\n${calendarUrl}\n\nView the poll:\n${pollUrl}`;

    const datesHtml = isMulti
        ? `<ul style="margin:0 0 24px;padding-left:20px;">${displayDatesHtml.map(d => `<li style="margin-bottom:8px;font-size:16px;font-weight:bold;font-family:Arial,Helvetica,sans-serif;">${d}</li>`).join("")}</ul>`
        : `<p style="font-size:18px;font-weight:bold;margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;">${displayDatesHtml[0]}</p>`;

    const calLabel = isMulti ? "Add all to calendar →" : "Add to calendar →";

    const htmlBody = `<p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;">Great news — It's happening!</p>
<h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;margin:0 0 8px;color:#0f0f0e;">${he(pollTitle)}</h2>
${descHtml}<p style="margin:0 0 16px;font-size:14px;color:#555;font-family:Arial,Helvetica,sans-serif;">${isMulti ? "Here are the dates and times:" : "Here's the date and time:"}</p>
${datesHtml}${btn(calendarUrl, calLabel)}
<p style="margin:16px 0 0;"><a href="${pollUrl}" style="color:#999;font-size:13px;font-family:Arial,Helvetica,sans-serif;text-decoration:none;">View poll →</a></p>`;

    const response = await emailBinding.fetch("https://commontime-email-sender/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            to,
            from: { email: "hello@commontime.app", name: "CommonTime" },
            subject,
            text: textBody,
            html: wrap(htmlBody),
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
    pollDescription: string | null,
    pollUrl: string,
) {
    const descHtml = pollDescription
        ? `<p style="font-size:14px;color:#555;font-style:italic;margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;">${he(pollDescription)}</p>`
        : "";

    const textBody = `The organiser has re-opened voting for "${pollTitle}". Head back to the poll to update your availability.\n\n${pollUrl}`;

    const htmlBody = `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;">The organizer has re-opened voting on:</p>
<h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;margin:0 0 8px;color:#0f0f0e;">${he(pollTitle)}</h2>
${descHtml}${btn(pollUrl, "Update your availability →")}`;

    const response = await emailBinding.fetch("https://commontime-email-sender/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            to,
            from: { email: "hello@commontime.app", name: "CommonTime" },
            subject: `Voting re-opened: ${pollTitle}`,
            text: textBody,
            html: wrap(htmlBody),
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
        ? `<p style="font-size:14px;color:#555;font-style:italic;margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;">${he(pollDescription)}</p>`
        : "";

    const textBody = `Hi ${inviteeName},\n\n${creatorName} has invited you to help find a time for "${pollTitle}".${descText}\n\nMark your availability:\n${inviteUrl}\n\nThis link signs you in automatically.`;

    const htmlBody = `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;">Hi <strong>${he(inviteeName)}</strong>,</p>
<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;"><strong>${he(creatorName)}</strong> has invited you to help find a time for:</p>
<h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;margin:0 0 8px;color:#0f0f0e;">${he(pollTitle)}</h2>
${descHtml}${btn(inviteUrl, "Mark your availability →")}
<p style="margin:16px 0 0;font-size:12px;color:#999;font-family:Arial,Helvetica,sans-serif;">This link signs you in automatically.</p>`;

    const response = await emailBinding.fetch("https://commontime-email-sender/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            to,
            from: { email: "hello@commontime.app", name: "CommonTime" },
            replyTo: creatorEmail,
            subject: `You're invited: ${pollTitle}`,
            text: textBody,
            html: wrap(htmlBody),
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
    pollDescription: string | null,
    pollUrl: string,
    organizerEmail: string,
) {
    const descHtml = pollDescription
        ? `<p style="font-size:14px;color:#555;font-style:italic;margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;">${he(pollDescription)}</p>`
        : "";

    const textBody = `The organiser has cancelled "${pollTitle}". If you have questions, reply to this email.\n\nView poll:\n${pollUrl}`;

    const htmlBody = `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;">The organizer has cancelled:</p>
<h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;margin:0 0 8px;color:#0f0f0e;">${he(pollTitle)}</h2>
${descHtml}<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#999;">If you have questions, reply to this email.</p>
<p style="margin:8px 0 0;"><a href="${pollUrl}" style="color:#999;font-size:13px;font-family:Arial,Helvetica,sans-serif;text-decoration:none;">View poll →</a></p>`;

    const response = await emailBinding.fetch("https://commontime-email-sender/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            to,
            from: { email: "hello@commontime.app", name: "CommonTime" },
            replyTo: organizerEmail,
            subject: `Cancelled: ${pollTitle}`,
            text: textBody,
            html: wrap(htmlBody),
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
    pollDescription: string | null,
    newPollUrl: string,
    organizerEmail: string,
) {
    const descHtml = pollDescription
        ? `<p style="font-size:14px;color:#555;font-style:italic;margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;">${he(pollDescription)}</p>`
        : "";

    const textBody = `The organiser has moved "${pollTitle}" to new dates. Head over to vote on the new options.\n\n${newPollUrl}`;

    const htmlBody = `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;">The organizer has added more choices:</p>
<h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;margin:0 0 8px;color:#0f0f0e;">${he(pollTitle)}</h2>
${descHtml}<p style="margin:0 0 24px;font-size:14px;color:#555;font-family:Arial,Helvetica,sans-serif;">New dates are available — please vote again.</p>
${btn(newPollUrl, "Vote on new dates →")}`;

    const response = await emailBinding.fetch("https://commontime-email-sender/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            to,
            from: { email: "hello@commontime.app", name: "CommonTime" },
            replyTo: organizerEmail,
            subject: `New dates: ${pollTitle}`,
            text: textBody,
            html: wrap(htmlBody),
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
        ? `<p style="font-size:14px;color:#555;font-style:italic;margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;">${he(pollDescription)}</p>`
        : "";

    const optionsText = formattedOptions.map(d => `  • ${d}`).join("\n");
    const optionsHtml = formattedOptions
        .map(d => `<li style="margin-bottom:6px;font-family:Arial,Helvetica,sans-serif;">${he(d)}</li>`)
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

    const htmlBody = `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;">Hi <strong>${he(recipientName)}</strong>,</p>
<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;"><strong>${he(organizerName)}</strong> is waiting for your response on:</p>
<h3 style="font-family:Georgia,'Times New Roman',serif;font-size:17px;margin:0 0 8px;color:#0f0f0e;">${he(pollTitle)}</h3>
${descHtml}<p style="margin:0 0 8px;font-size:14px;color:#555;font-family:Arial,Helvetica,sans-serif;">We're looking at these times:</p>
<ul style="margin:0 0 24px;padding-left:20px;font-size:15px;">${optionsHtml}</ul>
${btn(inviteUrl, "Mark your availability →")}
<p style="margin:16px 0 0;font-size:12px;color:#999;font-family:Arial,Helvetica,sans-serif;">This link signs you in automatically.</p>`;

    const response = await emailBinding.fetch("https://commontime-email-sender/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            to,
            cc: organizerEmail,
            from: { email: "hello@commontime.app", name: "CommonTime" },
            replyTo: organizerEmail,
            subject: `Reminder: ${pollTitle}`,
            text: textBody,
            html: wrap(htmlBody),
        }),
    });

    if (!response.ok) {
        const error = await response.json() as { error?: string };
        throw new Error(error?.error ?? `Email service returned ${response.status}`);
    }
}

export async function sendPollEditedEmail(
    emailBinding: Fetcher,
    to: string,
    pollTitle: string,
    pollDescription: string | null,
    pollUrl: string,
    organizerEmail: string,
) {
    const descHtml = pollDescription
        ? `<p style="font-size:14px;color:#555;font-style:italic;margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;">${he(pollDescription)}</p>`
        : "";

    const textBody = `The organizer has updated the date options for "${pollTitle}". Check the poll to review the new times.\n\n${pollUrl}`;

    const htmlBody = `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;">The organizer has updated the date options for:</p>
<h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;margin:0 0 8px;color:#0f0f0e;">${he(pollTitle)}</h2>
${descHtml}${btn(pollUrl, "Review the updated times →")}`;

    const response = await emailBinding.fetch("https://commontime-email-sender/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            to,
            from: { email: "hello@commontime.app", name: "CommonTime" },
            replyTo: organizerEmail,
            subject: `Updated: ${pollTitle}`,
            text: textBody,
            html: wrap(htmlBody),
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
    const textBody = `Click this link to log in to CommonTime. It expires in 15 minutes.\n\n${magicLink}\n\nIf you didn't request this, ignore this email.`;

    const htmlBody = `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;">Click below to log in to CommonTime so we can find a time to meet. This link expires in 15 minutes.</p>
${btn(magicLink, "Log in to CommonTime →")}
<p style="margin:16px 0 0;font-size:12px;color:#999;font-family:Arial,Helvetica,sans-serif;">If you didn't request this, you can safely ignore this email.</p>`;

    const response = await emailBinding.fetch("https://commontime-email-sender/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            to,
            from: { email: "hello@commontime.app", name: "CommonTime" },
            subject: "Your CommonTime login link",
            text: textBody,
            html: wrap(htmlBody),
        }),
    });

    if (!response.ok) {
        const error = await response.json() as { error?: string };
        throw new Error(error?.error ?? `Email service returned ${response.status}`);
    }
}
