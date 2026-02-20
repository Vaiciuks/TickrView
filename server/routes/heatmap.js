import { Router } from 'express';
import { withCache } from '../middleware/cache.js';
import { fetchBatchQuotes } from '../lib/yahooFetch.js';

const router = Router();

// S&P 500 major constituents grouped by GICS sector → industry
// Market caps in billions (approximate, for treemap sizing)
const SECTORS = [
  { name: 'Technology', industries: [
    { name: 'Software - Infrastructure', stocks: [
      { symbol: 'MSFT', name: 'Microsoft', mcap: 3100 },
      { symbol: 'ORCL', name: 'Oracle', mcap: 400 },
      { symbol: 'CRM', name: 'Salesforce', mcap: 280 },
      { symbol: 'NOW', name: 'ServiceNow', mcap: 190 },
      { symbol: 'PLTR', name: 'Palantir', mcap: 200 },
      { symbol: 'INTU', name: 'Intuit', mcap: 180 },
    ]},
    { name: 'Software - Application', stocks: [
      { symbol: 'ADBE', name: 'Adobe', mcap: 240 },
      { symbol: 'PANW', name: 'Palo Alto', mcap: 130 },
      { symbol: 'SNPS', name: 'Synopsys', mcap: 80 },
      { symbol: 'CDNS', name: 'Cadence', mcap: 80 },
      { symbol: 'CRWD', name: 'CrowdStrike', mcap: 75 },
      { symbol: 'FTNT', name: 'Fortinet', mcap: 60 },
    ]},
    { name: 'Semiconductors', stocks: [
      { symbol: 'NVDA', name: 'NVIDIA', mcap: 2800 },
      { symbol: 'AVGO', name: 'Broadcom', mcap: 800 },
      { symbol: 'AMD', name: 'AMD', mcap: 250 },
      { symbol: 'QCOM', name: 'Qualcomm', mcap: 190 },
      { symbol: 'TXN', name: 'Texas Inst.', mcap: 180 },
      { symbol: 'INTC', name: 'Intel', mcap: 120 },
      { symbol: 'MU', name: 'Micron', mcap: 110 },
      { symbol: 'NXPI', name: 'NXP Semi', mcap: 55 },
    ]},
    { name: 'Semiconductor Equipment', stocks: [
      { symbol: 'AMAT', name: 'Applied Mat.', mcap: 150 },
      { symbol: 'LRCX', name: 'Lam Research', mcap: 100 },
      { symbol: 'KLAC', name: 'KLA Corp', mcap: 90 },
    ]},
    { name: 'Consumer Electronics', stocks: [
      { symbol: 'AAPL', name: 'Apple', mcap: 3400 },
      { symbol: 'DELL', name: 'Dell', mcap: 80 },
    ]},
    { name: 'Information Technology', stocks: [
      { symbol: 'ACN', name: 'Accenture', mcap: 220 },
      { symbol: 'IBM', name: 'IBM', mcap: 200 },
      { symbol: 'ADP', name: 'ADP', mcap: 115 },
    ]},
    { name: 'Communication Equipment', stocks: [
      { symbol: 'CSCO', name: 'Cisco', mcap: 230 },
      { symbol: 'ANET', name: 'Arista', mcap: 110 },
    ]},
  ]},
  { name: 'Communication Services', industries: [
    { name: 'Internet Content & Information', stocks: [
      { symbol: 'GOOGL', name: 'Alphabet', mcap: 2100 },
      { symbol: 'META', name: 'Meta', mcap: 1500 },
    ]},
    { name: 'Entertainment', stocks: [
      { symbol: 'NFLX', name: 'Netflix', mcap: 400 },
      { symbol: 'DIS', name: 'Disney', mcap: 200 },
      { symbol: 'EA', name: 'EA', mcap: 40 },
      { symbol: 'TTWO', name: 'Take-Two', mcap: 30 },
    ]},
    { name: 'Telecom Services', stocks: [
      { symbol: 'TMUS', name: 'T-Mobile', mcap: 250 },
      { symbol: 'VZ', name: 'Verizon', mcap: 170 },
      { symbol: 'T', name: 'AT&T', mcap: 160 },
      { symbol: 'CMCSA', name: 'Comcast', mcap: 150 },
    ]},
    { name: 'Publishing & Ride-Sharing', stocks: [
      { symbol: 'UBER', name: 'Uber', mcap: 160 },
    ]},
  ]},
  { name: 'Consumer Cyclical', industries: [
    { name: 'Internet Retail', stocks: [
      { symbol: 'AMZN', name: 'Amazon', mcap: 2100 },
    ]},
    { name: 'Auto Manufacturers', stocks: [
      { symbol: 'TSLA', name: 'Tesla', mcap: 800 },
      { symbol: 'GM', name: 'Gen. Motors', mcap: 55 },
      { symbol: 'F', name: 'Ford', mcap: 42 },
    ]},
    { name: 'Home Improvement Retail', stocks: [
      { symbol: 'HD', name: 'Home Depot', mcap: 380 },
      { symbol: 'LOW', name: 'Lowe\'s', mcap: 140 },
    ]},
    { name: 'Restaurants', stocks: [
      { symbol: 'MCD', name: 'McDonald\'s', mcap: 210 },
      { symbol: 'SBUX', name: 'Starbucks', mcap: 110 },
      { symbol: 'CMG', name: 'Chipotle', mcap: 75 },
    ]},
    { name: 'Travel Services', stocks: [
      { symbol: 'BKNG', name: 'Booking', mcap: 160 },
      { symbol: 'ABNB', name: 'Airbnb', mcap: 80 },
    ]},
    { name: 'Apparel Retail', stocks: [
      { symbol: 'TJX', name: 'TJX', mcap: 130 },
      { symbol: 'NKE', name: 'Nike', mcap: 110 },
      { symbol: 'ORLY', name: 'O\'Reilly', mcap: 70 },
      { symbol: 'ROST', name: 'Ross Stores', mcap: 50 },
    ]},
  ]},
  { name: 'Consumer Defensive', industries: [
    { name: 'Discount Stores', stocks: [
      { symbol: 'WMT', name: 'Walmart', mcap: 600 },
      { symbol: 'COST', name: 'Costco', mcap: 380 },
    ]},
    { name: 'Household & Personal', stocks: [
      { symbol: 'PG', name: 'Procter & G.', mcap: 380 },
      { symbol: 'CL', name: 'Colgate', mcap: 75 },
    ]},
    { name: 'Beverages - Non-Alcoholic', stocks: [
      { symbol: 'KO', name: 'Coca-Cola', mcap: 270 },
      { symbol: 'PEP', name: 'PepsiCo', mcap: 220 },
    ]},
    { name: 'Tobacco', stocks: [
      { symbol: 'PM', name: 'Philip Morris', mcap: 200 },
      { symbol: 'MO', name: 'Altria', mcap: 90 },
    ]},
    { name: 'Packaged Foods', stocks: [
      { symbol: 'MDLZ', name: 'Mondelez', mcap: 90 },
      { symbol: 'KR', name: 'Kroger', mcap: 45 },
      { symbol: 'HSY', name: 'Hershey', mcap: 35 },
      { symbol: 'SYY', name: 'Sysco', mcap: 40 },
      { symbol: 'ADM', name: 'Archer-Daniels', mcap: 25 },
    ]},
    { name: 'Beverages - Alcoholic', stocks: [
      { symbol: 'STZ', name: 'Constellation', mcap: 45 },
    ]},
  ]},
  { name: 'Healthcare', industries: [
    { name: 'Drug Manufacturers - General', stocks: [
      { symbol: 'LLY', name: 'Eli Lilly', mcap: 750 },
      { symbol: 'JNJ', name: 'J&J', mcap: 380 },
      { symbol: 'ABBV', name: 'AbbVie', mcap: 320 },
      { symbol: 'MRK', name: 'Merck', mcap: 260 },
      { symbol: 'PFE', name: 'Pfizer', mcap: 150 },
      { symbol: 'BMY', name: 'Bristol-Myers', mcap: 120 },
      { symbol: 'AMGN', name: 'Amgen', mcap: 160 },
      { symbol: 'GILD', name: 'Gilead', mcap: 110 },
    ]},
    { name: 'Healthcare Plans', stocks: [
      { symbol: 'UNH', name: 'UnitedHealth', mcap: 500 },
      { symbol: 'CI', name: 'Cigna', mcap: 95 },
      { symbol: 'CVS', name: 'CVS Health', mcap: 85 },
    ]},
    { name: 'Medical Devices', stocks: [
      { symbol: 'TMO', name: 'Thermo Fisher', mcap: 200 },
      { symbol: 'ABT', name: 'Abbott', mcap: 200 },
      { symbol: 'DHR', name: 'Danaher', mcap: 170 },
      { symbol: 'SYK', name: 'Stryker', mcap: 130 },
      { symbol: 'BSX', name: 'Boston Sci.', mcap: 120 },
      { symbol: 'MDT', name: 'Medtronic', mcap: 110 },
    ]},
  ]},
  { name: 'Financial', industries: [
    { name: 'Banks - Diversified', stocks: [
      { symbol: 'JPM', name: 'JPMorgan', mcap: 650 },
      { symbol: 'BAC', name: 'Bank of Am.', mcap: 340 },
      { symbol: 'WFC', name: 'Wells Fargo', mcap: 220 },
      { symbol: 'C', name: 'Citigroup', mcap: 130 },
      { symbol: 'USB', name: 'US Bancorp', mcap: 75 },
      { symbol: 'PNC', name: 'PNC Financial', mcap: 75 },
    ]},
    { name: 'Credit Services', stocks: [
      { symbol: 'V', name: 'Visa', mcap: 580 },
      { symbol: 'MA', name: 'Mastercard', mcap: 450 },
      { symbol: 'AXP', name: 'Am. Express', mcap: 190 },
      { symbol: 'COF', name: 'Capital One', mcap: 65 },
    ]},
    { name: 'Capital Markets', stocks: [
      { symbol: 'GS', name: 'Goldman Sachs', mcap: 170 },
      { symbol: 'MS', name: 'Morgan Stanley', mcap: 160 },
      { symbol: 'BX', name: 'Blackstone', mcap: 150 },
      { symbol: 'BLK', name: 'BlackRock', mcap: 140 },
      { symbol: 'SCHW', name: 'Schwab', mcap: 130 },
    ]},
    { name: 'Insurance', stocks: [
      { symbol: 'CB', name: 'Chubb', mcap: 110 },
      { symbol: 'PGR', name: 'Progressive', mcap: 130 },
      { symbol: 'TRV', name: 'Travelers', mcap: 55 },
    ]},
  ]},
  { name: 'Industrials', industries: [
    { name: 'Aerospace & Defense', stocks: [
      { symbol: 'GE', name: 'GE Aerospace', mcap: 200 },
      { symbol: 'RTX', name: 'RTX', mcap: 160 },
      { symbol: 'LMT', name: 'Lockheed', mcap: 120 },
      { symbol: 'BA', name: 'Boeing', mcap: 130 },
      { symbol: 'GD', name: 'General Dyn.', mcap: 80 },
      { symbol: 'NOC', name: 'Northrop', mcap: 70 },
      { symbol: 'HON', name: 'Honeywell', mcap: 140 },
    ]},
    { name: 'Farm & Heavy Construction', stocks: [
      { symbol: 'CAT', name: 'Caterpillar', mcap: 180 },
      { symbol: 'DE', name: 'Deere', mcap: 120 },
    ]},
    { name: 'Railroads', stocks: [
      { symbol: 'UNP', name: 'Union Pacific', mcap: 150 },
      { symbol: 'CSX', name: 'CSX', mcap: 65 },
      { symbol: 'NSC', name: 'Norfolk South.', mcap: 55 },
    ]},
    { name: 'Waste Management', stocks: [
      { symbol: 'WM', name: 'Waste Mgmt.', mcap: 85 },
    ]},
    { name: 'Logistics', stocks: [
      { symbol: 'UPS', name: 'UPS', mcap: 100 },
      { symbol: 'FDX', name: 'FedEx', mcap: 60 },
    ]},
  ]},
  { name: 'Energy', industries: [
    { name: 'Oil & Gas Integrated', stocks: [
      { symbol: 'XOM', name: 'Exxon', mcap: 500 },
      { symbol: 'CVX', name: 'Chevron', mcap: 290 },
    ]},
    { name: 'Oil & Gas E&P', stocks: [
      { symbol: 'COP', name: 'ConocoPhillips', mcap: 140 },
      { symbol: 'EOG', name: 'EOG Resources', mcap: 70 },
      { symbol: 'OXY', name: 'Occidental', mcap: 45 },
      { symbol: 'FANG', name: 'Diamondback', mcap: 50 },
      { symbol: 'HES', name: 'Hess', mcap: 45 },
    ]},
    { name: 'Oil & Gas Refining', stocks: [
      { symbol: 'MPC', name: 'Marathon Petro.', mcap: 55 },
      { symbol: 'PSX', name: 'Phillips 66', mcap: 50 },
      { symbol: 'VLO', name: 'Valero', mcap: 45 },
    ]},
    { name: 'Oil & Gas Equipment', stocks: [
      { symbol: 'SLB', name: 'Schlumberger', mcap: 65 },
    ]},
  ]},
  { name: 'Real Estate', industries: [
    { name: 'REIT - Specialty', stocks: [
      { symbol: 'AMT', name: 'American Tower', mcap: 90 },
      { symbol: 'EQIX', name: 'Equinix', mcap: 80 },
      { symbol: 'CCI', name: 'Crown Castle', mcap: 45 },
      { symbol: 'DLR', name: 'Digital Realty', mcap: 45 },
    ]},
    { name: 'REIT - Industrial', stocks: [
      { symbol: 'PLD', name: 'Prologis', mcap: 100 },
    ]},
    { name: 'REIT - Retail', stocks: [
      { symbol: 'SPG', name: 'Simon Prop.', mcap: 55 },
      { symbol: 'O', name: 'Realty Income', mcap: 50 },
    ]},
    { name: 'REIT - Healthcare', stocks: [
      { symbol: 'WELL', name: 'Welltower', mcap: 50 },
    ]},
  ]},
  { name: 'Utilities', industries: [
    { name: 'Utilities - Regulated Electric', stocks: [
      { symbol: 'NEE', name: 'NextEra', mcap: 150 },
      { symbol: 'SO', name: 'Southern Co.', mcap: 90 },
      { symbol: 'DUK', name: 'Duke Energy', mcap: 85 },
      { symbol: 'AEP', name: 'AEP', mcap: 50 },
      { symbol: 'SRE', name: 'Sempra', mcap: 50 },
      { symbol: 'D', name: 'Dominion', mcap: 45 },
      { symbol: 'EXC', name: 'Exelon', mcap: 42 },
      { symbol: 'XEL', name: 'Xcel Energy', mcap: 35 },
      { symbol: 'ED', name: 'Con Edison', mcap: 35 },
    ]},
    { name: 'Utilities - Independent Power', stocks: [
      { symbol: 'CEG', name: 'Constellation', mcap: 70 },
    ]},
  ]},
  { name: 'Basic Materials', industries: [
    { name: 'Specialty Chemicals', stocks: [
      { symbol: 'LIN', name: 'Linde', mcap: 210 },
      { symbol: 'SHW', name: 'Sherwin-Wm.', mcap: 85 },
      { symbol: 'APD', name: 'Air Products', mcap: 65 },
      { symbol: 'ECL', name: 'Ecolab', mcap: 55 },
    ]},
    { name: 'Mining', stocks: [
      { symbol: 'FCX', name: 'Freeport-McMoRan', mcap: 60 },
      { symbol: 'NEM', name: 'Newmont', mcap: 50 },
    ]},
    { name: 'Steel', stocks: [
      { symbol: 'NUE', name: 'Nucor', mcap: 35 },
      { symbol: 'STLD', name: 'Steel Dyn.', mcap: 20 },
    ]},
    { name: 'Chemicals', stocks: [
      { symbol: 'DOW', name: 'Dow Inc.', mcap: 35 },
      { symbol: 'DD', name: 'DuPont', mcap: 35 },
    ]},
  ]},
];

// Flatten all symbols for batch fetching
const ALL_SYMBOLS = SECTORS.flatMap(s =>
  s.industries.flatMap(ind => ind.stocks.map(st => st.symbol))
);

router.get('/', withCache(60), async (req, res, next) => {
  try {
    const quotes = await fetchBatchQuotes(ALL_SYMBOLS);

    const sectors = SECTORS.map(sector => ({
      name: sector.name,
      industries: sector.industries.map(ind => ({
        name: ind.name,
        stocks: ind.stocks
          .map(s => {
            const q = quotes.get(s.symbol);
            return {
              symbol: s.symbol,
              name: s.name,
              marketCap: s.mcap * 1e9,
              changePercent: q?.changePercent ?? 0,
              price: q?.price ?? 0,
            };
          })
          .sort((a, b) => b.marketCap - a.marketCap),
      })),
    }));

    res.json({ sectors });
  } catch (error) {
    next(error);
  }
});

export default router;
export { SECTORS, ALL_SYMBOLS };
