export async function sendMagicLinkEmail(
    emailBinding: SendEmail,
    to: string,
    magicLink: string,
) {
    await emailBinding.send({
        to,
        from: { email: "hello@commontime.app", name: "CommonTime" },
        subject: "Your CommonTime login link",
        text: `Click this link to log in. It expires in 15 minutes.\n\n${magicLink}\n\nIf you didn't request this, ignore this email.`,
        html: `<p>Click the link below to log in to CommonTime. It expires in 15 minutes.</p>
<p><a href="${magicLink}">${magicLink}</a></p>
<p>If you didn't request this, you can safely ignore this email.</p>`,
    });
}
