import { useState } from 'react';
import InsiderTrading from './InsiderTrading.jsx';
import OptionsFlow from './OptionsFlow.jsx';
import ShortInterest from './ShortInterest.jsx';
import CongressTrading from './CongressTrading.jsx';
import GovContracts from './GovContracts.jsx';
import Lobbying from './Lobbying.jsx';
import DarkPool from './DarkPool.jsx';
import WallStreetBets from './WallStreetBets.jsx';

const SUB_TABS = [
  { key: 'wsb', label: 'WSB' },
  { key: 'insider', label: 'Insider Trading' },
  { key: 'options', label: 'Options Flow' },
  { key: 'short', label: 'Short Interest' },
  { key: 'congress', label: 'Congress' },
  { key: 'govcontracts', label: 'Gov Contracts' },
  { key: 'lobbying', label: 'Lobbying' },
  { key: 'darkpool', label: 'Dark Pool' },
];

const SOURCE_NOTES = {
  insider: 'Finnhub API — SEC Form 4 insider transactions updated in real-time',
  options: 'Yahoo Finance options chain — unusual activity detected by volume/OI ratio & premium size',
  short: 'FINRA short interest data via Yahoo Finance — updated bi-monthly',
  congress: 'Quiver Quantitative — STOCK Act filings from House & Senate updated daily',
  govcontracts: 'Quiver Quantitative — federal government contracts awarded to public companies',
  lobbying: 'Quiver Quantitative — corporate lobbying disclosures filed with Congress',
  darkpool: 'Quiver Quantitative — FINRA off-exchange (dark pool) volume & short data',
  wsb: 'ApeWisdom — Reddit mentions across WallStreetBets, r/stocks, r/investing & more',
};

export default function SmartMoney({ active, onSelectStock }) {
  const [subTab, setSubTab] = useState('wsb');

  return (
    <main className="smartmoney-main">
      <div className="smartmoney-header">
        <div className="smartmoney-header-left">
          <h2 className="smartmoney-title">Smart Money</h2>
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

      {subTab === 'insider' && (
        <InsiderTrading active={active && subTab === 'insider'} onSelectStock={onSelectStock} />
      )}
      {subTab === 'options' && (
        <OptionsFlow active={active && subTab === 'options'} onSelectStock={onSelectStock} />
      )}
      {subTab === 'short' && (
        <ShortInterest active={active && subTab === 'short'} onSelectStock={onSelectStock} />
      )}
      {subTab === 'congress' && (
        <CongressTrading active={active && subTab === 'congress'} onSelectStock={onSelectStock} />
      )}
      {subTab === 'govcontracts' && (
        <GovContracts active={active && subTab === 'govcontracts'} onSelectStock={onSelectStock} />
      )}
      {subTab === 'lobbying' && (
        <Lobbying active={active && subTab === 'lobbying'} onSelectStock={onSelectStock} />
      )}
      {subTab === 'darkpool' && (
        <DarkPool active={active && subTab === 'darkpool'} onSelectStock={onSelectStock} />
      )}
      {subTab === 'wsb' && (
        <WallStreetBets active={active && subTab === 'wsb'} onSelectStock={onSelectStock} />
      )}
    </main>
  );
}
