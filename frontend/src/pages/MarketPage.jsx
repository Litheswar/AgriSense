import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, Info, MapPin, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { Link } from 'react-router';
import { marketApi } from '../api/market.js';
import { useFarms } from '../context/FarmContext.jsx';
import { Button } from '../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/Feedback.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { createMarketRequestTracker, marketErrorMessage, marketErrorTitle, marketPageMode, marketPriceRange, marketRecommendation, marketSource, visibleMarketResult } from '../lib/marketPresentation.js';

function formatPrice(value) {
  return Number.isFinite(value) ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value) : 'Not returned';
}

export function MarketPage() {
  const { farms, selectedFarm, selectedFarmId, loading: farmsLoading, error: farmsError, refreshFarms } = useFarms();
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const tracker = useRef(createMarketRequestTracker(selectedFarmId));

  useEffect(() => {
    tracker.current.setFarmId(selectedFarmId);
    setResult(null);
    setError(null);
    setLoading(false);
    return () => tracker.current.setFarmId(null);
  }, [selectedFarmId]);

  async function loadMarket() {
    const farmId = selectedFarmId;
    const requestId = tracker.current.begin(farmId);
    if (requestId === null) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await marketApi.get(farmId);
      if (tracker.current.isCurrent(requestId, farmId)) setResult(response);
    } catch (requestError) {
      if (tracker.current.isCurrent(requestId, farmId)) setError({ farmId, cause: requestError });
    } finally {
      if (tracker.current.finish(requestId, farmId)) setLoading(false);
    }
  }

  const mode = marketPageMode({ loading: farmsLoading, error: farmsError, selectedFarm, selectedFarmId });
  if (mode === 'loading') return <div className="market-page"><LoadingState label="Loading your selected Farm…" /></div>;
  if (mode === 'farm-error') return <div className="market-page"><PageHeader eyebrow="MARKET INTELLIGENCE" title="Market" description="Review the market data returned for your selected Farm’s crop." /><ErrorState title="Your Farms could not be loaded" message={farmsError} onRetry={refreshFarms} /></div>;
  if (mode === 'no-farm') return <div className="market-page"><PageHeader eyebrow="MARKET INTELLIGENCE" title="Market" description="Review market prices and trends for your selected Farm’s crop." /><EmptyState title={farms.length ? 'Select a Farm to get started' : 'Create a Farm to get started'} message={farms.length ? 'Select a Farm in the top bar before requesting market intelligence.' : 'Create a Farm and add its crop and market location to review market data.'} action={<Link className="button button--primary" to="/app/farms">Manage your Farms <ArrowRight size={16} /></Link>} /></div>;

  const visibleResult = visibleMarketResult(result, selectedFarmId);
  const recommendation = marketRecommendation(visibleResult);
  const range = marketPriceRange(recommendation);
  const provenance = marketSource(recommendation?.raw_source);
  const activeError = error?.farmId === selectedFarmId ? error.cause : null;
  const location = [selectedFarm.location?.village, selectedFarm.location?.district, selectedFarm.location?.state].filter(Boolean).join(', ');
  const available = recommendation?.data_available === true;
  const TrendIcon = recommendation?.trend === 'Increasing' ? TrendingUp : recommendation?.trend === 'Decreasing' ? TrendingDown : null;

  return <div className="market-page">
    <PageHeader eyebrow="MARKET INTELLIGENCE" title="Market" description="Market records and price trends returned for the crop saved on your selected Farm." />
    <section className="market-farm-context" aria-label="Selected Farm"><span className="market-farm-context__icon"><MapPin size={18} aria-hidden="true" /></span><div><span className="eyebrow">SELECTED FARM</span><h2>{selectedFarm.name}</h2><p>{location || 'Location not recorded'}{selectedFarm.crop?.name ? ` · ${selectedFarm.crop.name}` : ''}</p></div><span className="market-farm-context__active"><Check size={13} aria-hidden="true" /> SELECTED</span></section>
    <div className="market-actions"><Button onClick={loadMarket} disabled={loading || !selectedFarmId}><RefreshCw size={16} aria-hidden="true" className={loading ? 'spin' : ''} />{loading ? 'Loading Market Data…' : visibleResult ? 'Refresh Market Data' : 'Get Market Intelligence'}</Button>{!selectedFarm.crop?.name && <Link className="button button--outline" to={`/app/farms/${encodeURIComponent(selectedFarmId)}`}>Add crop to Farm</Link>}</div>
    {!selectedFarm.crop?.name && <div className="market-missing-crop" role="note"><Info size={16} aria-hidden="true" /><p>This Farm has no saved crop name. Add a crop before requesting market intelligence.</p></div>}
    {loading && <div className="market-loading"><LoadingState label="Retrieving this Farm’s market intelligence…" /><p>The backend selects its configured market provider and returns the source with the result.</p></div>}
    {activeError && <div className="market-error"><ErrorState title={marketErrorTitle(activeError)} message={marketErrorMessage(activeError)} onRetry={loadMarket} /></div>}
    {visibleResult && recommendation && <section className="market-result" aria-live="polite">
      <header className="market-result__heading"><div><span className="eyebrow">{visibleResult.farmName || selectedFarm.name}</span><h2>{recommendation.crop || selectedFarm.crop?.name || 'Crop name not returned'}</h2><p>{[recommendation.market, recommendation.district, recommendation.state].filter(Boolean).join(', ') || 'Market location not returned'}</p></div><span className={`market-source market-source--${provenance.kind}`} aria-label={`Data source: ${provenance.label}`}>{provenance.label}</span></header>
      {available ? <>
        <div className="market-price-card"><span>Latest modal price</span><strong>{formatPrice(recommendation.current_price)} <small>{range?.unit || ''}</small></strong><p>{recommendation.latest_date ? `Record date: ${recommendation.latest_date}` : 'Record date not returned'}</p></div>
        {range && <dl className="market-price-range"><div><dt>Minimum price</dt><dd>{formatPrice(range.min_price)} <small>{range.unit || ''}</small></dd></div><div><dt>Modal price</dt><dd>{formatPrice(range.modal_price)} <small>{range.unit || ''}</small></dd></div><div><dt>Maximum price</dt><dd>{formatPrice(range.max_price)} <small>{range.unit || ''}</small></dd></div></dl>}
        <div className="market-trend-card"><div className="market-trend-card__top"><span>Returned price trend</span><strong>{TrendIcon && <TrendIcon size={17} aria-hidden="true" />}{recommendation.trend || 'Not returned'}{Number.isFinite(recommendation.price_change_percent) && <small>{recommendation.price_change_percent > 0 ? '+' : ''}{recommendation.price_change_percent}%</small>}</strong></div><p>{recommendation.trend_reason || 'Trend explanation not returned.'}</p><span>{Number.isFinite(recommendation.history_points) ? `${recommendation.history_points} historical record${recommendation.history_points === 1 ? '' : 's'} used` : 'History count not returned'}</span></div>
        {provenance.kind === 'local' && <aside className="market-provenance-note market-provenance-note--local" role="note"><AlertTriangle size={17} aria-hidden="true" /><p>This result uses local fallback market data. It is not a live Government market data verification.</p></aside>}
        {provenance.kind === 'live' && <aside className="market-provenance-note" role="note"><Check size={17} aria-hidden="true" /><p>The backend reports this market result as live data from data.gov.in.</p></aside>}
      </> : <div className="market-unavailable" role="status"><Info size={18} aria-hidden="true" /><div><strong>{recommendation.status === 'UNAVAILABLE' ? 'Market data unavailable' : 'No market price returned'}</strong><p>{recommendation.message || 'The backend did not return a market record for this crop and location.'}</p></div></div>}
      {recommendation.disclaimer && <aside className="market-disclaimer"><Info size={15} aria-hidden="true" /><p>{recommendation.disclaimer}</p></aside>}
    </section>}
  </div>;
}
