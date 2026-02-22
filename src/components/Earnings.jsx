import { useState } from 'react';
import EarningsCalendar from './EarningsCalendar.jsx';
import EarningsLookup from './EarningsLookup.jsx';

const SUB_TABS = [
  { key: 'calendar', label: 'Calendar' },
  { key: 'lookup', label: 'Lookup' },
];

const SOURCE_NOTES = {
  calendar: 'Nasdaq earnings calendar — updated daily',
  lookup: 'Nasdaq, Yahoo Finance & Finnhub — EPS, revenue & analyst consensus',
};

export default function Earnings({ active, onSelectStock }) {
  const [subTab, setSubTab] = useState('calendar');

  return (
    <main className="earnings-main">
      <div className="smartmoney-header">
        <div className="smartmoney-header-left">
          <h2 className="smartmoney-title">Earnings</h2>
          <div className="smartmoney-tab-toggle">
            {SUB_TABS.map(tab => (
              <button
                key={tab.key}
                className={`smartmoney-tab-btn${subTab === tab.key ? ' active' : ''}`}
                onClick={() => setSubTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <span className="smartmoney-source-note">{SOURCE_NOTES[subTab]}</span>
        </div>
      </div>

      {subTab === 'calendar' && (
        <EarningsCalendar active={active && subTab === 'calendar'} onSelectStock={onSelectStock} />
      )}
      {subTab === 'lookup' && (
        <EarningsLookup active={active && subTab === 'lookup'} onSelectStock={onSelectStock} />
      )}
    </main>
  );
}
