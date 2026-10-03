import { useState } from 'react';
import { farmToFormValues, farmValuesToPayload, validateFarmValues } from '../../lib/farmForm.js';
import { Button } from '../ui/Button.jsx';

function Field({ label, name, value, onChange, error, type = 'text', min, max, step, required = false, hint }) {
  return <label className="farm-form__field"><span>{label}{required && <i aria-hidden="true"> *</i>}</span><input name={name} value={value} onChange={onChange} type={type} min={min} max={max} step={step} required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${name}-error` : hint ? `${name}-hint` : undefined} />{error && <small id={`${name}-error`} className="farm-form__error">{error}</small>}{hint && !error && <small id={`${name}-hint`} className="farm-form__hint">{hint}</small>}</label>;
}

export function FarmForm({ farm, onSubmit, onCancel, submitLabel }) {
  const [values, setValues] = useState(() => farmToFormValues(farm));
  const [errors, setErrors] = useState({});
  const [requestError, setRequestError] = useState('');
  const [saving, setSaving] = useState(false);
  const editing = Boolean(farm);
  const update = (event) => setValues((current) => ({ ...current, [event.target.name]: event.target.value }));

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
    <div className="farm-form__section"><h3>Farm details</h3><p>Start with a name and the farm’s location.</p><Field label="Farm name" name="name" value={values.name} onChange={update} error={errors.name} required />
      <div className="farm-form__grid"><Field label="State" name="state" value={values.state} onChange={update} error={errors.state} required /><Field label="District" name="district" value={values.district} onChange={update} error={errors.district} required /><Field label="Village (optional)" name="village" value={values.village} onChange={update} /><Field label="Latitude (optional)" name="latitude" value={values.latitude} onChange={update} error={errors.latitude} type="number" min="-90" max="90" step="any" /><Field label="Longitude (optional)" name="longitude" value={values.longitude} onChange={update} error={errors.longitude} type="number" min="-180" max="180" step="any" /></div>
    </div>
    <div className="farm-form__section"><h3>Growing conditions</h3><p>Record details you already know. You can leave unknown values blank.</p><div className="farm-form__grid"><Field label="Current crop" name="crop" value={values.crop} onChange={update} hint="Free text, as supported by your farm record." /><Field label="Nitrogen (N)" name="nitrogen" value={values.nitrogen} onChange={update} error={errors.nitrogen} type="number" min="0" step="any" /><Field label="Phosphorus (P)" name="phosphorus" value={values.phosphorus} onChange={update} error={errors.phosphorus} type="number" min="0" step="any" /><Field label="Potassium (K)" name="potassium" value={values.potassium} onChange={update} error={errors.potassium} type="number" min="0" step="any" /><Field label="Soil pH" name="ph" value={values.ph} onChange={update} error={errors.ph} type="number" min="0" max="14" step="any" hint="Allowed range: 0 to 14." /><Field label="Soil moisture (%)" name="soilMoisture" value={values.soilMoisture} onChange={update} error={errors.soilMoisture} type="number" min="0" max="100" step="any" /></div></div>
    <div className="farm-form__actions"><Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? (editing ? 'Saving changes…' : 'Creating farm…') : submitLabel}</Button></div>
  </form>;
}
