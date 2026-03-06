// ─────────────────────────────────────────────────────────────
// email.mjs — Email sending service for verification & password reset
// ─────────────────────────────────────────────────────────────

import nodemailer from 'nodemailer';

const EMAIL_USER = process.env.EMAIL_USER || '';
const EMAIL_PASS = process.env.EMAIL_PASS || '';

// Create transporter (Gmail SMTP) — falls back to console logging if creds missing
let transporter = null;
if (EMAIL_USER && EMAIL_PASS) {
    transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: EMAIL_USER,
            pass: EMAIL_PASS,
        },
    });
    console.log(`📧 Email service configured for ${EMAIL_USER}`);
} else {
    console.log('⚠ Email credentials not set (EMAIL_USER/EMAIL_PASS). Emails will be logged to console only.');
}

// ─── Helpers ─────────────────────────────────────────────────

async function sendEmail(to, subject, html) {
    if (!transporter) {
        console.log(`📧 [DEV EMAIL] To: ${to}`);
        console.log(`📧 [DEV EMAIL] Subject: ${subject}`);
        console.log(`📧 [DEV EMAIL] Body: ${html.replace(/<[^>]*>/g, '')}`);
        return { dev: true };
    }
    const info = await transporter.sendMail({
        from: `"Battle Among Regions" <${EMAIL_USER}>`,
        to,
        subject,
        html,
    });
    console.log(`📧 Email sent to ${to}: ${info.messageId}`);
    return info;
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Send a 6-digit email verification code.
 * @param {string} email
 * @param {string} code - 6-digit verification code
 * @param {string} displayName
 */
export async function sendVerificationEmail(email, code, displayName) {
    const subject = 'Verify your Battle Among Regions account';
    const html = `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#1a1a2e;color:#e0e0e0;border-radius:12px;overflow:hidden;">
            <div style="background:linear-gradient(135deg,#c9a04c,#8b6914);padding:24px;text-align:center;">
                <h1 style="margin:0;font-size:22px;color:#1a1a2e;">⚔ Battle Among Regions</h1>
            </div>
            <div style="padding:24px;">
                <p>Welcome, <strong>${displayName}</strong>!</p>
                <p>Your verification code is:</p>
                <div style="text-align:center;margin:20px 0;">
                    <span style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#c9a04c;background:#0d0d1a;padding:12px 24px;border-radius:8px;display:inline-block;">
                        ${code}
                    </span>
                </div>
                <p style="color:#999;font-size:13px;">This code expires in 30 minutes. If you didn't create this account, you can safely ignore this email.</p>
            </div>
        </div>
    `;
    return sendEmail(email, subject, html);
}

/**
 * Send a password reset code.
 * @param {string} email
 * @param {string} code - 6-digit reset code
 * @param {string} displayName
 */
export async function sendPasswordResetEmail(email, code, displayName) {
    const subject = 'Reset your Battle Among Regions password';
    const html = `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#1a1a2e;color:#e0e0e0;border-radius:12px;overflow:hidden;">
            <div style="background:linear-gradient(135deg,#c9a04c,#8b6914);padding:24px;text-align:center;">
                <h1 style="margin:0;font-size:22px;color:#1a1a2e;">⚔ Battle Among Regions</h1>
            </div>
            <div style="padding:24px;">
                <p>Hi <strong>${displayName}</strong>,</p>
                <p>We received a request to reset your password. Your reset code is:</p>
                <div style="text-align:center;margin:20px 0;">
                    <span style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#c9a04c;background:#0d0d1a;padding:12px 24px;border-radius:8px;display:inline-block;">
                        ${code}
                    </span>
                </div>
                <p style="color:#999;font-size:13px;">This code expires in 30 minutes. If you didn't request this, you can safely ignore this email.</p>
            </div>
        </div>
    `;
    return sendEmail(email, subject, html);
}
