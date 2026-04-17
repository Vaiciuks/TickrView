import { useMemo, useState } from "react";
import { useNewsFeed } from "../hooks/useNewsFeed.js";
import { useReadArticles } from "../hooks/useReadArticles.js";
import { scoreSentiment, articleId } from "../utils/newsSentiment.js";

const PUBLISHER_COLORS = {
  CNBC: "#1d8cf8",
  Bloomberg: "#7c3aed",
  MarketWatch: "#f59e0b",
  Reuters: "#0ea5e9",
  "Yahoo Finance": "#6366f1",
  "Barron's": "#ec4899",
  "Investor's Business Daily": "#10b981",
  "The Wall Street Journal": "#f97316",
  "Financial Times": "#fbbf24",
  "Seeking Alpha": "#ef4444",
  "Google News": "#8b5cf6",
  AP: "#94a3b8",
};

const FALLBACK_COLORS = ["#64748b", "#78716c", "#6b7280", "#71717a", "#737373"];

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "bullish", label: "Bullish" },
  { key: "bearish", label: "Bearish" },
];

function getPublisherColor(publisher) {
  for (const [key, color] of Object.entries(PUBLISHER_COLORS)) {
    if (publisher.includes(key)) return color;
  }
  let hash = 0;
  for (let i = 0; i < publisher.length; i++) {
    hash = publisher.charCodeAt(i) + ((hash << 5) - hash);
  }
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

function timeAgo(unixTimestamp) {
  const seconds = Math.floor(Date.now() / 1000 - unixTimestamp);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function SentimentDot({ sentiment }) {
  if (sentiment === "neutral") return null;
  return (
    <span
      className={`news-sentiment news-sentiment--${sentiment}`}
      title={sentiment === "bullish" ? "Bullish tone" : "Bearish tone"}
      aria-label={`${sentiment} sentiment`}
    >
      {sentiment === "bullish" ? "▲" : "▼"}
    </span>
  );
}

function NewsSkeletonLoader() {
  return (
    <div className="news-feed-skeleton">
      <div className="news-feed-skeleton-hero">
        {[0, 1].map((i) => (
          <div key={i} className="news-feed-skeleton-hero-card">
            <div className="skeleton-line" style={{ width: "100%", height: "60%", borderRadius: 8 }} />
            <div style={{ padding: "12px 0", display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="skeleton-line" style={{ width: "85%", height: 14 }} />
              <div className="skeleton-line" style={{ width: "60%", height: 11 }} />
              <div className="skeleton-line" style={{ width: 80, height: 9, marginTop: 4 }} />
            </div>
          </div>
        ))}
      </div>
      <div className="news-feed-skeleton-grid">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="news-feed-skeleton-card">
            <div className="skeleton-line" style={{ width: "100%", height: 90, borderRadius: 6 }} />
            <div style={{ padding: "10px 0", display: "flex", flexDirection: "column", gap: 5 }}>
              <div className="skeleton-line" style={{ width: "90%", height: 12 }} />
              <div className="skeleton-line" style={{ width: "70%", height: 12 }} />
              <div className="skeleton-line" style={{ width: 70, height: 9, marginTop: 2 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeroCard({ article, isRead, onMarkRead }) {
  const pubColor = getPublisherColor(article.publisher);
  return (
    <a
      className={`news-feed-hero-card${isRead ? " news-feed-card--read" : ""}`}
      href={article.link}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onMarkRead}
      onAuxClick={onMarkRead}
    >
      <div
        className="news-feed-hero-image"
        style={{ backgroundImage: `url(${article.thumbnail})` }}
      />
      <div className="news-feed-hero-overlay" />
      <div className="news-feed-hero-content">
        <div className="news-feed-hero-meta">
          <span
            className="news-feed-publisher-badge"
            style={{ background: pubColor }}
          >
            {article.publisher}
          </span>
          <SentimentDot sentiment={article.sentiment} />
        </div>
        <h2 className="news-feed-hero-title">{article.title}</h2>
        <span className="news-feed-hero-time">
          {timeAgo(article.publishedAt)}
        </span>
      </div>
    </a>
  );
}

function NewsCard({ article, isRead, onMarkRead }) {
  const pubColor = getPublisherColor(article.publisher);
  const hasThumbnail = !!article.thumbnail;

  return (
    <a
      className={`news-feed-card${hasThumbnail ? " news-feed-card--with-image" : ""}${isRead ? " news-feed-card--read" : ""}`}
      href={article.link}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onMarkRead}
      onAuxClick={onMarkRead}
      style={!hasThumbnail ? { borderLeftColor: pubColor } : undefined}
    >
      {hasThumbnail && (
        <div
          className="news-feed-card-image"
          style={{ backgroundImage: `url(${article.thumbnail})` }}
        />
      )}
      <div className="news-feed-card-body">
        <div className="news-feed-card-top">
          <div className="news-feed-card-publisher" style={{ color: pubColor }}>
            {article.publisher}
          </div>
          <SentimentDot sentiment={article.sentiment} />
        </div>
        <div className="news-feed-card-title">{article.title}</div>
        <div className="news-feed-card-time">
          {timeAgo(article.publishedAt)}
        </div>
      </div>
    </a>
  );
}

export default function NewsFeed({ active }) {
  const { articles: rawArticles, loading, lastUpdated } = useNewsFeed(active);
  const { isRead, markRead, markAllRead } = useReadArticles();
  const [filter, setFilter] = useState("all");

  // Annotate every article once with id + sentiment (stable across renders).
  const enriched = useMemo(() => {
    return rawArticles.map((a) => ({
      ...a,
      id: articleId(a),
      sentiment: scoreSentiment(a.title),
    }));
  }, [rawArticles]);

  const unreadCount = useMemo(
    () => enriched.filter((a) => !isRead(a.id)).length,
    [enriched, isRead],
  );

  const filtered = useMemo(() => {
    switch (filter) {
      case "unread":
        return enriched.filter((a) => !isRead(a.id));
      case "bullish":
        return enriched.filter((a) => a.sentiment === "bullish");
      case "bearish":
        return enriched.filter((a) => a.sentiment === "bearish");
      default:
        return enriched;
    }
  }, [enriched, filter, isRead]);

  const handleMarkAllRead = () => {
    markAllRead(enriched.map((a) => a.id));
  };

  if (loading && rawArticles.length === 0) {
    return (
      <main className="news-feed-main">
        <NewsSkeletonLoader />
      </main>
    );
  }

  const heroArticles = filtered.filter((a) => a.thumbnail).slice(0, 2);
  const heroSet = new Set(heroArticles);
  const gridArticles = filtered.filter((a) => !heroSet.has(a));

  return (
    <main className="news-feed-main">
      <div className="news-feed-header">
        <div className="news-feed-title-row">
          <h1 className="news-feed-title">News</h1>
          {unreadCount > 0 && (
            <span className="news-feed-unread-count">{unreadCount} unread</span>
          )}
        </div>
        {lastUpdated && (
          <span className="news-feed-updated">
            Updated {timeAgo(Math.floor(lastUpdated.getTime() / 1000))}
          </span>
        )}
      </div>

      <div className="news-feed-toolbar">
        <div className="news-feed-filters" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              className={`news-feed-filter${filter === f.key ? " news-feed-filter--active" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        {unreadCount > 0 && (
          <button
            className="news-feed-mark-all"
            onClick={handleMarkAllRead}
            title="Mark all articles as read"
          >
            Mark all read
          </button>
        )}
      </div>

      {heroArticles.length > 0 && (
        <section
          className={`news-feed-hero${heroArticles.length === 1 ? " news-feed-hero--single" : ""}`}
        >
          {heroArticles.map((article) => (
            <HeroCard
              key={article.id}
              article={article}
              isRead={isRead(article.id)}
              onMarkRead={() => markRead(article.id)}
            />
          ))}
        </section>
      )}

      <section className="news-feed-grid">
        {gridArticles.map((article) => (
          <NewsCard
            key={article.id}
            article={article}
            isRead={isRead(article.id)}
            onMarkRead={() => markRead(article.id)}
          />
        ))}
      </section>

      {filtered.length === 0 && !loading && (
        <div className="news-feed-empty">
          {filter === "all"
            ? "No news articles available right now. Refreshing automatically..."
            : `No ${filter} articles match this filter.`}
        </div>
      )}
    </main>
  );
}
