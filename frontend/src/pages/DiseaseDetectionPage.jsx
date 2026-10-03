import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CloudUpload, Leaf, RefreshCw, RotateCcw, ShieldCheck, Sparkles, X } from 'lucide-react';
import { diseaseApi } from '../api/disease.js';
import { useFarms } from '../context/FarmContext.jsx';
import { Button } from '../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../components/ui/Feedback.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { diseaseDetectionErrorMessage, diseaseDetectionErrorTitle, diseaseOutcomeMode, formatDiseaseConfidence, validateDiseaseUpload } from '../lib/diseaseDetectionPresentation.js';

function FileSize({ bytes }) {
  if (!Number.isFinite(bytes)) return 'Size unavailable';
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function DetectionResult({ outcome }) {
  const response = outcome.response || {};
  const detection = response.result || {};
  const farmContext = response.diseaseContext;
  const topPredictions = Array.isArray(detection.top_3) ? detection.top_3 : [];
  const detected = typeof farmContext?.detected === 'boolean' ? farmContext.detected : null;
  const healthyPrediction = String(detection.predicted_disease || '').trim().toLowerCase() === 'healthy';

  return <section className="disease-result" aria-labelledby="disease-result-heading" aria-live="polite">
    <div className="disease-result__heading"><span className="disease-result__icon"><Sparkles size={19} /></span><div><span className="eyebrow">MODEL RESULT</span><h2 id="disease-result-heading">{detection.predicted_disease || 'Prediction unavailable'}</h2></div><span className={`disease-result__status${detected === true ? ' disease-result__status--detected' : ''}`}><span aria-hidden="true">{detected === true ? '!' : detected === false || healthyPrediction ? '✓' : '•'}</span>{detected === true ? 'Disease detected' : detected === false || healthyPrediction ? 'Healthy prediction' : 'Detection result'}</span></div>
    <div className="disease-result__details"><div><span>Confidence</span><strong>{formatDiseaseConfidence(detection.confidence)}</strong></div><div><span>Crop identified</span><strong>{detection.crop || 'Not returned'}</strong></div>{detection.canonical_name && <div><span>Model class</span><strong>{detection.canonical_name}</strong></div>}</div>
    {outcome.linked ? <div className="disease-saved-context"><ShieldCheck size={17} aria-hidden="true" /><p><strong>Saved to {outcome.farmName || 'selected Farm'}.</strong> The returned disease context is now associated with this Farm and can inform connected AgriSense recommendations.</p></div> : <div className="disease-standalone-context"><p><strong>Standalone detection.</strong> No Farm disease context was changed.</p></div>}
    {topPredictions.length > 0 && <div className="disease-predictions"><div className="disease-predictions__heading"><h3>Top model predictions</h3><span>Returned by the disease model</span></div><ol>{topPredictions.map((prediction, index) => <li key={`${prediction?.canonical_name || prediction?.display_name || 'prediction'}-${index}`}><span className="disease-predictions__rank">{index + 1}</span><strong>{prediction?.display_name || [prediction?.crop, prediction?.disease].filter(Boolean).join(' ') || 'Prediction unavailable'}</strong><span>{formatDiseaseConfidence(prediction?.confidence)}</span></li>)}</ol></div>}
  </section>;
}

export function DiseaseDetectionPage() {
  const { selectedFarm, selectedFarmId, farmsLoading, farmsError, refreshFarms } = useFarms();
  const [saveToFarm, setSaveToFarm] = useState(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [clientError, setClientError] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pendingRequest, setPendingRequest] = useState(null);
  const inputRef = useRef(null);
  const previousFarmId = useRef(selectedFarmId);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);

  const linkToFarm = saveToFarm ?? Boolean(selectedFarmId);

  useEffect(() => {
    if (saveToFarm === null && selectedFarmId) setSaveToFarm(true);
  }, [saveToFarm, selectedFarmId]);

  useEffect(() => {
    if (previousFarmId.current === selectedFarmId) return;
    previousFarmId.current = selectedFarmId;
    setFile(null);
    setPreviewUrl('');
    setClientError(null);
    if (inputRef.current) inputRef.current.value = '';
  }, [selectedFarmId]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function clearSelection() {
    setFile(null);
    setPreviewUrl('');
    setClientError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  function selectFiles(files) {
    if (loading) return;
    const validation = validateDiseaseUpload(files);
    if (!validation.valid) {
      clearSelection();
      setOutcome(null);
      setClientError({ code: validation.code });
      return;
    }
    setFile(validation.file);
    setPreviewUrl(URL.createObjectURL(validation.file));
    setClientError(null);
    setOutcome(null);
  }

  async function detectDisease() {
    if (!file || loading) {
      if (!file) setClientError({ code: 'MISSING_IMAGE' });
      return;
    }
    if (linkToFarm && (!selectedFarmId || !selectedFarm)) {
      setClientError({ code: 'INVALID_FARM_ID' });
      return;
    }

    const requestFarmId = linkToFarm ? selectedFarmId : null;
    const requestFarmName = linkToFarm ? selectedFarm?.name : null;
    const requestFile = file;
    setPendingRequest({ linked: Boolean(requestFarmId), farmId: requestFarmId, farmName: requestFarmName });
    setLoading(true);
    setClientError(null);
    setOutcome(null);
    try {
      const response = await diseaseApi.upload(requestFile, requestFarmId);
      setOutcome({ status: 'success', linked: Boolean(requestFarmId), farmId: response?.farmId || requestFarmId, farmName: response?.farm?.name || requestFarmName, response });
    } catch (error) {
      setOutcome({ status: 'error', linked: Boolean(requestFarmId), farmId: requestFarmId, farmName: requestFarmName, error });
    } finally {
      setLoading(false);
      setPendingRequest(null);
    }
  }

  function resetDetection() {
    if (loading) return;
    clearSelection();
    setOutcome(null);
    setDragging(false);
    dragDepth.current = 0;
  }

  function handleDrop(event) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    selectFiles(event.dataTransfer?.files);
  }

  const outcomeMode = diseaseOutcomeMode(outcome, selectedFarmId);
  const currentOutcome = outcomeMode === 'standalone-result' || outcomeMode === 'farm-result';
  const canDetect = Boolean(file) && !loading && (!linkToFarm || Boolean(selectedFarm));

  return <div className="disease-detection-page">
    <PageHeader eyebrow="PLANT HEALTH CHECK" title="Disease Detection" description="Upload a leaf image for a model prediction. Choose whether to save the result to your selected Farm." />

    <section className="disease-farm-context" aria-labelledby="disease-farm-heading">
      <div className="disease-farm-context__icon"><Leaf size={18} /></div><div className="disease-farm-context__copy"><span className="eyebrow">FARM CONTEXT</span><h2 id="disease-farm-heading">{selectedFarm?.name || (farmsLoading ? 'Loading Farms…' : 'No Farm selected')}</h2><p>{selectedFarm ? 'You can save this detection to the selected Farm, or run it as a standalone check.' : 'Standalone detection is available without a Farm. Select or create a Farm to save disease context.'}</p></div>
    </section>
    {farmsError && <div className="disease-farms-error" role="status"><span>{farmsError}</span><button type="button" className="text-button" onClick={refreshFarms}>Retry Farm loading</button></div>}

    <fieldset className="disease-mode-picker" disabled={loading}>
      <legend>Where should this result be saved?</legend>
      <label className={`disease-mode-option${!linkToFarm ? ' disease-mode-option--selected' : ''}`}><input type="radio" name="disease-save-mode" checked={!linkToFarm} onChange={() => setSaveToFarm(false)} /><span><strong>Standalone detection</strong><small>Show the model result without changing any Farm.</small></span></label>
      <label className={`disease-mode-option${linkToFarm ? ' disease-mode-option--selected' : ''}${!selectedFarmId ? ' disease-mode-option--disabled' : ''}`}><input type="radio" name="disease-save-mode" checked={linkToFarm && Boolean(selectedFarmId)} disabled={!selectedFarmId} onChange={() => setSaveToFarm(true)} /><span><strong>Save to selected Farm</strong><small>{selectedFarm ? `Update ${selectedFarm.name} disease context after successful detection.` : 'Select a Farm in the top bar to enable Farm-linked detection.'}</small></span></label>
    </fieldset>

    <section className={`disease-upload${dragging ? ' disease-upload--dragging' : ''}`} aria-labelledby="disease-upload-heading" onDragEnter={(event) => { event.preventDefault(); dragDepth.current += 1; setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDragging(false); }} onDrop={handleDrop}>
      <div className="disease-upload__heading"><span className="eyebrow">LEAF IMAGE</span><h2 id="disease-upload-heading">Choose an image to analyze</h2><p>JPEG or PNG · up to 5 MB · one image per detection</p></div>
      <input ref={inputRef} id="disease-image-input" className="disease-file-input" type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" aria-label="Choose one JPEG or PNG leaf image" disabled={loading} onChange={(event) => selectFiles(event.target.files)} />
      <div className="disease-drop-content"><span className="disease-upload__icon"><CloudUpload size={25} /></span><strong>Drop a leaf image here</strong><span>or browse from your device</span><label className="button button--outline disease-browse-button" htmlFor="disease-image-input">Browse image</label></div>
      <p className="disease-upload__security"><ShieldCheck size={14} /> The image is temporarily processed for detection and is not saved as a Farm file.</p>
    </section>

    {clientError && <div className="disease-upload-error" role="alert"><AlertTriangle size={17} /><span>{diseaseDetectionErrorMessage(clientError)}</span><button type="button" aria-label="Dismiss upload error" onClick={() => setClientError(null)}><X size={15} /></button></div>}

    {file && previewUrl && <section className="disease-preview" aria-label="Selected image preview"><div className="disease-preview__image-wrap"><img src={previewUrl} alt={`Preview of ${file.name}`} /></div><div className="disease-preview__details"><span className="eyebrow">READY TO UPLOAD</span><strong>{file.name}</strong><span><FileSize bytes={file.size} /> · {file.type}</span></div><button className="disease-preview__remove" type="button" aria-label="Remove selected image" disabled={loading} onClick={clearSelection}><X size={17} /></button></section>}

    <div className="disease-action-row">{!currentOutcome || outcome?.status === 'error' ? <Button onClick={detectDisease} disabled={!canDetect}><Sparkles size={16} />{loading ? 'Analyzing leaf image…' : 'Detect Disease'}</Button> : <Button variant="outline" onClick={resetDetection} disabled={loading}><RotateCcw size={16} />New Detection</Button>}{outcome && <Button variant="ghost" onClick={resetDetection} disabled={loading}><RefreshCw size={15} />Reset</Button>}</div>

    {loading && <div className="disease-loading-panel"><LoadingState label="Analyzing the selected leaf image…" /><p>{pendingRequest?.linked ? `The result will be associated with ${pendingRequest.farmName || 'the captured Farm'} if detection succeeds.` : 'This is a standalone detection; no Farm will be changed.'}</p></div>}

    {outcomeMode === 'stale-farm-result' && outcome?.status === 'success' && <div className="disease-stale-notice" role="status"><ShieldCheck size={18} /><p><strong>Detection completed for {outcome.farmName || 'the previously selected Farm'}.</strong> Its disease context was saved there. The result is hidden while another Farm is selected; switch back to view it.</p></div>}
    {outcomeMode === 'stale-farm-result' && outcome?.status === 'error' && <div className="disease-stale-notice" role="status"><AlertTriangle size={18} /><p><strong>The request was for {outcome.farmName || 'the previously selected Farm'}.</strong> This result is not shown for the currently selected Farm. Switch back to review the error and retry.</p></div>}
    {outcome?.status === 'error' && (outcomeMode === 'farm-result' || outcomeMode === 'standalone-result') && <div className="disease-request-error"><ErrorState title={diseaseDetectionErrorTitle(outcome.error)} message={diseaseDetectionErrorMessage(outcome.error)} onRetry={detectDisease} /></div>}
    {outcome?.status === 'success' && currentOutcome && <DetectionResult outcome={outcome} />}
  </div>;
}
