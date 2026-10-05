import { useState } from 'react';
import { coordinateFieldsToDecimal, decimalToCoordinateFields } from '../../lib/coordinates.js';
import { farmToFormValues, farmValuesToPayload, validateFarmValues } from '../../lib/farmForm.js';
import { Button } from '../ui/Button.jsx';

function Field({ label, name, value, onChange, error, type = 'text', min, max, step, required = false, hint }) {
  return <label className="farm-form__field"><span>{label}{required && <i aria-hidden="true"> *</i>}</span><input name={name} value={value} onChange={onChange} type={type} min={min} max={max} step={step} required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${name}-error` : hint ? `${name}-hint` : undefined} />{error && <small id={`${name}-error`} className="farm-form__error">{error}</small>}{hint && !error && <small id={`${name}-hint`} className="farm-form__hint">{hint}</small>}</label>;
}

function DirectionField({ label, name, value, onChange, directions }) {
  return <label className="farm-form__field"><span>{label}</span><select name={name} value={value} onChange={onChange}>{directions.map(direction => <option key={direction} value={direction}>{direction}</option>)}</select></label>;
}

export function FarmForm({ farm, onSubmit, onCancel, submitLabel }) {
  const [values, setValues] = useState(() => farmToFormValues(farm));
  const [errors, setErrors] = useState({});
  const [requestError, setRequestError] = useState('');
  const [saving, setSaving] = useState(false);
  const editing = Boolean(farm);
  const update = (event) => setValues((current) => ({ ...current, [event.target.name]: event.target.value }));
  function changeCoordinateFormat(event) {
    const nextFormat = event.target.value;
    setValues(current => nextFormat === 'dms'
      ? { ...current, ...decimalToCoordinateFields(current.latitude, current.longitude), coordinateFormat: 'dms' }
      : {
        ...current,
        latitude: coordinateFieldsToDecimal(current, 'lat', 'latitude').value ?? '',
        longitude: coordinateFieldsToDecimal(current, 'lon', 'longitude').value ?? '',
        coordinateFormat: 'decimal'
      });
  }

  async function submit(event) {
    event.preventDefault();
    const validation = validateFarmValues(values);
    setErrors(validation);
    setRequestError('');
    if (Object.keys(validation).length) return;
    setSaving(true);
    try { await onSubmit(farmValuesToPayload(values)); }
    catch (error) { setRequestError(error.message || 'The farm could not be saved. Try again.'); }
    finally { setSaving(false); }
  }

  return <form className="farm-form" onSubmit={submit} noValidate>
    {requestError && <div className="farm-form__server-error" role="alert">{requestError}</div>}
    <div className="farm-form__section"><h3>Farm information</h3><p>Start with details you already know about this farm.</p><Field label="Farm name" name="name" value={values.name} onChange={update} error={errors.name} required />
      <div className="farm-form__grid"><Field label="State" name="state" value={values.state} onChange={update} error={errors.state} required /><Field label="District" name="district" value={values.district} onChange={update} error={errors.district} required /><Field label="Current crop (optional)" name="crop" value={values.crop} onChange={update} hint="Use the crop name recorded for this farm." /></div>
    </div>
    <div className="farm-form__section"><h3>Farm location</h3><p>Enter your farm location using the coordinates from your GPS, Google Maps, or another location source. Leave coordinates blank if you do not have them.</p><Field label="Village (optional)" name="village" value={values.village} onChange={update} />
      <fieldset className="farm-coordinate-format"><legend>Coordinate format</legend><label><input type="radio" name="coordinateFormat" value="decimal" checked={values.coordinateFormat !== 'dms'} onChange={changeCoordinateFormat} /> Decimal degrees</label><label><input type="radio" name="coordinateFormat" value="dms" checked={values.coordinateFormat === 'dms'} onChange={changeCoordinateFormat} /> Degrees / minutes / seconds</label></fieldset>
      {values.coordinateFormat === 'dms' ? <div className="farm-coordinate-entry">
        <div className="farm-coordinate-group"><strong>Latitude</strong><div className="farm-coordinate-grid"><Field label="Degrees" name="latDegrees" value={values.latDegrees} onChange={update} error={errors.latitude} type="number" min="0" max="90" step="1" /><Field label="Minutes" name="latMinutes" value={values.latMinutes} onChange={update} type="number" min="0" max="59" step="1" /><Field label="Seconds" name="latSeconds" value={values.latSeconds} onChange={update} type="number" min="0" max="59.999999" step="any" /><DirectionField label="Direction" name="latDirection" value={values.latDirection} onChange={update} directions={['N', 'S']} /></div>{errors.latitude && <small className="farm-form__error">{errors.latitude}</small>}</div>
        <div className="farm-coordinate-group"><strong>Longitude</strong><div className="farm-coordinate-grid"><Field label="Degrees" name="lonDegrees" value={values.lonDegrees} onChange={update} error={errors.longitude} type="number" min="0" max="180" step="1" /><Field label="Minutes" name="lonMinutes" value={values.lonMinutes} onChange={update} type="number" min="0" max="59" step="1" /><Field label="Seconds" name="lonSeconds" value={values.lonSeconds} onChange={update} type="number" min="0" max="59.999999" step="any" /><DirectionField label="Direction" name="lonDirection" value={values.lonDirection} onChange={update} directions={['E', 'W']} /></div>{errors.longitude && <small className="farm-form__error">{errors.longitude}</small>}</div>
      </div> : <div className="farm-form__grid"><Field label="Latitude (optional)" name="latitude" value={values.latitude} onChange={update} error={errors.latitude} type="number" min="-90" max="90" step="any" hint="Decimal degrees, from a map or GPS." /><Field label="Longitude (optional)" name="longitude" value={values.longitude} onChange={update} error={errors.longitude} type="number" min="-180" max="180" step="any" hint="Decimal degrees, from a map or GPS." /></div>}
    </div>
    <div className="farm-form__section"><h3>Soil information</h3><p>Soil information helps AgriSense generate better crop, fertilizer, irrigation, and farm-risk recommendations.</p><div className="farm-form__notice"><strong>Don’t have your soil test results? That’s okay.</strong><span>Nitrogen, phosphorus, potassium, and soil pH usually come from a soil test, Soil Health Card, or agricultural laboratory. Leave them blank if you do not have recent measurements—please do not guess.</span></div><p className="farm-form__optional">Optional — add these values if you have recent measurements. Some recommendations will ask for missing information instead of guessing.</p><div className="farm-form__grid"><Field label="Nitrogen (N)" name="nitrogen" value={values.nitrogen} onChange={update} error={errors.nitrogen} type="number" min="0" step="any" hint="Usually from a soil test or Soil Health Card. Enter the value exactly as reported; no unit is defined by the current model contract." /><Field label="Phosphorus (P)" name="phosphorus" value={values.phosphorus} onChange={update} error={errors.phosphorus} type="number" min="0" step="any" hint="Usually from a soil test or Soil Health Card. Enter the reported value exactly." /><Field label="Potassium (K)" name="potassium" value={values.potassium} onChange={update} error={errors.potassium} type="number" min="0" step="any" hint="Usually from a soil test or Soil Health Card. Enter the reported value exactly." /><Field label="Soil pH" name="ph" value={values.ph} onChange={update} error={errors.ph} type="number" min="0" max="14" step="any" hint="Soil acidity/alkalinity from a soil test. Allowed range: 0 to 14." /><Field label="Soil moisture (optional)" name="soilMoisture" value={values.soilMoisture} onChange={update} error={errors.soilMoisture} type="number" min="0" max="100" step="any" hint="Enter a measured percentage only if you have a sensor or moisture reading; do not use 0 for unknown." /></div></div>
    <div className="farm-form__actions"><Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? (editing ? 'Saving changes…' : 'Creating farm…') : submitLabel}</Button></div>
  </form>;
}
