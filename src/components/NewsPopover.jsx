import { useEffect, useRef } from 'react';

function timeAgo(unixTimestamp) {
  const seconds = Math.floor(Date.now() / 1000 - unixTimestamp);
  if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function NewsPopover({ articles, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div className="news-popover" ref={ref} onClick={e => e.stopPropagation()}>
      <div className="news-popover-header">
        <span className="news-popover-title">Recent News</span>
        <button className="news-popover-close" onClick={onClose} aria-label="Close news">&times;</button>
      </div>
      {(articles || []).map((article, i) => (
        <a
          key={i}
          className="news-popover-item"
          href={article.link}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="news-popover-headline">{article.title}</span>
          <span className="news-popover-meta">
            {article.publisher} &middot; {timeAgo(article.publishedAt)}
          </span>
        </a>
      ))}
    </div>
  );
}
