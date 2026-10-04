import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, BarChart3, Check, Info, Leaf, MapPin, Pencil, Scale, Sprout, TrendingUp } from 'lucide-react';
import { Link } from 'react-router';
import { cropRankingApi } from '../api/cropRanking.js';
import { useFarms } from '../context/FarmContext.jsx';
import { Button } from '../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/Feedback.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { createCropRankingRequestTracker, cropRankingErrorMessage, cropRankingErrorTitle, cropRankingFallbackMessage, cropRankingMarketProvenance, cropRankingPageMode, formatRankingScore, hasLocalFallbackMarketData, labelCropRankingField, missingCropRankingFields, rankingCandidates, rankingCandidateSignals, topRankedCrop, visibleCropRanking } from '../lib/cropRankingPresentation.js';

function CandidateSignals({ candidate }) {
  const signals = rankingCandidateSignals(candidate);
  if (!signals.length) return <p className="ranking-no-signals">No numeric ranking signals were returned for this crop.</p>;
  return <dl className="ranking-signals">{signals.map((signal) => <div key={signal.key}><dt>{signal.label}</dt><dd>{formatRankingScore(signal.value)}</dd></div>)}</dl>;
}

function MarketDetails({ candidate }) {
  const provenance = cropRankingMarketProvenance(candidate.market_source);
  const hasMarketSignal = candidate.market_data_available === true;
  const hasPrice = hasMarketSignal && candidate.current_price !== null && candidate.current_price !== undefined;
  return <section className="ranking-market-detail" aria-label={`Market signal for ${candidate.crop || 'candidate crop'}`}>
    <div className="ranking-market-detail__heading"><span><TrendingUp size={15} aria-hidden="true" /> Market signal</span><span className={`ranking-market-source ranking-market-source--${provenance.kind}`}>{provenance.label}</span></div>
    {hasMarketSignal ? <>
      <p className="ranking-market-status">{candidate.market_trend ? `Returned trend: ${candidate.market_trend}` : 'Market data returned.'}</p>
      {hasPrice && <p className="ranking-market-price">Latest returned record: <strong>{formatRankingScore(candidate.current_price)} {candidate.price_unit || ''}</strong>{candidate.market_record_date && <span> · {candidate.market_record_date}</span>}</p>}
    </> : <p className="ranking-market-status">No market signal was available for this candidate.</p>}
  </section>;
}

function RankedCandidate({ candidate, highlighted = false }) {
  const explanation = typeof candidate.explanation === 'string' ? candidate.explanation : '';
  return <article className={`ranking-candidate${highlighted ? ' ranking-candidate--top' : ''}`}>
    <div className="ranking-candidate__header"><span className="ranking-candidate__rank">{Number.isInteger(candidate.rank) ? candidate.rank : '—'}</span><div className="ranking-candidate__identity"><span className="eyebrow">{highlighted ? 'TOP-RANKED CROP' : `RANK ${Number.isInteger(candidate.rank) ? candidate.rank : 'NOT RETURNED'}`}</span><h3>{typeof candidate.crop === 'string' && candidate.crop ? candidate.crop : 'Crop name not returned'}</h3></div>{highlighted && <span className="ranking-best-label"><Check size={13} aria-hidden="true" /> BEST RANKED</span>}</div>
    <CandidateSignals candidate={candidate} />
    <MarketDetails candidate={candidate} />
    {explanation && <p className="ranking-explanation"><Info size={14} aria-hidden="true" /><span>{explanation}</span></p>}
  </article>;
}

export function CropRankingPage() {
  const { farms, selectedFarm, selectedFarmId, loading: farmsLoading, error: farmsError, refreshFarms } = useFarms();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const requestTracker = useRef(createCropRankingRequestTracker(selectedFarmId));

  useEffect(() => {
    requestTracker.current.setFarmId(selectedFarmId);
    setResult(null);
    setError(null);
    setLoading(false);
    return () => requestTracker.current.setFarmId(null);
  }, [selectedFarmId]);

  async function requestRanking() {
    const requestedFarmId = selectedFarmId;
    const requestId = requestTracker.current.begin(requestedFarmId);
    if (requestId === null) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await cropRankingApi.get(requestedFarmId);
      if (requestTracker.current.isCurrent(requestId, requestedFarmId)) setResult(response);
    } catch (requestError) {
      if (requestTracker.current.isCurrent(requestId, requestedFarmId)) setError({ farmId: requestedFarmId, cause: requestError });
    } finally {
      if (requestTracker.current.finish(requestId, requestedFarmId)) setLoading(false);
    }
  }

  const mode = cropRankingPageMode({ loading: farmsLoading, error: farmsError, selectedFarm, selectedFarmId });
  if (mode === 'loading') return <div className="crop-ranking-page"><LoadingState label="Loading your selected Farm…" /></div>;
  if (mode === 'farm-error') return <div className="crop-ranking-page"><PageHeader eyebrow="AGRI INTELLIGENCE" title="Crop Ranking" description="Compare the backend’s crop recommendation candidates using available market signals." /><ErrorState title="Your Farms could not be loaded" message={farmsError} onRetry={refreshFarms} /></div>;
  if (mode === 'no-farm') return <div className="crop-ranking-page"><PageHeader eyebrow="AGRI INTELLIGENCE" title="Crop Ranking" description="Compare the backend’s crop recommendation candidates using available market signals." /><EmptyState title={farms.length ? 'Select a Farm to get started' : 'Create a Farm to get started'} message={farms.length ? 'Select a Farm in the top bar before requesting a crop ranking.' : 'A Farm is required. Create one with soil and recorded weather information to rank its candidate crops.'} action={<Link className="button button--primary" to="/app/farms">Manage your Farms <ArrowRight size={16} /></Link>} /></div>;

  const location = [selectedFarm.location?.village, selectedFarm.location?.district, selectedFarm.location?.state].filter(Boolean).join(', ');
  const activeError = error?.farmId === selectedFarmId ? error.cause : null;
  const missingFields = missingCropRankingFields(activeError);
  const visibleResult = visibleCropRanking(result, selectedFarmId);
  const recommendation = visibleResult?.recommendation;
  const candidates = rankingCandidates(recommendation);
  const bestCandidate = topRankedCrop(recommendation);
  const otherCandidates = candidates.filter((candidate) => candidate !== bestCandidate);
  const fallbackMessage = cropRankingFallbackMessage(recommendation);
  const weights = recommendation?.weights;

  return <div className="crop-ranking-page">
    <PageHeader eyebrow="AGRI INTELLIGENCE" title="Crop Ranking" description="See how available market signals affect the ranking of your Farm’s agronomic crop candidates." />

    <section className="ranking-farm-context" aria-labelledby="ranking-farm-heading"><span className="ranking-farm-context__icon"><Sprout size={18} aria-hidden="true" /></span><div className="ranking-farm-context__copy"><span className="eyebrow">SELECTED FARM</span><h2 id="ranking-farm-heading">{selectedFarm.name}</h2><p><MapPin size={14} aria-hidden="true" />{location || 'Location not recorded'}</p></div><span className="ranking-farm-context__active"><Check size={13} aria-hidden="true" /> ACTIVE</span></section>

    <section className="ranking-method-note" aria-label="How Crop Ranking works"><Scale size={17} aria-hidden="true" /><p><strong>Crop Recommendation finds agronomic candidates.</strong> This decision-ranking engine combines their recommendation signals with available market signals. It does not generate a second crop model prediction. <Link to="/app/crop-recommendation">View Crop Recommendation</Link></p></section>

    <div className="ranking-action"><Button onClick={requestRanking} disabled={loading || !selectedFarmId}><BarChart3 size={16} aria-hidden="true" />{loading ? 'Ranking candidate crops…' : visibleResult ? 'Refresh Crop Ranking' : 'Rank Crops'}</Button>{!loading && !visibleResult && <span>Uses the selected Farm’s recorded soil and weather data.</span>}</div>
    {loading && <div className="ranking-loading"><LoadingState label="Ranking this Farm’s crop candidates…" /><p>The backend is combining the existing crop recommendation with available market data.</p></div>}

    {activeError && missingFields.length > 0 && <section className="ranking-missing" role="alert"><AlertTriangle size={18} aria-hidden="true" /><div><h2>More Farm information is required</h2><p>The ranking service needs these saved values before it can produce a ranking:</p><ul>{missingFields.map((field, index) => <li key={`${field}-${index}`}>{labelCropRankingField(field)}</li>)}</ul><Link className="button button--outline" to={`/app/farms/${encodeURIComponent(selectedFarmId)}`}><Pencil size={15} aria-hidden="true" /> Edit Farm</Link></div></section>}
    {activeError && missingFields.length === 0 && <div className="ranking-error"><ErrorState title={cropRankingErrorTitle(activeError)} message={cropRankingErrorMessage(activeError)} onRetry={requestRanking} /></div>}

    {visibleResult && <div className="ranking-results" aria-live="polite">
      <section className="ranking-results__intro"><div><span className="eyebrow">BACKEND DECISION RANKING</span><h2>Ranked crops for {visibleResult.farmName || selectedFarm.name}</h2></div>{weights && Number.isFinite(weights.agronomic) && Number.isFinite(weights.market) && <span className="ranking-weights">Engine weights · Agronomic {formatRankingScore(weights.agronomic)} · Market {formatRankingScore(weights.market)}</span>}</section>

      {fallbackMessage && <aside className={`ranking-provenance-warning${hasLocalFallbackMarketData(candidates) ? ' ranking-provenance-warning--local' : ''}`} role="note"><AlertTriangle size={17} aria-hidden="true" /><p>{fallbackMessage}</p></aside>}

      {bestCandidate && <section className="ranking-best" aria-labelledby="ranking-best-heading"><div className="ranking-best__heading"><span className="ranking-best__icon"><TrendingUp size={19} aria-hidden="true" /></span><div><span className="eyebrow">BEST CANDIDATE RETURNED BY ENGINE</span><h2 id="ranking-best-heading">{bestCandidate.crop || 'Crop name not returned'}</h2></div><span className="ranking-best__rank">Rank {bestCandidate.rank}</span></div><CandidateSignals candidate={bestCandidate} /><MarketDetails candidate={bestCandidate} />{typeof bestCandidate.explanation === 'string' && <p className="ranking-explanation"><Info size={14} aria-hidden="true" /><span>{bestCandidate.explanation}</span></p>}</section>}

      <section className="ranking-list-panel" aria-labelledby="ranking-list-heading"><div className="ranking-list-panel__heading"><div><span className="eyebrow">ENGINE ORDER</span><h2 id="ranking-list-heading">{bestCandidate ? 'Other ranked candidates' : 'Ranked candidates'}</h2></div><span>Order and rank returned by backend</span></div>{otherCandidates.length ? <div className="ranking-candidate-list">{otherCandidates.map((candidate, index) => <RankedCandidate key={`${candidate?.rank ?? 'rank'}-${candidate?.crop || index}`} candidate={candidate} />)}</div> : candidates.length === 0 ? <p className="ranking-empty-copy">The backend did not return any ranked crop candidates.</p> : <p className="ranking-empty-copy">No other candidates were returned.</p>}</section>

      {typeof recommendation?.disclaimer === 'string' && recommendation.disclaimer && <aside className="ranking-disclaimer"><Info size={16} aria-hidden="true" /><p>{recommendation.disclaimer}</p></aside>}
    </div>}
  </div>;
}
