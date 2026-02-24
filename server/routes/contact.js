import { Router } from 'express';
import nodemailer from 'nodemailer';
import dns from 'dns';

// Force IPv4 DNS resolution — Railway can't reach Gmail over IPv6
dns.setDefaultResultOrder('ipv4first');

const router = Router();

const RECIPIENT = 'tickrview@gmail.com';

// Configure transporter — uses Gmail SMTP with App Password
// Set GMAIL_USER and GMAIL_APP_PASSWORD in your .env file
const transporter = process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD
  ? nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    })
  : null;

// Rate limiting: max 3 submissions per IP per hour
const rateMap = new Map();
const RATE_LIMIT = 3;
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW) {
    rateMap.set(ip, { start: now, count: 1 });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// Clean up old entries every 30 min
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateMap) {
    if (now - entry.start > RATE_WINDOW) rateMap.delete(ip);
  }
}, 30 * 60 * 1000);

router.post('/', async (req, res) => {
  const { name, email, message } = req.body;

  // Validate
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (name.length > 100 || email.length > 200 || message.length > 5000) {
    return res.status(400).json({ error: 'Input too long.' });
  }
  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }

  // Rate limit
  const ip = req.ip || req.connection.remoteAddress;
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many submissions. Please try again later.' });
  }

  if (!transporter) {
    console.log('[contact] Email not configured. Message from:', name, email);
    console.log('[contact] Message:', message);
    return res.json({ success: true, note: 'Message logged (email not configured).' });
  }

  try {
    await transporter.sendMail({
      from: `"TickrView Contact" <${process.env.GMAIL_USER}>`,
      to: RECIPIENT,
      replyTo: email,
      subject: `TickrView Contact: ${name}`,
      text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px;">
          <h2 style="color: #00c853;">TickrView Contact Form</h2>
          <p><strong>From:</strong> ${name} (${email})</p>
          <hr style="border: 1px solid #333;" />
          <p style="white-space: pre-wrap;">${message}</p>
        </div>
      `,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[contact] Failed to send email:', err.message);
    res.status(500).json({ error: 'Failed to send message. Please try again.' });
  }
});

export default router;
