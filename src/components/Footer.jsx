import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useScrollLock } from "../hooks/useScrollLock.js";

function LegalModal({ title, onClose, children }) {
  return (
    <div className="contact-overlay" onClick={onClose}>
      <div
        className="contact-modal legal-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="contact-modal-header">
          <h2 className="contact-modal-title">{title}</h2>
          <button className="contact-modal-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="legal-modal-body">{children}</div>
      </div>
    </div>
  );
}

function PrivacyModal({ onClose }) {
  return (
    <LegalModal title="Privacy Policy" onClose={onClose}>
      <p className="legal-updated">Last updated: February 2026</p>

      <h3>Overview</h3>
      <p>
        TickrView is a financial data aggregation tool that displays publicly
        available market information. We are committed to protecting your
        privacy and being transparent about our data practices.
      </p>

      <h3>Information We Collect</h3>
      <p>
        <strong>Account Data:</strong> If you create an account, we collect your
        email address and a hashed password through our authentication provider
        (Supabase). Registered users may also store favorites, price alerts, and
        stock notes — this data is stored securely in our cloud database and
        associated with your account so it can sync across devices.
      </p>
      <p>
        <strong>Local Storage:</strong> TickrView stores preferences (selected
        tab, sidebar state, theme, recently viewed stocks, and timeframe
        settings) locally on your device using browser localStorage. This data
        never leaves your device.
      </p>
      <p>
        <strong>Contact Form:</strong> If you choose to contact us, we collect
        only the information you voluntarily provide (name, email, and message).
        This information is used solely to respond to your inquiry and is not
        shared with third parties.
      </p>
      <p>
        <strong>Server Logs:</strong> Our servers may automatically log standard
        request information (IP address, browser type, pages visited,
        timestamps) for security and maintenance purposes. These logs are not
        used for tracking or profiling and are periodically deleted.
      </p>

      <h3>Information We Do Not Collect</h3>
      <p>
        We do not sell personal information. We do not use tracking cookies,
        third-party analytics, advertising trackers, or fingerprinting
        technologies. We do not create behavioral profiles or track your
        browsing across other websites. We do not collect financial information,
        brokerage credentials, trading data, or investment details from users.
      </p>

      <h3>Third-Party Data Sources</h3>
      <p>
        Market data displayed on TickrView is sourced from multiple third-party
        providers. When you use TickrView, your browser makes requests to our
        server, which then fetches data from these providers on your behalf.{" "}
        <strong>
          We do not share any of your personal information with these data
          providers.
        </strong>{" "}
        The third-party services we use include:
      </p>
      <ul>
        <li>
          <strong>Yahoo Finance</strong> — Stock quotes, OHLC chart data,
          company statistics, options data, earnings data, crypto prices, and
          news articles.
        </li>
        <li>
          <strong>TradingView</strong> — Stock screener filters, economic
          calendar events, and extended-hours movers scanning.
        </li>
        <li>
          <strong>Finnhub</strong> — Insider trading data (SEC Form 4 filings)
          and earnings calendar information.
        </li>
        <li>
          <strong>Quiver Quantitative</strong> — Congressional trading
          disclosures, government contracts, lobbying data, and dark pool
          volume.
        </li>
        <li>
          <strong>ApeWisdom</strong> — Reddit mention counts and sentiment data
          from WallStreetBets, r/stocks, and r/investing.
        </li>
        <li>
          <strong>Coinbase</strong> — Cryptocurrency OHLC price data for
          detailed crypto charts.
        </li>
        <li>
          <strong>FINRA</strong> — Short interest data and off-exchange (dark
          pool) trading volume.
        </li>
        <li>
          <strong>RSS News Feeds</strong> — Market headlines from CNBC,
          Bloomberg, MarketWatch, and Google News for the news feed and AI
          digest.
        </li>
      </ul>
      <p>
        Please review the privacy policies of these third-party services for
        information about their own data practices.
      </p>

      <h3>AI-Generated Content</h3>
      <p>
        The Daily Digest feature uses the Anthropic Claude API to generate
        AI-powered market summaries from publicly available news headlines. Only
        news article titles and publisher names are sent to the API — no user
        data, personal information, or browsing history is included in these
        requests. The AI processes headlines and returns a market summary; no
        user-identifiable information is transmitted or stored by the AI
        provider.
      </p>

      <h3>Authentication & Cloud Storage</h3>
      <p>
        User authentication is provided by <strong>Supabase</strong>, a
        third-party backend service. If you create an account, your email,
        hashed password, favorites list, price alerts, and stock notes are
        stored in a Supabase-hosted PostgreSQL database. All data is transmitted
        over HTTPS/TLS encryption. You can delete your account and all
        associated data at any time by contacting us. If you choose not to
        create an account, no personal data is stored on our servers.
      </p>

      <h3>Data Security</h3>
      <p>
        We take reasonable measures to protect information transmitted to us.
        All communication with our servers uses HTTPS/TLS encryption.
        Authentication tokens are handled securely and never stored in cookies.
        Since we minimize data collection, the risk of data exposure is
        inherently limited. However, no method of transmission over the Internet
        is 100% secure, and we cannot guarantee absolute security.
      </p>

      <h3>Data Retention</h3>
      <p>
        Contact form submissions are retained only as long as necessary to
        respond to your inquiry. Server logs are retained for a maximum of 30
        days. Account data (favorites, alerts, notes) is retained as long as
        your account exists — you may request deletion at any time. localStorage
        data is stored on your device until you clear it.
      </p>

      <h3>Your Rights (GDPR — European Users)</h3>
      <p>
        If you are located in the European Economic Area (EEA) or United
        Kingdom, you have rights under the General Data Protection Regulation
        (GDPR), including:
      </p>
      <ul>
        <li>
          <strong>Right to Access:</strong> You may request a copy of any
          personal data we hold about you.
        </li>
        <li>
          <strong>Right to Rectification:</strong> You may request correction of
          inaccurate data.
        </li>
        <li>
          <strong>Right to Erasure:</strong> You may request deletion of your
          personal data.
        </li>
        <li>
          <strong>Right to Restrict Processing:</strong> You may request we
          limit how we use your data.
        </li>
        <li>
          <strong>Right to Data Portability:</strong> You may request your data
          in a portable format.
        </li>
        <li>
          <strong>Right to Object:</strong> You may object to processing of your
          personal data.
        </li>
      </ul>
      <p>
        To exercise any of these rights, please contact us through the Contact
        form. We will respond within 30 days as required by the GDPR.
      </p>
      <p>
        <strong>Legal Basis for Processing:</strong> We process data based on
        your consent (account creation, contact form submissions) and our
        legitimate interest in maintaining site security (server logs).
      </p>

      <h3>Your Rights (CCPA — California Users)</h3>
      <p>
        If you are a California resident, you have rights under the California
        Consumer Privacy Act (CCPA), including:
      </p>
      <ul>
        <li>
          <strong>Right to Know:</strong> You may request what personal
          information we collect, use, or disclose.
        </li>
        <li>
          <strong>Right to Delete:</strong> You may request deletion of your
          personal information.
        </li>
        <li>
          <strong>Right to Opt-Out:</strong> You have the right to opt out of
          the sale of your personal information.
        </li>
        <li>
          <strong>Right to Non-Discrimination:</strong> We will not discriminate
          against you for exercising your CCPA rights.
        </li>
      </ul>
      <p>
        <strong>
          We do not sell, rent, or share your personal information
        </strong>{" "}
        with third parties for monetary or other valuable consideration. We have
        not sold personal information in the preceding 12 months.
      </p>

      <h3>Local Storage & Cookies</h3>
      <p>
        TickrView uses browser localStorage to save your preferences (theme,
        tab selection, recently viewed stocks, consent acknowledgment). This is
        not a cookie and does not track you across websites. You can clear this
        data at any time through your browser settings. We do not use any
        tracking cookies or similar technologies.
      </p>

      <h3>Children's Privacy</h3>
      <p>
        TickrView is not directed at children under 13 (or 16 in the EEA). We
        do not knowingly collect information from children. If we become aware
        that we have collected data from a child, we will promptly delete it.
      </p>

      <h3>International Users</h3>
      <p>
        TickrView is operated from the United States. If you access the service
        from outside the U.S., your information may be transferred to and
        processed in the U.S., where data protection laws may differ from those
        in your jurisdiction.
      </p>

      <h3>Changes to This Policy</h3>
      <p>
        We may update this privacy policy from time to time. Changes will be
        reflected by updating the date at the top of this policy. Continued use
        of the site after changes constitutes acceptance of the updated policy.
      </p>

      <h3>Contact</h3>
      <p>
        If you have questions about this privacy policy or wish to exercise your
        data rights, please reach out through our Contact form.
      </p>
    </LegalModal>
  );
}

function TermsModal({ onClose }) {
  return (
    <LegalModal title="Terms of Service & Disclaimer" onClose={onClose}>
      <p className="legal-updated">Last updated: February 2026</p>

      <h3>Acceptance of Terms</h3>
      <p>
        By accessing and using TickrView, you agree to these terms. If you do
        not agree with any part of these terms, please discontinue use of the
        service.
      </p>

      <h3>Not Financial Advice</h3>
      <p>
        <strong>
          TickrView is for informational and educational purposes only.
        </strong>{" "}
        Nothing on this website constitutes financial advice, investment advice,
        trading advice, or any other form of professional advice. You should not
        make any investment decision based solely on information provided by
        TickrView. Always consult with a qualified financial advisor before
        making investment decisions.
      </p>

      <h3>Data Accuracy Disclaimer</h3>
      <p>
        Market data, stock quotes, charts, financial statistics, and other
        information displayed on TickrView are sourced from third-party
        providers and may be delayed, inaccurate, or incomplete.{" "}
        <strong>
          We do not guarantee the accuracy, completeness, timeliness, or
          reliability of any data displayed.
        </strong>{" "}
        Quotes may be delayed by 15 minutes or more for NASDAQ, NYSE, and AMEX
        listed securities. Extended-hours data reflects pre-market and
        after-hours activity and may have lower liquidity and wider spreads than
        regular session data. Real-time data should not be relied upon for
        time-sensitive trading decisions.
      </p>

      <h3>AI-Generated Content</h3>
      <p>
        The Daily Digest feature provides AI-generated market summaries produced
        by the Anthropic Claude API. These summaries are created from publicly
        available news headlines and{" "}
        <strong>may contain errors, inaccuracies, or misinterpretations</strong>
        . AI-generated content is not verified by human editors and should not
        be treated as authoritative financial reporting. Always verify important
        information with primary sources.
      </p>

      <h3>No Warranty</h3>
      <p>
        TickrView is provided "as is" and "as available" without warranties of
        any kind, either express or implied, including but not limited to
        implied warranties of merchantability, fitness for a particular purpose,
        and non-infringement. We do not warrant that the service will be
        uninterrupted, error-free, or free of harmful components.
      </p>

      <h3>Limitation of Liability</h3>
      <p>
        To the maximum extent permitted by law, TickrView and its operators,
        directors, employees, and affiliates shall not be liable for any losses,
        damages, or costs arising from your use of or reliance on the
        information provided on this website. This includes, but is not limited
        to, any direct, indirect, incidental, special, consequential, or
        punitive damages resulting from investment or trading decisions, loss of
        profits, data loss, or business interruption.
      </p>

      <h3>Indemnification</h3>
      <p>
        You agree to indemnify and hold harmless TickrView and its operators
        from any claims, losses, or damages (including legal fees) arising from
        your use of the service, your violation of these terms, or your
        violation of any third-party rights.
      </p>

      <h3>Third-Party Content & Data</h3>
      <p>
        TickrView aggregates and displays data from multiple third-party
        sources including Yahoo Finance, TradingView, Finnhub, Quiver
        Quantitative, ApeWisdom, Coinbase, FINRA, and RSS news feeds from CNBC,
        Bloomberg, MarketWatch, and Google News. We are not affiliated with,
        endorsed by, or sponsored by any of these providers. All trademarks and
        brand names belong to their respective owners.
      </p>
      <p>
        Third-party data is subject to the terms, limitations, and licensing of
        its respective providers. Data availability, accuracy, and timeliness
        depend on these external services and may be interrupted without notice.
        News articles, social sentiment data (Reddit mentions), congressional
        trading disclosures, insider transactions, and other third-party content
        are displayed as-is and we are not responsible for their content,
        accuracy, completeness, or availability.
      </p>

      <h3>User Accounts</h3>
      <p>
        Account creation is optional. If you create an account, you are
        responsible for maintaining the confidentiality of your credentials.
        Account data (email, favorites, alerts, notes) is stored using Supabase
        cloud infrastructure. You may request deletion of your account and all
        associated data at any time by contacting us.
      </p>

      <h3>Intellectual Property</h3>
      <p>
        The TickrView name, logo, and website design are the property of
        TickrView. Market data and financial information displayed belong to
        their respective data providers and are subject to their terms of use.
      </p>

      <h3>Prohibited Use</h3>
      <p>
        You may not use TickrView to: systematically scrape, harvest, or
        redistribute market data; use automated tools for data extraction;
        attempt to interfere with or disrupt the service; use the service for
        any unlawful purpose; or redistribute content without authorization. The
        service is intended for personal, non-commercial use.
      </p>

      <h3>Service Availability</h3>
      <p>
        TickrView relies on third-party APIs and data providers that may impose
        rate limits, experience downtime, or change their terms of service. We
        do not guarantee continuous or uninterrupted access to any data or
        feature. Features may be modified, added, or removed at any time without
        prior notice.
      </p>

      <h3>Governing Law</h3>
      <p>
        These terms shall be governed by and construed in accordance with the
        laws of the United States. Any disputes arising from these terms or your
        use of the service shall be resolved in the appropriate courts.
      </p>

      <h3>Severability</h3>
      <p>
        If any provision of these terms is found to be unenforceable or invalid,
        that provision shall be limited or eliminated to the minimum extent
        necessary, and the remaining provisions shall remain in full effect.
      </p>

      <h3>Changes to Terms</h3>
      <p>
        We reserve the right to modify these terms at any time. Continued use of
        TickrView after changes constitutes acceptance of the updated terms.
      </p>

      <h3>Contact</h3>
      <p>
        For questions about these terms, please reach out through our Contact
        form.
      </p>
    </LegalModal>
  );
}

function DoNotSellModal({ onClose }) {
  return (
    <LegalModal title="Do Not Sell My Personal Information" onClose={onClose}>
      <p className="legal-updated">California Consumer Privacy Act (CCPA)</p>

      <h3>We Do Not Sell Your Data</h3>
      <p>
        TickrView does not sell, rent, trade, or otherwise share your personal
        information with third parties for monetary or other valuable
        consideration. This has been our practice since launch and will remain
        so.
      </p>

      <h3>What We Collect</h3>
      <p>Personal information we may hold includes:</p>
      <ul>
        <li>
          <strong>Contact form submissions:</strong> Name, email, and message —
          used solely to respond to your inquiry.
        </li>
        <li>
          <strong>Account data (if registered):</strong> Email address, hashed
          password, favorites list, price alerts, and stock notes — stored
          securely in our Supabase cloud database to sync across your devices.
        </li>
        <li>
          <strong>Server logs:</strong> IP address, browser type, and timestamps
          — retained for up to 30 days for security purposes only.
        </li>
      </ul>
      <p>
        Site preferences (theme, tab selection, recently viewed stocks) are
        stored locally in your browser's localStorage and never reach our
        servers.
      </p>

      <h3>Third-Party Data Processing</h3>
      <p>
        Our servers fetch market data from third-party providers (Yahoo Finance,
        TradingView, Finnhub, Quiver Quantitative, ApeWisdom, Coinbase, FINRA)
        on your behalf. No personal information is shared with these providers.
      </p>
      <p>
        The Daily Digest feature sends publicly available news headlines (not
        user data) to the Anthropic Claude API for AI-powered market summaries.
        No personal or user-identifiable information is included in these API
        requests.
      </p>

      <h3>Exercising Your Rights</h3>
      <p>Under the CCPA, you have the right to:</p>
      <ul>
        <li>
          <strong>Right to Know:</strong> Request disclosure of what personal
          information we collect and how it is used.
        </li>
        <li>
          <strong>Right to Delete:</strong> Request deletion of your personal
          information, including your account and all associated data.
        </li>
        <li>
          <strong>Right to Opt-Out:</strong> Opt out of the sale of personal
          information. Since we do not sell data, there is nothing to opt out of
          — but we respect your right to verify this.
        </li>
        <li>
          <strong>Right to Non-Discrimination:</strong> We will not discriminate
          against you for exercising any of these rights.
        </li>
      </ul>
      <p>
        To submit a request, please use our Contact form. We will respond within
        45 days as required by law.
      </p>
    </LegalModal>
  );
}

function ContactModal({ onClose }) {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      setSent(true);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="contact-overlay" onClick={onClose}>
      <div className="contact-modal" onClick={(e) => e.stopPropagation()}>
        <div className="contact-modal-header">
          <h2 className="contact-modal-title">Contact Us</h2>
          <button className="contact-modal-close" onClick={onClose}>
            &times;
          </button>
        </div>
        {sent ? (
          <div className="contact-sent">
            <span className="contact-sent-icon">&#10003;</span>
            <p>Thanks for reaching out! We'll get back to you soon.</p>
            <button className="contact-sent-btn" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <form className="contact-form" onSubmit={handleSubmit}>
            <div className="contact-form-row">
              <div className="contact-field">
                <label className="contact-label">Your name</label>
                <input
                  className="contact-input"
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="contact-field">
                <label className="contact-label">Your email</label>
                <input
                  className="contact-input"
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, email: e.target.value }))
                  }
                  required
                />
              </div>
            </div>
            <div className="contact-field">
              <label className="contact-label">Message</label>
              <textarea
                className="contact-textarea"
                rows={5}
                value={form.message}
                onChange={(e) =>
                  setForm((f) => ({ ...f, message: e.target.value }))
                }
                required
              />
            </div>
            {error && <p className="contact-error">{error}</p>}
            <button className="contact-submit" type="submit" disabled={sending}>
              {sending ? "Sending..." : "Send message"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function ConsentBanner({ onOpenPrivacy, onOpenTerms }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const accepted = localStorage.getItem("tickrview-consent");
    if (!accepted) setVisible(true);
  }, []);

  const accept = () => {
    localStorage.setItem("tickrview-consent", "accepted");
    setVisible(false);
  };

  if (!visible) return null;

  return createPortal(
    <div className="consent-banner">
      <p className="consent-text">
        TickrView uses browser localStorage to save your preferences
        (favorites, settings). No tracking cookies are used. By continuing to
        use this site, you consent to our use of localStorage and agree to our{" "}
        <button className="consent-link" onClick={onOpenPrivacy}>
          Privacy Policy
        </button>{" "}
        and{" "}
        <button className="consent-link" onClick={onOpenTerms}>
          Terms of Service
        </button>
        . Data displayed is for informational purposes only and is not financial
        advice.
      </p>
      <button className="consent-accept" onClick={accept}>
        Accept & Continue
      </button>
    </div>,
    document.body,
  );
}

export default function Footer() {
  const [activeModal, setActiveModal] = useState(null);
  const year = new Date().getFullYear();

  useScrollLock(!!activeModal);

  return (
    <>
      <footer className="app-footer">
        <div className="app-footer-inner">
          <div className="app-footer-links">
            <button
              className="app-footer-link"
              onClick={() => setActiveModal("contact")}
            >
              Contact
            </button>
            <span className="app-footer-sep">&middot;</span>
            <button
              className="app-footer-link"
              onClick={() => setActiveModal("privacy")}
            >
              Privacy
            </button>
            <span className="app-footer-sep">&middot;</span>
            <button
              className="app-footer-link"
              onClick={() => setActiveModal("terms")}
            >
              Terms & Disclaimer
            </button>
            <span className="app-footer-sep">&middot;</span>
            <button
              className="app-footer-link"
              onClick={() => setActiveModal("donotsell")}
            >
              Do Not Sell My Personal Information
            </button>
          </div>
          <div className="app-footer-stocks">
            <div className="app-footer-stocks-label">Popular Stocks</div>
            <div className="app-footer-stocks-grid">
              {[
                'AAPL','MSFT','GOOGL','AMZN','NVDA','TSLA','META','JPM','V','JNJ',
                'WMT','UNH','PG','XOM','HD','MA','BAC','AVGO','COST','NFLX',
                'AMD','CRM','ABBV','LLY','MRK','PEP','KO','INTC','DIS','BA',
                'NKE','UBER','PLTR','SBUX','GS','CAT','GE','CVX','MCD','QCOM',
                'SPY','QQQ','IWM','VOO',
              ].map(sym => (
                <a key={sym} href={`/stock/${sym}`} className="app-footer-stock-link">{sym}</a>
              ))}
            </div>
          </div>
          <div className="app-footer-copy">
            Quotes delayed 15 min for NASDAQ, NYSE, and AMEX. Not financial
            advice.
          </div>
          <div className="app-footer-copy">
            &copy; {year} <span className="app-footer-brand">TickrView</span>.
            All rights reserved.
          </div>
        </div>
      </footer>
      <ConsentBanner
        onOpenPrivacy={() => setActiveModal("privacy")}
        onOpenTerms={() => setActiveModal("terms")}
      />
      {activeModal === "contact" &&
        createPortal(
          <ContactModal onClose={() => setActiveModal(null)} />,
          document.body,
        )}
      {activeModal === "privacy" &&
        createPortal(
          <PrivacyModal onClose={() => setActiveModal(null)} />,
          document.body,
        )}
      {activeModal === "terms" &&
        createPortal(
          <TermsModal onClose={() => setActiveModal(null)} />,
          document.body,
        )}
      {activeModal === "donotsell" &&
        createPortal(
          <DoNotSellModal onClose={() => setActiveModal(null)} />,
          document.body,
        )}
    </>
  );
}
