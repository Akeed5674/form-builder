import React, { useState, useCallback, useRef, useEffect } from 'react';
import './index.css'; 
import './App.css'; 
import { supabase } from './supabaseClient';
import SupabaseFileUploader from './SupabaseFileUploader.jsx';
import LZString from 'lz-string';
// ---- Normalizers & defaults (ADD THIS) ----
const asArray = (v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch {}
  }
  return [];
};

const asObject = (v, fallback = {}) => {
  if (v && typeof v === 'object') return v;
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return p && typeof p === 'object' ? p : fallback; } catch {}
  }
  return fallback;
};

const DEFAULT_STYLES = {
  primaryColor: '#6366f1', fontFamily: 'Inter, sans-serif', backgroundColor: '#ffffff',
  textColor: '#111827', borderColor: '#d1d5db', buttonTextColor: '#ffffff',
  logoUrl: null, fieldBgColor: '#ffffff', fieldCardBgColor: '#ffffff',
  inputTextColor: '#0f172a', optionTextColor: '#334155', buttonSize: 'md',
  buttonVariant: 'solid', buttonRadius: 'md', buttonWidthPct: 100, formWidthPct: 100,
  titleColor: '#111827',           // 👈 add this

};

const DEFAULT_CONFIG = {
  submit: { redirectUrl: '', openInNewTab: false },
  email: { enabled:false, fromName:'', fromEmail:'', toFieldId:'', additionalTo:'', subject:'Thank you', body:'We received your response.'}
};


/* -------------------------------------------------------
   ICONS
------------------------------------------------------- */
const IconGrip = () => (
  <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="9" cy="7" r="1"/><circle cx="15" cy="7" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="17" r="1"/><circle cx="15" cy="17" r="1"/>
  </svg>
);
const IconImage = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeWidth="2" />
    <circle cx="8.5" cy="8.5" r="1.5" strokeWidth="2" />
    <polyline points="21 15 16 10 5 21" strokeWidth="2" />
  </svg>
);
const IconEye  = () => (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>);
const IconShare = () => (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12s-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.368a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"/></svg>);const IconSave  = () => (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7"/></svg>);
const IconTrash = () => (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 7h12M9 7v10m6-10v10M4 7h16l-1 12a2 2 0 01-2 2H7a2 2 0 01-2-2L4 7zM9 7V5a2 2 0 012-2h2a2 2 0 012 2v2"/></svg>);
const IconPlus  = () => (<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m7-7H5"/></svg>);
const IconDoc  = () => (<svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path fill="#fff" d="M14 2v6h6"/></svg>);
const IconLogout = () => (<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>);
const IconHome  = () => (<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l9-9 9 9M4 10v10a2 2 0 002 2h3m6 0h3a2 2 0 002-2V10"/></svg>);
const IconHash  = () => (<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M5 9h14M5 15h14M9 5v14M15 5v14"/></svg>);
const IconExternal = () => (<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M14 3h7v7M10 14L21 3M21 14v7h-7"/></svg>);
const IconCopy = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <rect x="9" y="9" width="10" height="10" rx="2" strokeWidth="2"/>
    <rect x="5" y="5" width="10" height="10" rx="2" strokeWidth="2"/>
  </svg>
);



/* -------------------------------------------------------
   TOOLBOX ITEM
------------------------------------------------------- */
const ToolboxItem = ({ type, label, icon, defaultData }) => {
  const onDragStart = (e) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type, label, ...defaultData }));
  };
  return (
    <button
      draggable
      onDragStart={onDragStart}
      className="w-full flex items-center gap-3 p-3 rounded-md bg-slate-800/70 text-slate-100 hover:bg-slate-700 border border-slate-700"
    >
      <div className="opacity-80">{icon}</div>
      <span className="text-sm font-medium">{label}</span>
      <span className="ml-auto text-slate-400"><IconGrip /></span>
    </button>
  );
};

/* -------------------------------------------------------
   FIELD RENDERERS (builder + preview)
------------------------------------------------------- */
const INPUT_BASE = "w-full px-3 py-2 border rounded-md focus:ring-2";
const FieldRenderer = ({ field, formStyles }) => {
  const labelColor      = field.labelColor      || formStyles.textColor;
  const inputTextColor  = field.inputTextColor  || formStyles.inputTextColor || '#0f172a';
  const optionTextColor = field.optionTextColor || formStyles.optionTextColor || formStyles.textColor;
  const bg              = field.bgColor         || formStyles.fieldBgColor    || '#f8fafc';
  const bdr             = field.borderColor     || formStyles.borderColor;

  const labelEl = (
    <div className="block text-sm font-medium mb-1" style={{ color: labelColor }}>
      <span>{field.label}</span>
      {field.required && <span className="text-red-500 ml-1">*</span>}
    </div>
  );

  switch (field.type) {
    case 'text':
      return (
        <div>
          {labelEl}
          <input disabled placeholder={field.placeholder || 'Enter text'}
            className="w-full px-3 py-2 rounded-lg border focus:outline-none"
            style={{ backgroundColor: bg, borderColor: bdr, color: inputTextColor }} />
        </div>
      );
    case 'email':
      return (
        <div>
          {labelEl}
          <input disabled type="email" placeholder={field.placeholder || 'name@example.com'}
            className="w-full px-3 py-2 rounded-lg border focus:outline-none"
            style={{ backgroundColor: bg, borderColor: bdr, color: inputTextColor }} />
        </div>
      );
    case 'textarea':
      return (
        
        <div>
          {labelEl}
          <textarea disabled placeholder={field.placeholder || 'Enter long text'} rows={3}
            className="w-full px-3 py-2 rounded-lg border focus:outline-none"
            style={{ backgroundColor: bg, borderColor: bdr, color: inputTextColor }} />
        </div>
        
      );
      

   case 'dropdown':
  return (
    <div>
      {labelEl}
      <select className="w-full px-3 py-2 rounded-lg border"
        style={{ backgroundColor: bg, borderColor: bdr, color: inputTextColor }}>
        {(field.options || []).map((o, i) => (
          <option key={i} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );

    
    case 'radio':
      return (
        <div>
          {labelEl}
          <div className="space-y-2 mt-2">
            {(field.options || []).map((o, i) => (
              <label key={i} className="flex items-center gap-2 text-sm" style={{ color: optionTextColor }}>
                <input disabled type="radio" className="h-4 w-4 border-slate-300" />
                {o}
              </label>
            ))}
          </div>
        </div>
      );
   case 'checkbox':
  return (
    <div>
      {labelEl}
      <div className="space-y-2 mt-2">
        {(field.options || []).map((o, i) => (
          <label key={i} className="flex items-center gap-2 text-sm" style={{ color: optionTextColor }}>
<input type="checkbox" className="h-4 w-4 rounded border-slate-300" />
          <span>{o}</span>
          </label>
        ))}
      </div>
    </div>
  );
    case 'date':
      return (
        <div>
          {labelEl}
          <input disabled type="date" className="w-full px-3 py-2 rounded-lg border"
            style={{ backgroundColor: bg, borderColor: bdr, color: inputTextColor }} />
        </div>
      );
    case 'file':
      return (
        <div>
          {labelEl}
          <input disabled type="file" className="w-full px-3 py-2 rounded-lg border"
            style={{ backgroundColor: '#ffffff', borderColor: bdr, color: inputTextColor }} />
        </div>
      );
    case 'phone':
      return (
        <div>
          {labelEl}
          <input disabled type="tel" placeholder={field.placeholder || '(555) 555-5555'}
            className="w-full px-3 py-2 rounded-lg border"
            style={{ backgroundColor: bg, borderColor: bdr, color: inputTextColor }} />
        </div>
      );
    case 'html':
      return (
        <div>
          <div className="text-sm font-medium mb-1" style={{ color: labelColor }}>
            {field.label}
          </div>
          <div className="p-3 rounded-md border prose max-w-none"
               style={{ borderColor: bdr, backgroundColor: bg }}
               dangerouslySetInnerHTML={{ __html: field.content }} />
        </div>
      );
    case 'button': {
      const sizeCls   = { sm:'py-1.5 text-sm', md:'py-2', lg:'py-3 text-base' }[formStyles.buttonSize || 'md'];
      const radiusCls = { sm:'rounded', md:'rounded-md', lg:'rounded-lg', full:'rounded-full' }[formStyles.buttonRadius || 'md'];
      const isOutline = (formStyles.buttonVariant || 'solid') === 'outline';
      const widthPct  = Number(formStyles.buttonWidthPct || 100);
      return (
        <div>
          <div className="invisible text-sm">Button</div>
          <div className="flex">
            <button type="button" className={`font-semibold border ${sizeCls} ${radiusCls}`}
              style={{ width: `${widthPct}%`, marginLeft: widthPct<100?'auto':0, marginRight: widthPct<100?'auto':0,
                ...(isOutline
                  ? { color: formStyles.primaryColor, borderColor: formStyles.primaryColor, backgroundColor: 'transparent' }
                  : { color: formStyles.buttonTextColor, borderColor: formStyles.primaryColor, backgroundColor: formStyles.primaryColor }) }}>
              {field.label}
            </button>
          </div>
        </div>
      );
    }
    default: return <p>Unknown field type: {field.type}</p>;
  }
};
const FieldRendererPreview = ({ field, formStyles }) => {
  const labelColor      = field.labelColor      || formStyles.textColor;
  const inputTextColor  = field.inputTextColor  || formStyles.inputTextColor || '#0f172a';
  const optionTextColor = field.optionTextColor || formStyles.optionTextColor || formStyles.textColor;
  const bg              = field.bgColor         || formStyles.fieldBgColor    || '#ffffff';
  const bdr             = field.borderColor     || formStyles.borderColor;

  const labelEl = (
    <label className="block text-sm font-medium mb-1" style={{ color: labelColor }}>
      {field.label} {field.required && <span className="text-red-500">*</span>}
    </label>
  );

  switch (field.type) {
    case 'text':
      return (
        <div>
          {labelEl}
          <input
            required={field.required}
            placeholder={field.placeholder || ''}
            className={INPUT_BASE}
            style={{ '--tw-ring-color': formStyles.primaryColor, borderColor: bdr, backgroundColor: bg, color: inputTextColor }}
          />
        </div>
      );

    case 'email':
      return (
        <div>
          {labelEl}
          <input
            type="email"
            required={field.required}
            placeholder={field.placeholder || 'name@example.com'}
            className={INPUT_BASE}
            style={{ '--tw-ring-color': formStyles.primaryColor, borderColor: bdr, backgroundColor: bg, color: inputTextColor }}
          />
        </div>
      );

    case 'textarea':
      return (
        <div>
          {labelEl}
          <textarea
            required={field.required}
            rows={3}
            placeholder={field.placeholder || ''}
            className={INPUT_BASE}
            style={{ '--tw-ring-color': formStyles.primaryColor, borderColor: bdr, backgroundColor: bg, color: inputTextColor }}
          />
        </div>
      );

    case 'dropdown':
      return (
        <div>
          {labelEl}
          <select
            className={INPUT_BASE}
            style={{ backgroundColor: bg, borderColor: bdr, color: inputTextColor }}
          >
            {(field.options || []).map((o, i) => (
              <option key={i} value={o}>{o}</option>
            ))}
          </select>
        </div>
      );

    case 'checkbox':
      return (
        <div>
          {labelEl}
          <div className="space-y-2 mt-2">
            {(field.options || []).map((o, i) => (
              <label key={i} className="flex items-center gap-2 text-sm" style={{ color: optionTextColor }}>
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300" />
                <span>{o}</span>
              </label>
            ))}
          </div>
        </div>
      );

    case 'radio':
      return (
        <div>
          {labelEl}
          <div className="space-y-2">
            {(field.options || []).map((o, i) => (
              <label key={i} className="flex items-center gap-2 text-sm" style={{ color: optionTextColor }}>
                <input name={`f-${field.id}`} type="radio" className="h-4 w-4 border-slate-300" />
                {o}
              </label>
            ))}
          </div>
        </div>
      );

    case 'date':
      return (
        <div>
          {labelEl}
          <input
            type="date"
            className="w-full px-3 py-2 border rounded-md focus:ring-2"
            style={{ '--tw-ring-color': formStyles.primaryColor, borderColor: bdr, backgroundColor: bg, color: inputTextColor }}
          />
        </div>
      );

    case 'file':
      return (
        <div>
          {labelEl}
          <input
            type="file"
            className="w-full px-3 py-2 border rounded-md focus:ring-2"
            style={{ '--tw-ring-color': formStyles.primaryColor, borderColor: bdr, backgroundColor: '#ffffff', color: inputTextColor }}
          />
        </div>
      );

    case 'phone':
      return (
        <div>
          {labelEl}
          <input
            type="tel"
            placeholder={field.placeholder || ''}
            className="w-full px-3 py-2 border rounded-md focus:ring-2"
            style={{ '--tw-ring-color': formStyles.primaryColor, borderColor: bdr, backgroundColor: bg, color: inputTextColor }}
          />
        </div>
      );

    case 'button': {
      const sizeCls   = { sm:'py-1.5 text-sm', md:'py-2', lg:'py-3 text-base' }[formStyles.buttonSize || 'md'];
      const radiusCls = { sm:'rounded', md:'rounded-md', lg:'rounded-lg', full:'rounded-full' }[formStyles.buttonRadius || 'md'];
      const isOutline = (formStyles.buttonVariant || 'solid') === 'outline';
      const widthPct  = Number(formStyles.buttonWidthPct || 100);
      return (
        <div>
          <div className="invisible text-sm">{field.label}</div>
          <div className="flex">
            <button
              className={`font-semibold border ${sizeCls} ${radiusCls}`}
              style={{
                width: `${widthPct}%`,
                marginLeft: widthPct < 100 ? 'auto' : 0,
                marginRight: widthPct < 100 ? 'auto' : 0,
                ...(isOutline
                  ? { color: formStyles.primaryColor, borderColor: formStyles.primaryColor, backgroundColor: 'transparent' }
                  : { backgroundColor: formStyles.primaryColor, color: formStyles.buttonTextColor, borderColor: formStyles.primaryColor })
              }}
              type="submit"
            >
              {field.label}
            </button>
          </div>
        </div>
      );
    }

    case 'html':
      return (
        <div>
          <div className="text-sm font-medium mb-1" style={{ color: labelColor }}>{field.label}</div>
          <div
            className="p-3 rounded-md border prose max-w-none"
            style={{ borderColor: bdr, backgroundColor: bg }}
            dangerouslySetInnerHTML={{ __html: field.content }}
          />
        </div>
      );

    default:
      return null;
  }
};


/* -------------------------------------------------------
   FORM FIELD CARD (draggable)
------------------------------------------------------- */
const FormField = ({ field, onRemove, onDragStart, onDrop, index, isSelected, onSelect, formStyles }) => (
  <div
    draggable
    onDragStart={(e)=>onDragStart(e,index)}
    onDrop={(e)=>onDrop(e,index)}
    onDragOver={(e)=>e.preventDefault()}
    onClick={(e)=>{e.stopPropagation(); onSelect(field.id);}}
     className="group relative p-4 border rounded-xl shadow-sm hover:shadow-md transition"
    
    style={{
  backgroundColor: formStyles.fieldCardBgColor,
  borderColor: formStyles.borderColor,
  '--field-card': formStyles.fieldCardBgColor,
  '--field-bg': formStyles.fieldBgColor,
  '--field-bdr': formStyles.borderColor,
  ...(isSelected ? { outline: '2px solid', outlineOffset: '2px', outlineColor: formStyles.primaryColor } : {})
}}

  >
    <div className="absolute left-3 top-3 opacity-60"><IconGrip/></div>
    <div className="pl-7">
      <FieldRenderer field={field} formStyles={formStyles} />
    </div>
    <button
      onClick={(e)=>{e.stopPropagation(); onRemove(field.id);}}
      className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1.5 shadow opacity-0 group-hover:opacity-100 transition"
      aria-label="Remove"
    >
      <IconTrash />
    </button>
  </div>
);


/* -------------------------------------------------------
   PANELS
------------------------------------------------------- */
function StylingPanel({ styles, setStyles, formTitle, setFormTitle }) {
  const uploadLogo = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onloadend = () => setStyles((p) => ({ ...p, logoUrl: r.result }));
    r.readAsDataURL(f);
  };

  const Row = ({ label, children }) => (
    <div className="mb-4">
      <div className="text-xs font-medium text-slate-500 mb-1">{label}</div>
      {children}
    </div>
  );

  const ColorPair = ({ value, onChange, inputClass = "" }) => (
    <div className={`flex items-center gap-2 ${inputClass}`}>
      <input value={value} onChange={onChange} className="px-2 py-1 text-sm border rounded-md w-28" />
      <input type="color" value={value} onChange={onChange} className="h-8 w-8 rounded border" />
    </div>
  );

  return (
    <div className="panel-scroll">
      <div className="text-sm font-semibold text-slate-700 mb-3">Form Styling</div>

      

      {/* THEME COLORS */}
      <Row label="Title Color">
  <ColorPair
    value={styles.titleColor ?? styles.textColor}
    onChange={(e) => setStyles((p) => ({ ...p, titleColor: e.target.value }))}
  />
</Row>

      <div className="mt-6">
        <div className="text-sm font-semibold text-slate-700 mb-2">Theme Colors</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Row label="Primary">
            <ColorPair value={styles.primaryColor} onChange={(e) => setStyles((p) => ({ ...p, primaryColor: e.target.value }))} />
          </Row>
          <Row label="Form Background">
            <ColorPair value={styles.backgroundColor} onChange={(e) => setStyles((p) => ({ ...p, backgroundColor: e.target.value }))} />
          </Row>
        </div>
      </div>

      {/* FIELD DEFAULTS */}
      <div className="text-sm font-semibold text-slate-700 mt-6 mb-2">Field Defaults</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Row label="Label color">
          <ColorPair value={styles.textColor} onChange={(e) => setStyles((p) => ({ ...p, textColor: e.target.value }))} />
        </Row>
        <Row label="Title color">
        <ColorPair value={styles.titleColor ?? styles.textColor}
          onChange={(e) => setStyles((p) => ({ ...p, titleColor: e.target.value }))} />
    </Row>

        <Row label="Input text">
          <ColorPair value={styles.inputTextColor ?? "#0f172a"} onChange={(e) => setStyles((p) => ({ ...p, inputTextColor: e.target.value }))} />
        </Row>
        <Row label="Options text">
          <ColorPair value={styles.optionTextColor ?? styles.textColor} onChange={(e) => setStyles((p) => ({ ...p, optionTextColor: e.target.value }))} />
        </Row>
        <Row label="Field bg (inputs)">
          <ColorPair value={styles.fieldBgColor ?? "#ffffff"} onChange={(e) => setStyles((p) => ({ ...p, fieldBgColor: e.target.value }))} />
        </Row>
        <Row label="Field border">
          <ColorPair value={styles.borderColor} onChange={(e) => setStyles((p) => ({ ...p, borderColor: e.target.value }))} />
        </Row>
        <Row label="Field card bg">
          <ColorPair value={styles.fieldCardBgColor ?? "#ffffff"} onChange={(e) => setStyles((p) => ({ ...p, fieldCardBgColor: e.target.value }))} />
        </Row>
      </div>

      {/* BUTTONS */}
      <div className="text-sm font-semibold text-slate-700 mt-6 mb-2">Buttons</div>
      <Row label="Button text">
        <ColorPair value={styles.buttonTextColor} onChange={(e) => setStyles((p) => ({ ...p, buttonTextColor: e.target.value }))} />
      </Row>

      <div className="mb-4">
        <div className="text-xs font-medium text-slate-500 mb-1">Size</div>
        <div className="grid grid-cols-3 gap-2">
          {["sm", "md", "lg"].map((s) => (
            <button
              key={s}
              onClick={() => setStyles((p) => ({ ...p, buttonSize: s }))}
              className={`px-3 py-1.5 border rounded-md text-sm ${styles.buttonSize === s ? "border-indigo-500 text-indigo-700 bg-indigo-50" : "hover:bg-slate-50"}`}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <div className="text-xs font-medium text-slate-500 mb-1">Variant</div>
        <div className="grid grid-cols-2 gap-2">
          {["solid", "outline"].map((v) => (
            <button
              key={v}
              onClick={() => setStyles((p) => ({ ...p, buttonVariant: v }))}
              className={`px-3 py-1.5 border rounded-md text-sm ${styles.buttonVariant === v ? "border-indigo-500 text-indigo-700 bg-indigo-50" : "hover:bg-slate-50"}`}
            >
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <div className="text-xs font-medium text-slate-500 mb-1">Corner radius</div>
        <select value={styles.buttonRadius || "md"} onChange={(e) => setStyles((p) => ({ ...p, buttonRadius: e.target.value }))} className="w-full px-3 py-2 border rounded-md">
          <option value="sm">Small</option>
          <option value="md">Medium</option>
          <option value="lg">Large</option>
          <option value="full">Full (pill)</option>
        </select>
      </div>

      <div className="mb-2">
        <div className="text-xs font-medium text-slate-500 mb-1">Width (%)</div>
        <input type="range" min="30" max="100" step="5" value={styles.buttonWidthPct ?? 100}
          onChange={(e) => setStyles((p) => ({ ...p, buttonWidthPct: Number(e.target.value) }))} className="w-full" />
        <div className="text-xs text-slate-500 mt-1">{styles.buttonWidthPct ?? 100}%</div>
      </div>

   <div className="text-sm font-semibold text-slate-700 mt-6 mb-2">Form Layout</div>
      <Row label="Max Width (%)">
        <input 
          type="range" 
          min="40" 
          max="100" 
          step="5" 
          value={styles.formWidthPct ?? 100}
          onChange={(e) => setStyles((p) => ({ ...p, formWidthPct: Number(e.target.value) }))} 
          className="w-full" 
        />
        <div className="text-xs text-slate-500 text-right">{styles.formWidthPct ?? 100}%</div>
      </Row>
  
      {/* TYPOGRAPHY */}
      <div className="text-sm font-semibold text-slate-700 mt-6">Typography</div>
      <Row label="Font Family">
        <select value={styles.fontFamily} onChange={(e) => setStyles((p) => ({ ...p, fontFamily: e.target.value }))} className="w-full px-3 py-2 border rounded-md">
          <option value="Inter, sans-serif">Inter</option>
          <option value="Arial, sans-serif">Arial</option>
          <option value="'Helvetica Neue', sans-serif">Helvetica Neue</option>
          <option value="'Times New Roman', serif">Times New Roman</option>
          <option value="Georgia, serif">Georgia</option>
          <option value="'Courier New', monospace">Courier New</option>
        </select>
      </Row>
    </div>
  );
}

/* FIELD SETTINGS (per-field) remains as before */
function FieldSettingsPanel({ field, updateField }) {
  if (!field) return <div className="text-sm text-slate-500">Select a field to edit settings.</div>;


  const setOpt = (i, val) => {
    const arr = [...(field.options || [])];
    arr[i] = val;
    updateField(field.id, { options: arr });
  };
  const addOpt = () =>
    updateField(field.id, { options: [...(field.options || []), `Option ${(field.options || []).length + 1}`] });
  const delOpt = (i) =>
    updateField(field.id, { options: (field.options || []).filter((_, x) => x !== i) });

  return (
    <div className="panel-scroll">
      <div className="text-sm font-semibold text-slate-700 mb-3">Field Settings</div>

      <div className="mb-3">
        <div className="text-xs font-medium text-slate-500 mb-1">Label</div>
        <input value={field.label} onChange={(e) => updateField(field.id, { label: e.target.value })} className="w-full px-3 py-2 border rounded-md" />
      </div>
 {/* --- ADD THIS BLOCK --- */}
      <div className="mb-3">
        <label className="text-xs font-medium text-slate-500 mb-1 block">
          Label Color (Optional)
        </label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={field.labelColor || '#000000'} // A fallback is needed for the color picker UI
            onChange={(e) => updateField(field.id, { labelColor: e.target.value })}
            className="h-8 w-10 rounded border p-0.5"
          />
          <input
            value={field.labelColor || ''}
            onChange={(e) => updateField(field.id, { labelColor: e.target.value })}
            placeholder="Default (e.g., #111827)"
            className="flex-1 px-2 py-1 text-sm border rounded-md"
          />
          <button 
            onClick={() => updateField(field.id, { labelColor: '' })} 
            className="text-xs text-slate-500 hover:text-slate-800"
            title="Reset to default color"
          >
            Reset
          </button>
        </div>
      </div>
      {(field.type === 'text' || field.type === 'textarea' || field.type === 'phone' || field.type==='email') && (
        <div className="mb-3">
          <div className="text-xs font-medium text-slate-500 mb-1">Placeholder</div>
          <input value={field.placeholder || ''} onChange={(e) => updateField(field.id, { placeholder: e.target.value })} className="w-full px-3 py-2 border rounded-md" />
        </div>
      )}

      {field.type !== 'button' && field.type !== 'html' && (
        <label className="flex items-center gap-2 text-sm mb-4">
          <input type="checkbox" checked={!!field.required} onChange={(e) => updateField(field.id, { required: e.target.checked })} />
          Required
        </label>
      )}

{(field.type === 'dropdown' || field.type === 'radio' || field.type === 'checkbox') && (        <div className="mb-4">
          <div className="text-xs font-medium text-slate-500 mb-2">Options</div>
          <div className="space-y-2">
            {(field.options || []).map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={o} onChange={(e) => setOpt(i, e.target.value)} className="flex-1 px-2 py-1 border rounded-md text-sm" />
                <button onClick={() => delOpt(i)} className="p-2 rounded-md border text-red-600 hover:bg-red-50">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M6 7h12M9 7v10m6-10v10M4 7h16l-1 12a2 2 0 01-2 2H7a2 2 0 01-2-2L4 7zM9 7V5a2 2 0 012-2h2a2 2 0 012 2v2" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
          <button onClick={addOpt} className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm hover:bg-slate-50">
            + Add option
          </button>
        </div>
      )}

      {field.type === 'html' && (
        <div className="mb-3">
          <div className="text-xs font-medium text-slate-500 mb-1">HTML Content</div>
          <textarea value={field.content} onChange={(e) => updateField(field.id, { content: e.target.value })} rows={6} className="w-full px-3 py-2 border rounded-md font-mono text-xs" />
        </div>
      )}
    </div>
  );
}


/* -------------------------------------------------------
   EMBED MODAL
------------------------------------------------------- */
const EmbedModal = ({ formId, forms, onClose }) => {
  const [copied, setCopied] = useState(false);

  // Find the form to embed from the forms array
  const formToEmbed = forms.find(f => f.id === formId);

  // Compress the form data into a URL-safe string
  const compressedData = LZString.compressToEncodedURIComponent(JSON.stringify(formToEmbed));

  // Create the new embed URL
  const embedUrl = `${window.location.origin}${window.location.pathname}#form-data/${compressedData}`;
  const embedCode = `<iframe src="${embedUrl}" width="100%" height="600" frameborder="0" title="Embedded Form"></iframe>`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(embedCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full">
        <div className="p-6 border-b">
          <h3 className="text-lg font-semibold text-slate-800">Embed Your Form</h3>
          <p className="text-sm text-slate-500 mt-1">Copy and paste this code into your website's HTML to display the form.</p>
        </div>
        <div className="p-6">
          <textarea readOnly value={embedCode} className="w-full p-3 font-mono text-xs border rounded-md bg-slate-50 h-32 resize-none" />
        </div>
        <div className="px-6 py-4 bg-slate-50 flex justify-end gap-3 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 rounded-md border text-sm font-medium hover:bg-slate-100">Close</button>
          <button onClick={copyToClipboard} className="px-4 py-2 rounded-md bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-700 w-28">
            {copied ? 'Copied!' : 'Copy Code'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------
   LOGIN
------------------------------------------------------- */
/* -------------------------------------------------------
   LOGIN
------------------------------------------------------- */
const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    const { error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) {
      setError(error.message);
    }
    // The main App component will handle switching the view on successful login
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      
      <div className="bg-white border rounded-2xl shadow-card w-full max-w-md p-8">
        <h2 className="text-2xl font-bold text-slate-900 text-center">Welcome back</h2>
        <p className="text-slate-500 text-center mt-1 mb-6 text-sm">Sign in to continue</p>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-sm text-slate-600">Email</label>
            <input 
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full px-3 py-2 border rounded-md" 
              placeholder="name@example.com"
            />
          </div>
          <div>
            <label className="text-sm text-slate-600">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full px-3 py-2 border rounded-md" 
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-red-100 border border-red-300 text-red-700 text-sm rounded-md p-3">
              {error}
            </div>
          )}

          <button 
            disabled={loading}
            className="w-full py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:bg-indigo-400"
          >
            {loading ? 'Signing in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
};
// ---- BatLogo (SVG) ----

/* -------------------------------------------------------
   NEW SVG LOGO COMPONENT
------------------------------------------------------- */
const SvgLogo = ({ size = 64 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Semi-transparent background circle */}
    <path 
      d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z" 
      fill="currentColor" 
      opacity="0.1"
    />
    {/* White middle part */}
    <path 
      d="M12.001 7.424L17.576 12 12.001 16.576 6.425 12 12.001 7.424z" 
      fill="#FFFFFF"
    />
    {/* Grey bottom part */}
    <path 
      d="M12.001 12.001L17.576 16.576 12.001 21.152 6.425 16.576 12.001 12.001z" 
      fill="#B0B0B0"
    />
    {/* Light grey top part */}
    <path 
      d="M12.001 2.848L6.425 7.424 12.001 12.001 17.576 7.424 12.001 2.848z" 
      fill="#E0E0E0"
    />
  </svg>
);


// ⬇️ add onLogout to props
const Sidebar = ({ current, onNavigate, formsCount = 0, onLogout }) => {
  const Item = ({ id, label, icon, badge }) => {
    const active = current === id;
    return (
      <button
        onClick={() => onNavigate?.(id)}
        className={`w-full flex items-center gap-2.5 px-3 py-2 mx-3 rounded-lg text-sm
          ${active ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'}
        `}
      >
        <span className="opacity-90">{icon}</span>
        <span className="flex-1 text-left truncate">{label}</span>
        {typeof badge === 'number' && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-md 
            ${active ? 'bg-white/20 text-white' : 'bg-white/10 text-slate-200'}`}>
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside className="app-sidebar w-56 bg-[#0b1220] text-slate-200 flex flex-col border-r border-white/10">
      {/* centered logo */}
      <div className="flex items-center justify-center py-5">
        <div className="rounded-full bg-white/10 p-2">
          <SvgLogo size={28} />
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto pb-6 no-scrollbar">
  <Item id="dashboard" label="Dashboard" icon={<IconHome/>} />
  <Item id="forms" label="Forms" icon={<IconHash/>} badge={formsCount} />
  <Item id="media" label="Media" icon={<IconImage/>} />
</div>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-white/10">
        <button
          onClick={onLogout}                               
          className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-300 hover:text-white"
        >
          <IconLogout /> Logout
        </button>
      </div>
    </aside>
  );
};

 const DashboardHeader = () => (
  <header className="h-14 sticky top-0 z-40 flex items-center border-b border-slate-800 px-6 bg-slate-900 text-white">
    <div className="ml-auto" />
  </header>
);


const DashboardPage = ({ forms, createNewForm, editForm, previewForm, duplicateForm, deleteForm, shareForm, onLogout }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('forms'); // State to control the view

  const filteredForms = forms.filter(form =>
    (form.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (form.title?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen grid grid-cols-[14rem_1fr]">
      <Sidebar 
        current={activeTab} 
        onNavigate={setActiveTab}
        formsCount={forms.length} 
        onLogout={onLogout} 
      />

      <div className="bg-slate-50">
        <div className="p-6">
          
          {/* --- FORMS VIEW --- */}
          {activeTab === 'forms' && (
            <div className="bg-white border rounded-xl shadow-card">
              {/* Header */}
              <div className="px-6 py-4 border-b">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-800">Forms</h2>
                    <p className="text-sm text-slate-500">
                      Showing {filteredForms.length} of {forms.length} forms.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                     <input
                      type="text"
                      placeholder="Search forms..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="px-3 py-1.5 border rounded-md text-sm w-64"
                    />
                    <button onClick={createNewForm} className="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 whitespace-nowrap">
                      + New Form
                    </button>
                  </div>
                </div>
              </div>

              {/* Form List */}
              <div className="divide-y">
                {filteredForms.length === 0 ? (
                  <div className="p-10 text-center text-slate-500 text-sm">
                    {searchQuery ? `No forms found for "${searchQuery}".` : "No forms yet. Create your first form."}
                  </div>
                ) : (
                  filteredForms.map(f => (
                    <div key={f.id} className="px-6 py-4 flex items-center gap-3 hover:bg-slate-50">
                      <span className="h-8 w-8 rounded bg-slate-100 grid place-items-center"><IconDoc/></span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-800 truncate">{f.name}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                          <span>Title: {f.title}</span>
                          <span className="text-slate-300">•</span>
                          <span>{Array.isArray(f.fields) ? f.fields.length : 0} fields</span>
                          <span className="text-slate-300">•</span>
                          <span>Created: {new Date(f.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={(e)=>{e.stopPropagation(); shareForm(f.id);}} className="p-2 border rounded text-xs hover:bg-slate-100" title="Share/Embed"><IconShare/></button>
                        <button onClick={(e)=>{e.stopPropagation(); previewForm(f.id);}} className="p-2 border rounded text-xs hover:bg-slate-100" title="Preview"><IconEye/></button>
                        <button onClick={(e)=>{e.stopPropagation(); editForm(f.id);}} className="px-3 py-1.5 border rounded text-xs hover:bg-slate-100">Edit</button>
                        <button onClick={(e)=>{e.stopPropagation(); duplicateForm(f.id);}} className="p-2 border rounded text-xs hover:bg-slate-100" title="Duplicate"><IconCopy/></button>
                        <button onClick={(e)=>{e.stopPropagation(); deleteForm(f.id);}} className="p-2 border rounded text-xs text-red-600 hover:bg-red-50" title="Delete"><IconTrash/></button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* --- MEDIA VIEW --- */}
          {activeTab === 'media' && (
            <SupabaseFileUploader />
          )}

        </div>
      </div>
    </div>
  );
};
/* -------------------------------------------------------
/* -------------------------------------------------------
   BUILDER (tabs: SETTINGS · BUILD · STYLING)
------------------------------------------------------- */
/* -------------------------------------------------------
   BUILDER (tabs: SETTINGS · BUILD · STYLING)
------------------------------------------------------- */
const FormBuilderPage = ({ initialForm, saveForm, saveAndExit, backToDashboard, previewForm }) => {
  const [fields, setFields] = useState(asArray(initialForm.fields));
  const [formTitle, setFormTitle] = useState(initialForm.title);
  const [formName, setFormName] = useState(initialForm.name);
  const [formStyles, setFormStyles] = useState(asObject(initialForm.styles, DEFAULT_STYLES));
  const [formConfig, setFormConfig] = useState(asObject(initialForm.config, DEFAULT_CONFIG));
  
  const [selectedFieldId, setSelectedFieldId] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState('build');
  const dragIdx = useRef(null);

  const updateField = useCallback((id, patch) => setFields(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f)), []);
  const removeField = useCallback((id) => { setFields(prev => prev.filter(f => f.id !== id)); if (selectedFieldId === id) setSelectedFieldId(null); }, [selectedFieldId]);

  const addFromToolbox = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const data = JSON.parse(e.dataTransfer.getData('application/json'));
    const newField = { id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, ...data };
    setFields(prev => [...prev, newField]);
    setSelectedFieldId(newField.id);
  }, []);

  const onDragStartExisting = (e, i) => { dragIdx.current = i; };
  const onDropExisting = (e, i) => {
    e.preventDefault();
    const list = [...fields];
    const item = list.splice(dragIdx.current, 1)[0];
    list.splice(i, 0, item);
    dragIdx.current = null;
    setFields(list);
  };
  
  const handleUndo = () => {
    setFields(asArray(initialForm.fields));
    setFormStyles(asObject(initialForm.styles, DEFAULT_STYLES));
    setFormTitle(initialForm.title);
    setFormName(initialForm.name);
    setFormConfig(asObject(initialForm.config, DEFAULT_CONFIG));
  };

  const selectedField = Array.isArray(fields) ? fields.find(f => f.id === selectedFieldId) : null;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Top Bar */}
      <div className="bg-gray-900 text-white shadow-md">
        <div className="max-w-full mx-auto px-6 h-14 grid grid-cols-3 items-center">
          <div className="flex items-center gap-3" />
          <div className="flex justify-center items-center gap-4">
            <div className="flex items-center gap-8">
              {['settings', 'build', 'styling'].map(t => (
                <button key={t} onClick={() => setActiveTab(t)} className={`uppercase text-sm tracking-wide transition ${activeTab === t ? 'text-cyan-400 border-b-2 border-cyan-400 pb-1' : 'text-gray-300 hover:text-white'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end items-center gap-2">
            <button onClick={backToDashboard} className="px-3 py-1.5 rounded-md border text-sm hover:bg-slate-100">Back</button>
            <button onClick={() => previewForm({ ...initialForm, name: formName, title: formTitle, fields, styles: formStyles, config: formConfig })} className="px-3 py-1.5 rounded-md border text-sm hover:bg-slate-100 flex items-center gap-2">
              <IconEye /> Preview
            </button>
            <button onClick={() => saveForm({ ...initialForm, name: formName, title: formTitle, fields, styles: formStyles, config: formConfig })} className="px-3 py-1.5 rounded-md border text-sm hover:bg-slate-100">Save</button>
            <button onClick={() => saveAndExit({ ...initialForm, name: formName, title: formTitle, fields, styles: formStyles, config: formConfig })} className="px-4 py-1.5 rounded-md bg-indigo-600 text-sm font-medium text-white transition hover:bg-indigo-700">Save & Exit</button>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="builder-grid grid gap-4 p-4 flex-1 max-w-full">
        {/* Left Panel (Toolbox) */}
        {(activeTab === 'build' || activeTab === 'styling') && (
          <aside className="builder-left bg-slate-900 rounded-xl shadow-card border border-slate-800">
            <div className="p-3 space-y-2">
              <ToolboxItem type="text" label="Text" icon={<IconDoc />} defaultData={{ label: 'Text', placeholder: 'Enter text' }} />
              <ToolboxItem type="email" label="Email" icon={<IconDoc />} defaultData={{ label: 'Email', placeholder: 'name@example.com' }} />
              <ToolboxItem type="textarea" label="Textarea" icon={<IconDoc />} defaultData={{ label: 'Message', placeholder: 'Enter message' }} />
              <ToolboxItem type="dropdown" label="Dropdown" icon={<IconDoc />} defaultData={{ label: 'Select one', options: ['Option 1', 'Option 2'] }} />
              <ToolboxItem type="radio" label="Radio" icon={<IconDoc />} defaultData={{ label: 'Choose one', options: ['A', 'B'] }} />
              <ToolboxItem type="checkbox" label="Checkbox Group" icon={<IconDoc />} defaultData={{ label: 'Select choices', options: ['Choice 1', 'Choice 2'], required: false }} />
              <ToolboxItem type="date" label="Date" icon={<IconDoc />} defaultData={{ label: 'Date' }} />
              <ToolboxItem type="file" label="File" icon={<IconDoc />} defaultData={{ label: 'Upload file' }} />
              <ToolboxItem type="phone" label="Phone" icon={<IconDoc />} defaultData={{ label: 'Phone', placeholder: '(555) 555-5555' }} />
              <ToolboxItem type="html" label="HTML Block" icon={<IconDoc />} defaultData={{ label: 'Rich content', content: '<p>Add HTML here</p>' }} />
              <ToolboxItem type="button" label="Submit Button" icon={<IconDoc />} defaultData={{ type: 'button', label: 'Submit' }} />
            </div>
          </aside>
        )}

        {/* Center Canvas */}
        <main
          className={`builder-main rounded-xl shadow-card border p-6 panel-scroll ${dragOver ? 'ring-2 ring-cyan-400' : ''} ${activeTab === 'settings' ? 'col-span-3' : ''}`}
          onDrop={activeTab === 'build' ? addFromToolbox : undefined}
          onDragOver={activeTab === 'build' ? (e) => { e.preventDefault(); setDragOver(true); } : undefined}
          onDragLeave={activeTab === 'build' ? () => setDragOver(false) : undefined}
          style={{ 
            fontFamily: formStyles.fontFamily, 
            backgroundColor: activeTab !== 'settings' ? formStyles.backgroundColor : '#ffffff',
          }}
          onClick={() => { setSelectedFieldId(null); }}
        >
          {/* BUILD CANVAS */}
          {activeTab === 'build' && (
            <div className="mx-auto" style={{ maxWidth: `${formStyles.formWidthPct || 100}%` }}>
              {formStyles.logoUrl && <img alt="logo" src={formStyles.logoUrl} className="max-h-16 object-contain mx-auto mb-4" />}
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold" style={{ color: formStyles.titleColor || formStyles.textColor }}>
                  {formTitle}
                </h1>
              </div>
              <div className="space-y-4">
                {fields.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-400 border-2 border-dashed rounded-xl">
                    <svg className="w-20 h-20 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
                    <p className="font-medium">Drag components here</p>
                  </div>
                ) : fields.map((field, i) => (
                  <FormField key={field.id} index={i} field={field} onRemove={removeField} onDragStart={onDragStartExisting} onDrop={onDropExisting} isSelected={selectedFieldId === field.id} onSelect={setSelectedFieldId} formStyles={formStyles} />
                ))}
              </div>
            </div>
          )}

          {/* STYLING PREVIEW */}
          {activeTab === 'styling' && (
            <div className="mx-auto rounded-2xl shadow-lg p-6 sm:p-8 h-full overflow-y-auto" style={{ maxWidth: `${formStyles.formWidthPct || 100}%`, backgroundColor: formStyles.backgroundColor }}>
              {formStyles.logoUrl && <img src={formStyles.logoUrl} alt="logo" className="max-h-16 mx-auto mb-6" />}
              <h1 className="text-2xl font-bold text-center mb-6" style={{ color: formStyles.titleColor || formStyles.textColor }}>
                {formTitle}
              </h1>
              <div className="space-y-4">
                {fields.length === 0 ? (
                  <div className="text-center text-slate-400 text-sm py-10">Add fields in the 'Build' tab to see them here.</div>
                ) : (
                  fields.map((f) => (
                    <div key={f.id} className="p-4 border rounded-xl shadow-sm" style={{ backgroundColor: formStyles.fieldCardBgColor, borderColor: formStyles.borderColor }}>
                      <FieldRendererPreview field={f} formStyles={formStyles} />
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* SETTINGS VIEW */}
          {activeTab === 'settings' && (
             <div className="mx-auto max-w-5xl space-y-8">
              <div className="text-center mb-6"><h1 className="text-2xl font-bold text-slate-900">{formTitle}</h1></div>
              <section className="bg-white border rounded-2xl shadow-sm p-6">
                <div className="grid sm:grid-cols-2 gap-6">
                  <div>
                    <label className="text-xs font-medium text-slate-600">Form Name (Internal)</label>
                    <input value={formName} onChange={(e) => setFormName(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-lg"/>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">Display Title (Public)</label>
                    <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-lg"/>
                  </div>
                </div>
              </section>
              <section className="bg-white border rounded-2xl shadow-sm p-6">
                <div className="text-sm font-semibold text-slate-800 mb-3">Submission Behavior</div>
                <div className="grid sm:grid-cols-2 gap-6">
                  <div>
                    <label className="text-xs font-medium text-slate-600">Redirect URL (optional)</label>
                    <input type="url" placeholder="https://example.com/thank-you" value={formConfig.submit.redirectUrl} onChange={(e) => setFormConfig((c) => ({ ...c, submit: { ...c.submit, redirectUrl: e.target.value } }))} className="mt-1 w-full px-3 py-2 border rounded-lg"/>
                  </div>
                  <div className="flex items-end">
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={formConfig.submit.openInNewTab} onChange={(e) => setFormConfig((c) => ({ ...c, submit: { ...c.submit, openInNewTab: e.target.checked } }))} />
                      Open redirect in a new tab
                    </label>
                  </div>
                </div>
              </section>
            </div>
          )}
        </main>

        {/* Right Panel */}
        {(activeTab === 'build' || activeTab === 'styling') && (
          <aside className="builder-right bg-white rounded-xl shadow-card border">
            <div className="p-4 h-full">
              {activeTab === 'build' && <FieldSettingsPanel field={selectedField} updateField={updateField} />}
{activeTab === 'styling' && <StylingPanel styles={formStyles} setStyles={setFormStyles} />}            </div>
          </aside>
        )}
      </div>
    </div>
  );
};

const PreviewPage = ({ previewData, exitPreview }) => {
  return (
    <div
      className="min-h-screen p-6"
     style={{
  fontFamily: previewData.styles.fontFamily,
  backgroundColor: previewData.styles.backgroundColor,

  '--studio-bg': previewData.styles.backgroundColor,
  '--field-bg': previewData.styles.fieldBgColor,
  '--field-bdr': previewData.styles.borderColor,
}}

    >
      <div
        className="max-w-2xl mx-auto border rounded-2xl shadow-card p-8"
        // The outer form container uses the card + border colors
        style={{
          backgroundColor: previewData.styles.fieldCardBgColor,
          borderColor: previewData.styles.borderColor
        }}
      >
        {previewData.styles.logoUrl && (
          <img src={previewData.styles.logoUrl} alt="logo" className="max-h-16 mx-auto mb-6" />
        )}

        <h1
          className="text-2xl font-bold text-center mb-6"
          style={{ color: previewData.styles.titleColor || previewData.styles.textColor }}
        >
          {previewData.title}
        </h1>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            alert('Form submitted!');
          }}
        >
          {previewData.fields.map((f) => (
            <div
              key={f.id}
              className="p-4 border rounded-xl shadow-sm"
              style={{
  backgroundColor: previewData.styles.fieldCardBgColor,
  borderColor: previewData.styles.borderColor,
  '--field-bg': previewData.styles.fieldBgColor,
  '--field-bdr': previewData.styles.borderColor,
}}
            >
              <FieldRendererPreview field={f} formStyles={previewData.styles} />
            </div>
          ))}
        </form>
      </div>

      <div className="text-center mt-6">
        <button
          onClick={exitPreview}
          className="px-5 py-2 rounded-md border bg-white hover:bg-slate-50"
        >
          Exit Preview
        </button>
      </div>
    </div>
  );
};

 



/* -------------------------------------------------------
   MAIN APP CONTROLLER
------------------------------------------------------- */
function App() {
  const [session, setSession] = useState(null);
  const [view, setView] = useState('dashboard'); // Default to dashboard, session check will handle login
  const [forms, setForms] = useState([]);
  const [currentFormId, setCurrentFormId] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [builderDraft, setBuilderDraft] = useState(null);
  const [embedModalFormId, setEmbedModalFormId] = useState(null);
  const [publicFormData, setPublicFormData] = useState(null);

  // --- Main Effect: Manages the user session ---
  useEffect(() => {
    // Check for an active session when the app loads
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Listen for changes in authentication state (login, logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (_event === 'SIGNED_IN') {
        setView('dashboard'); // Go to dashboard on login
      }
    });

    // Cleanup the listener when the component unmounts
    return () => subscription.unsubscribe();
  }, []);


  // --- Second Effect: Handles routing and fetching initial data from Supabase ---
  useEffect(() => {
    // This effect should only run if the user is logged in.
    if (!session) return;

    const hash = window.location.hash;

    if (hash.startsWith('#form-data/')) {
      try {
        const compressed = hash.substring(11); // Length of '#form-data/'
        const decompressed = LZString.decompressFromEncodedURIComponent(compressed);
        const formData = JSON.parse(decompressed);
        if (formData) {
          setPublicFormData(formData);
          setView('public_form');
        }
      } catch (e) {
        console.error("Failed to parse form data from URL", e);
      }
    } else {
      const fetchForms = async () => {
        const { data, error } = await supabase
          .from('forms')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching forms:', error);
        } else {
          const normalized = (data || []).map(f => ({
            ...f,
            fields: asArray(f.fields),
            styles: asObject(f.styles, DEFAULT_STYLES),
            config: asObject(f.config, DEFAULT_CONFIG),
          }));
          setForms(normalized);
        }
      };

      fetchForms();
      // Still use localStorage for non-critical UI state
      setView(localStorage.getItem('view') || 'dashboard'); // Default to dashboard now
      setCurrentFormId(localStorage.getItem('currentFormId'));
    }
  }, [session]); // Re-run this effect when the session changes

  // Persist UI state to localStorage
  useEffect(() => {
    if (view !== 'public_form') localStorage.setItem('view', view);
  }, [view]);

  useEffect(() => {
    if (currentFormId) {
      localStorage.setItem('currentFormId', currentFormId);
    } else {
      localStorage.removeItem('currentFormId');
    }
  }, [currentFormId]);


  // --- All functions below now use async/await to talk to Supabase ---

  const createNewForm = async () => {
    const newFormObject = {
      name: 'Untitled Form',
      title: 'Untitled Form',
      fields: [],
      styles: {
        titleColor: '#111827',
        primaryColor: '#6366f1', fontFamily: 'Inter, sans-serif', backgroundColor: '#ffffff',
        textColor: '#111827', borderColor: '#d1d5db', buttonTextColor: '#ffffff',
        logoUrl: null, fieldBgColor: '#ffffff', fieldCardBgColor: '#ffffff',
        inputTextColor: '#0f172a', optionTextColor: '#334155', buttonSize: 'md',
        buttonVariant: 'solid', buttonRadius: 'md', buttonWidthPct: 100, formWidthPct: 100,
      },
      config: { 
        submit: { redirectUrl: '', openInNewTab: false }, 
        email: { enabled:false, fromName:'', fromEmail:'', toFieldId:'', additionalTo:'', subject:'Thank you', body:'We received your response.'}
      }
    };

    const { data, error } = await supabase.from('forms').insert(newFormObject).select().single();
    
    if (error) {
      console.error('Error creating form:', error);
    } else {
      setForms(prev => [data, ...prev]);
      setCurrentFormId(data.id);
      setBuilderDraft(null);
      setView('builder');
    }
  };

  const saveForm = async (updated) => {
    const { id, created_at, ...formToUpdate } = updated; // Exclude read-only fields
    const { data, error } = await supabase.from('forms').update(formToUpdate).eq('id', id).select().single();
    
    if (error) {
      console.error('Error updating form:', error);
    } else {
      setForms(prev => prev.map(f => f.id === data.id ? data : f));
      if (builderDraft?.id === data.id) setBuilderDraft(null);
    }
  };
  
  const saveAndExit = async (updated) => {
    await saveForm(updated);
    setBuilderDraft(null);
    setView('dashboard');
  };

  const deleteForm = async (id) => {
    const { error } = await supabase.from('forms').delete().eq('id', id);
    if (error) {
      console.error('Error deleting form:', error);
    } else {
      setForms(prev => prev.filter(f => f.id !== id));
      if (builderDraft?.id === id) setBuilderDraft(null);
      if (currentFormId === id) setCurrentFormId(null);
    }
  };

  const duplicateForm = async (id) => {
    const original = forms.find(f => f.id === id);
    if (!original) return;

    // Create a copy, removing database-generated fields
    const { id: originalId, created_at, ...formToCopy } = original;
    
    formToCopy.name = original.name.endsWith(' (Copy)') ? original.name : `${original.name} (Copy)`;

    const { data, error } = await supabase.from('forms').insert(formToCopy).select().single();

    if (error) {
      console.error('Error duplicating form:', error);
    } else {
      setForms(prev => [data, ...prev]);
    }
  };

  const editForm = (id) => { 
    setCurrentFormId(id); 
    setBuilderDraft(null); 
    setView('builder'); 
  };
  
  const shareForm = (id) => { setEmbedModalFormId(id); };

  const startPreviewFromBuilder   = (state)=>{ setPreviewData(state); setView('preview'); };
  const exitPreview = ()=>{ setPreviewData(null); setView(currentFormId ? 'builder' : 'dashboard'); };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    // The auth listener will set the session to null, automatically showing the login page.
    localStorage.removeItem('view');
    localStorage.removeItem('currentFormId');
    setCurrentFormId(null);
    setEmbedModalFormId(null);
    setPreviewData(null);
    setBuilderDraft(null);
    setPublicFormData(null);
    setView('login'); // Explicitly set view to login on logout
  };

  const currentFormForBuilder = builderDraft || forms.find(f => f.id === currentFormId);

  // --- RENDER LOGIC ---
  if (!session) {
    return <LoginPage />;
  }
if (view === 'public_form') {
  if (!publicFormData) {
    return <div className="p-8 text-center font-sans">Form not found or URL is invalid.</div>;
  }
  return (
    <div
      className="min-h-screen p-4 sm:p-6"
      style={{
        fontFamily: publicFormData.styles.fontFamily,
        backgroundColor: publicFormData.styles.backgroundColor
      }}
    >
      <div
        className="mx-auto border rounded-2xl shadow-lg p-6 sm:p-8"
        style={{
          maxWidth: `${publicFormData.styles.formWidthPct || 100}%`,
          backgroundColor: publicFormData.styles.fieldCardBgColor,
          borderColor: publicFormData.styles.borderColor
        }}
      >
        {publicFormData.styles.logoUrl && (
          <img src={publicFormData.styles.logoUrl} alt="logo" className="max-h-16 mx-auto mb-6" />
        )}

        <h1
          className="text-2xl font-bold text-center mb-6"
          style={{ color: publicFormData.styles.titleColor || publicFormData.styles.textColor }}
        >
          {publicFormData.title}
        </h1>

        <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
          {Array.isArray(publicFormData.fields) &&
            publicFormData.fields.map((f) => (
              <FieldRendererPreview key={f.id} field={f} formStyles={publicFormData.styles} />
            ))}
        </form>
      </div>
    </div>
  );
} // ✅ this closes the if (view === 'public_form') block




  if (view === 'login') return <LoginPage onLogin={() => setView('dashboard')} />;

  if (view === 'dashboard') {
    return (
      <>
        {embedModalFormId && <EmbedModal formId={embedModalFormId} forms={forms} onClose={() => setEmbedModalFormId(null)} />}
  <DashboardPage
  forms={forms}
  createNewForm={createNewForm}
  editForm={editForm}
  deleteForm={deleteForm}
  shareForm={shareForm}
  duplicateForm={duplicateForm}
  onLogout={handleLogout}     // ⬅️ NEW
  previewForm={(id) => {
    const f = forms.find(x => x.id === id);
    if (f) {
      setBuilderDraft(null);
      setPreviewData(f);
      setView('preview');
    }
  }}
/>

      </>
    );
  }

if (view === 'builder' && currentFormForBuilder) {
    return <FormBuilderPage 
             initialForm={currentFormForBuilder} 
             saveForm={saveForm} 
             saveAndExit={saveAndExit} 
             backToDashboard={() => { setCurrentFormId(null); setView('dashboard'); }} 
             previewForm={startPreviewFromBuilder} 
           />;
  }
if(view==='preview' && previewData){
    return <PreviewPage previewData={previewData} exitPreview={exitPreview} />;
  }

  return <LoginPage onLogin={() => setView('dashboard')} />;
}

/* -------------------------------------------------------
   Error Boundary wrapper
------------------------------------------------------- */
class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state = { hasError:false, err:null }; }
  static getDerivedStateFromError(err){ return { hasError:true, err }; }
  render(){
    if (this.state.hasError) {
      return (<div style={{padding:16,fontFamily:'monospace'}}><h3>App crashed</h3><pre style={{whiteSpace:'pre-wrap'}}>{String(this.state.err)}</pre></div>);
    }
    return this.props.children;
  }
}


// keep this single definition
export default function AppWrapper(){
  return (
    <div className="ui-fix">    {/* scope wrapper */}
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </div>
  );
}


