import React, { useState, useCallback, useRef, useEffect } from 'react';
import './index.css'; 
import './App.css'; 
import { supabase } from './supabaseClient';
import SupabaseFileUploader from './SupabaseFileUploader.jsx';
import LZString from 'lz-string';
// ---- Normalizers & defaults (ADD THIS) ----
// Normalizers
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

// Styles (single source of truth)
const DEFAULT_STYLES = {
  primaryColor: '#6366f1',
  fontFamily: 'Inter, sans-serif',
  backgroundColor: '#ffffff',     // page bg
  textColor: '#111827',
  borderColor: '#d1d5db',
  buttonTextColor: '#ffffff',
  logoUrl: null,
  fieldBgColor: '#ffffff',        // input bg
  fieldCardBgColor: '#ffffff',    // card/panel bg
  inputTextColor: '#0f172a',
  optionTextColor: '#334155',
  buttonSize: 'md',
  buttonVariant: 'solid',
  buttonRadius: 'md',
  buttonWidthPct: 100,
  formWidthPct: 100,
  titleColor: '#111827',          // used for form title
};

const DEFAULT_CONFIG = {
  submit: { redirectUrl: '', openInNewTab: false },
  email: {
    enabled: false,
    fromName: '',
    fromEmail: '',
    toFieldId: '',
    additionalTo: '',
    subject: 'Thank you',
    body: 'We received your response.'
  }
};

// --- Robust AI call helper ---
async function callAiBuilder(userPrompt) {
  const BASE = import.meta.env.VITE_AI_BASE || "http://localhost:4000";
  let res;
  try {
    res = await fetch(`${BASE}/api/build-form`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: userPrompt }),
    });
  } catch (e) {
    throw new Error(`Network error: ${e.message}`);
  }

  // Some servers return text on error; read as text then try JSON.
  const raw = await res.text();
  let data;
  try { data = JSON.parse(raw); } 
  catch { throw new Error(`Bad JSON from AI service: ${raw.slice(0, 160)}…`); }

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  // data.text is the LLM's JSON-as-string (possibly fenced)
  return data.text;
}

// --- Color + prompt parsing helpers ---
const COLOR_MAP = {
  yellow: '#fde047',  // you can tweak these brand shades
  blue:   '#60a5fa',
  green:  '#34d399',
  red:    '#f87171',
  grey:'#94a3b8', 
  purple: '#c084fc',
  gray:   '#94a3b8',
  black:  '#000000',
  white:  '#ffffff',
  orange: '#fb923c',
  pink:   '#f472b6',
};

 // Accept any valid CSS color (named, hex, rgb/rgba, hsl/hsla)
 const isValidCssColor = (c) => {
   if (!c) return false;
   const el = document.createElement('option');
   el.style.color = '';
   el.style.color = String(c).trim();
   return el.style.color !== '';
 };

const toColor = (token) => {
  if (!token) return null;
let t = token.trim().toLowerCase();
 if (t === 'transparent') return t;
  // hex
 if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(t)) return t;
  // rgb/rgba/hsl/hsla or any named color ("navy", "teal", etc.)
  if (isValidCssColor(t)) return t;
  // try collapsing spaces (e.g., "light blue" -> "lightblue")
 const collapsed = t.replace(/\s+/g, '');
 if (collapsed !== t && isValidCssColor(collapsed)) return collapsed;
  // fallback to our small map of brandy shades
  return COLOR_MAP[t] || null;
};

// Find the FIRST *valid* color near a keyword, skipping filler words ("should be", etc.)
// Find the FIRST *valid* color near a keyword, prioritizing words that come BEFORE the keyword.
const pickColorAround = (pattern, text, preferForward = false) => {  const re = new RegExp(pattern, 'ig');
  const TOKEN_RX = /(#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-zA-Z]+)/ig;
  let m;
  while ((m = re.exec(text))) {
    const idx = m.index;
    const hit = m[0];
    const ahead = text.slice(idx + hit.length, idx + hit.length + 100);
    const behind = text.slice(Math.max(0, idx - 100), idx);

     const scanForward = () => {
      const forward = [...ahead.matchAll(TOKEN_RX)];
      for (const t of forward) {
        const c = toColor(t[0].trim());
        if (c) return c;
      }
      return null;
    };
    const scanBackward = () => {
      const backward = [...behind.matchAll(TOKEN_RX)];
      for (let i = backward.length - 1; i >= 0; i--) {
        const c = toColor(backward[i][0].trim());
        if (c) return c;
      }
      return null;
    };
    // Heuristic: if caller asks to prefer forward (e.g., "label color grey"),
    // do that first; otherwise try backward first (e.g., "blue background").
    const first = preferForward ? scanForward() : scanBackward();
    if (first) return first;
    const second = preferForward ? scanBackward() : scanForward();
    if (second) return second;

  }
  return null;
};
// One-token color capture: hex | rgba(...) | hsla(...) | named word
const COLOR_TOKEN_RX_STR = '(#[0-9a-f]{3,8}|rgba?\\([^)]+\\)|hsla?\\([^)]+\\)|[a-zA-Z]+)';

// Build a RegExp that matches common phrasings like:
// - set <target> to <color>
// - make <target> <color>
// - <target> is/should be/:/= <color>
// - <color> for/on/in the <target>
// - <target> in/on <color>
const buildAssignmentPatterns = (targetRe) => [
  // Most common authoring: "title color red", "label color grey", "header color #333"
  new RegExp(`\\b${targetRe}\\s*color\\s*${COLOR_TOKEN_RX_STR}\\b`, 'i'),
  // Direct adjacency: "title red" (rare, but easy to support)
  new RegExp(`\\b${targetRe}\\s*${COLOR_TOKEN_RX_STR}\\b`, 'i'),
  // Verbal assignments
  new RegExp(`\\b(?:set|make)\\s+(?:the\\s+)?${targetRe}\\s+(?:to\\s+)?${COLOR_TOKEN_RX_STR}\\b`, 'i'),
  new RegExp(`\\b${targetRe}\\s*(?:is|=|:|should\\s*be|be)\\s*${COLOR_TOKEN_RX_STR}\\b`, 'i'),
  // Prepositional
  new RegExp(`\\b${COLOR_TOKEN_RX_STR}\\s+(?:for|on|in)\\s+(?:the\\s+)?${targetRe}\\b`, 'i'),
  new RegExp(`\\b${targetRe}\\s+(?:in|on)\\s+${COLOR_TOKEN_RX_STR}\\b`, 'i'),
];

// Try “assignment” capture first; if none, fall back to nearest-color heuristic.
const resolveColorFor = (prompt, targetRe, fallbackPattern, preferForward = false) => {
  const patterns = buildAssignmentPatterns(targetRe);
  for (const rx of patterns) {
    const m = rx.exec(prompt);
    if (m) {
      // find which group is the color (the pattern order varies)
      // The color is the *last* capture group by construction.
      const raw = m[m.length - 1];
      const c = toColor(raw);
      if (c) return c;
    }
  }
 return fallbackPattern ? pickColorAround(fallbackPattern, prompt, preferForward) : null;
};

// --- Parse simple color instructions from the user's prompt ---
// --- Parse simple color instructions from the user's prompt ---
const stylesFromPrompt = (prompt = '') => {
const p = (prompt || '').toLowerCase();
  const s = {};

  // helpers
  const around = (pat) => pickColorAround(pat, p);
 const any = (arr) => arr.join('|');

  // Page vs. Form container (card)
    // First look for explicit page/body/screen/canvas
  const pageBgExplicit = resolveColorFor(
    p,
    `(?:page|body|screen|canvas)\\s*(?:background|bg|color)?`,
    `\\b(${any(['page','body','screen','canvas'])})(\\s*(background|bg|color))?\\b`
  );
  // Specific "field card / card container" first (to win over generic "form background")
  const fieldCardExplicit = resolveColorFor(
        p,
    `(?:field\\s*card|form\\s*card|card\\s*container|container|panel|box)\\s*(?:bg|background)?`,
    `\\b((field\\s*card|form\\s*card|card\\s*container|container|panel|box)\\s*(bg|background))\\b`
  );
  // Generic card/form background (lower priority)
  const formCardGeneric = resolveColorFor(
   p,
   `(?:card)\\s*(?:bg|background)?`,
   `\\b(card\\s*(bg|background))\\b`
 );
  // Fields
  const fieldBg = resolveColorFor(
    p,
    `(?:field|input|textbox|textarea)\\s*(?:bg|background)?`,
    `\\b(${any(['field','input','textbox','textarea'])})\\s*(bg|background)\\b`
  );
  const fieldBorder = resolveColorFor(
    p,
    `(?:border|field\\s*border)(?:\\s*color)?`,
    `\\b(${any(['border','field\\s*border'])})(\\s*color)?\\b`
  );

  const titleCol  = resolveColorFor(
    p,
    `(?:title|form\\s*title|heading|header)(?:\\s*color)?`,
    `\\b(${any(['title','form\\s*title','heading','header'])})(\\s*color)?\\b`,
    true
  );
  const labelCol  = resolveColorFor(
    p,
    `(?:label|labels|field\\s*label|field\\s*labels)(?:\\s*color)?`,
    `\\b(${any(['label','labels','field\\s*label','field\\s*labels'])})(\\s*color)?\\b`,
    true
  );
  const inputTxt = resolveColorFor(
    p,
    `(?:input|field|textbox|textarea)\\s*(?:text(?:\\s*color)?)?`,
    `\\b(${any(['input','field','textbox','textarea'])})\\s*(text(\\s*color)?)\\b`,
    true
  );
  const optionsTxt = resolveColorFor(
    p,
    `(?:options?|choices?|radio|checkbox)\\s*(?:text(?:\\s*color)?)?`,
    `\\b(${any(['options','option','choices','radio','checkbox'])})\\s*(text(\\s*color)?)\\b`,
    true
  );


  // Buttons / theme
  const primary   = resolveColorFor(
    p,
    `(?:primary|brand|accent|theme|button|cta)(?:\\s*color)?`,
    `\\b(${any(['primary','brand','accent','theme','button','cta'])})(\\s*color)?\\b`
  );
  const buttonTxt = resolveColorFor(
    p,
    `(?:button\\s*text|cta\\s*text|button\\s*label)(?:\\s*color)?`,
    `\\b(${any(['button\\s*text','cta\\s*text','button\\s*label'])})(\\s*color)?\\b`
  );
   // Apply what we found
 if (pageBgExplicit)     s.backgroundColor  = pageBgExplicit;
    if (fieldCardExplicit) {
    s.fieldCardBgColor = fieldCardExplicit;
  } else if (formCardGeneric) {
    s.fieldCardBgColor = formCardGeneric;
  }
  if (fieldBg)    s.fieldBgColor     = fieldBg;
  if (fieldBorder)s.borderColor      = fieldBorder;
  if (titleCol)   s.titleColor       = titleCol;
  // If the prompt explicitly mentions a title color anywhere, let it override heuristics

      const titleExplicit = resolveColorFor(
    p,
    `(?:form\\s*title|title|heading|header)`,
    `\\b(${any(['form\\s*title','title','heading','header'])})\\b`
 );
 if (titleExplicit) s.titleColor = titleExplicit;
  if (labelCol)   s.textColor        = labelCol;
  if (inputTxt)   s.inputTextColor   = inputTxt;
  if (optionsTxt) s.optionTextColor  = optionsTxt;
  if (primary)    s.primaryColor     = primary;
  if (buttonTxt)  s.buttonTextColor  = buttonTxt;
    // Disambiguate "form background": page vs card
// Disambiguate "form background": page vs card
// Disambiguate "form background": page vs card
const formBgOnly = resolveColorFor(
  p,
  '(?:form)\\s*(?:bg|background)',
  '\\b(form\\s*(bg|background))(\\s*color)?\\b'
);

const hasExplicitCard =
  /\b((field\s*card|form\s*card|card\s*container|container|panel|box)\s*(bg|background))\b/i.test(p);

// Treat "form background" as the PAGE background by default.
if (formBgOnly) {
  s.backgroundColor = s.backgroundColor || formBgOnly;
  // Only set the card/container bg if it was explicitly mentioned somewhere.
  if (hasExplicitCard && !s.fieldCardBgColor) {
    s.fieldCardBgColor = formBgOnly;
  }
}

// --- Final overrides: explicit card/container wins ---
const cardOnly = around(`\\b(card)\\s*(bg|background)\\b`);
if (fieldCardExplicit)      s.fieldCardBgColor = fieldCardExplicit;
else if (cardOnly)          s.fieldCardBgColor = cardOnly;

// ❗️CHANGE: Only assume the card if there is NO page background and NO explicit card mention
const genericFormBg = around(`\\b(form\\s*(bg|background))(\\s*color)?\\b`);
if (!s.backgroundColor && !hasExplicitCard && genericFormBg && !s.fieldCardBgColor) {
  s.fieldCardBgColor = genericFormBg;
}

// Generic background w/out qualifier -> set both so it "just works"


  // If user said "theme color is X" but nothing else, at least color the buttons & borders nicely
  if (s.primaryColor) {
    if (!s.borderColor) s.borderColor = s.primaryColor;
    // keep title readable; don't force it unless explicitly asked
  }

  // Small heuristic: “labels and title blue” → copy over if mentioned together
 const pairJoiner = /labels?.{0,32}(?:and|&|,).{0,32}titles?|titles?.{0,32}(?:and|&|,).{0,32}labels?/i;
// Only mirror when the prompt did NOT explicitly specify "label color"
const labelColorExplicit = /\blabels?\s*color\b/i.test(p);
if (!labelColorExplicit) {
  if (!s.textColor && s.titleColor && pairJoiner.test(p)) s.textColor = s.titleColor;
  if (!s.titleColor && s.textColor && pairJoiner.test(p)) s.titleColor = s.textColor;
}

  return s;
};



// Map loose AI style keys into your concrete keys
const normalizeStyles = (aiStyles = {}) => {
  const s = { ...aiStyles };

  if (s.background)      s.backgroundColor   = s.background;
  if (s.bgColor)         s.backgroundColor   = s.bgColor;
  if (s.formBg)          s.backgroundColor   = s.formBg;

  if (s.fieldColor)      s.fieldBgColor      = s.fieldColor;
  if (s.fieldBackground) s.fieldBgColor      = s.fieldBackground;
  if (s.inputBg)         s.fieldBgColor      = s.inputBg;
if (s.headingColor)     s.titleColor       = s.headingColor;
 if (s.headerColor)      s.titleColor       = s.headerColor;
  // ⬇️ NEW: card aliases
  if (s.cardBg)          s.fieldCardBgColor  = s.cardBg;
  if (s.cardBackground)  s.fieldCardBgColor  = s.cardBackground;
  if (s.fieldCardBg)     s.fieldCardBgColor  = s.fieldCardBg;

  if (s.text)            s.textColor         = s.text;
  if (s.labelColor)      s.textColor         = s.labelColor;
  if (s.labelsColor)     s.textColor         = s.labelsColor;


  if (s.buttonColor)     s.primaryColor      = s.buttonColor;
  if (s.themeColor)      s.primaryColor      = s.themeColor;
  if (s.accentColor)     s.primaryColor      = s.accentColor;


  if (s.title)           s.titleColor        = s.title;
  if (s.cardBg)            s.fieldCardBgColor = s.cardBg;
if (s.cardBackground)    s.fieldCardBgColor = s.cardBackground;
if (s.fieldCardBg)       s.fieldCardBgColor = s.fieldCardBg;
if (s.containerBg)       s.fieldCardBgColor = s.containerBg;       // NEW
if (s.panelBg)           s.fieldCardBgColor = s.panelBg;           // NEW
if (s.optionColor)       s.optionTextColor  = s.optionColor;

 if (s.optionsColor)      s.optionTextColor  = s.optionsColor;
  if (s.optionsTextColor)  s.optionTextColor  = s.optionsTextColor;
  if (s.inputText)         s.inputTextColor   = s.inputText;
  if (s.border)            s.borderColor      = s.border;
  if (s.buttonText || s.buttonTextColor) s.buttonTextColor = s.buttonText || s.buttonTextColor;
 


  return { ...DEFAULT_STYLES, ...s };
};


// --- Helper: clean triple backticks and parse JSON ---
const parseAIFormJSON = (raw) => {
    const cleaned = String(raw || '')

      try { return JSON.parse(cleaned); }
  catch (e) {
    // Last-ditch fix for single quotes on keys/strings
    try {
      const looser = cleaned
        .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":') // unquoted keys
        .replace(/'/g, '"'); // single to double quotes
      return JSON.parse(looser);
    } catch {
      throw new Error(`Could not parse AI JSON: ${e.message}`);
    }
  }
};



/* -------------------------------------------------------
   ICONS
------------------------------------------------------- */
// Add this new icon component to your App.jsx file
const MagicWandIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M3 21l3 -3" />
    <path d="M12 12l3 -3" />
    <path d="M6 18l3 -3" />
    <path d="M9 15l3 -3" />
    <path d="M18 6l3 -3" />
    <path d="M3 3l18 18" />
  </svg>
);
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
const FormField = ({
  field, onRemove, onDragStart, onDrop, index,
  isSelected, onSelect, formStyles
}) => {
  const isButton = field.type === 'button';

  // always show the card background & border when not a button
  const wrapperClass = isButton
    ? 'group relative'
    : 'group relative p-4 rounded-xl shadow-sm hover:shadow-md transition';

  const wrapperStyle = isButton
    ? {}
    : {
        backgroundColor: formStyles.fieldCardBgColor,   // 👈 ensure card bg visible
        border: `1px solid ${formStyles.borderColor}`,  // 👈 explicit border
        ...(isSelected
          ? { outline: '2px solid', outlineOffset: 2, outlineColor: formStyles.primaryColor }
          : {})
      };

  return (
    <div
      draggable
      onDragStart={(e)=>onDragStart(e,index)}
      onDrop={(e)=>onDrop(e,index)}
      onDragOver={(e)=>e.preventDefault()}
      onClick={(e)=>{e.stopPropagation(); onSelect(field.id);}}
      className={wrapperClass + (isButton ? '' : ' bg-transparent')}  // 👈 neutralize any inherited bg
      style={wrapperStyle}
    >
      <div className={isButton ? '' : 'pl-7'}>
        <FieldRendererPreview field={field} formStyles={formStyles} />
      </div>

      <button
        onClick={(e)=>{e.stopPropagation(); onRemove(field.id);}}
        className={`absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1.5 shadow
                    ${isButton ? '' : 'opacity-0 group-hover:opacity-100 transition'}`}
        aria-label="Remove"
        title="Remove"
      >
        <IconTrash />
      </button>
    </div>
  );
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

 


  return (
  <div>
      <div className="text-sm font-semibold text-slate-700 mb-3">Form Styling</div>

      

      {/* THEME COLORS */}
      <Row label="Title Color">
  <ColorPair
    value={styles.titleColor ?? styles.textColor}
    onChange={(e) => setStyles((p) => ({ ...p, titleColor: e.target.value }))}
  />
</Row>
{/* THEME COLORS */}

<Row label="Primary color">
  <ColorPair
    value={styles.primaryColor}
    onChange={(e) => setStyles((p) => ({ ...p, primaryColor: e.target.value }))}
  />
</Row>

<Row label="Form background (page)">
  <ColorPair
    value={styles.backgroundColor ?? "#ffffff"}
    onChange={(e) => setStyles((p) => ({ ...p, backgroundColor: e.target.value }))}
  />
</Row>



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
  <div>
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
// Paste this entire block of code

const BuildWithAIModal = ({ open, onClose, onSubmit }) => {
  const [prompt, setPrompt] = useState(
    "Create a signup form with Full Name (required), Email (required), Password, and a Submit button. Blue theme, Inter font. Redirect to /thanks."
  );
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  if (!open) return null;

  const handleGo = async () => {
    try {
      setErr("");
      setLoading(true);
      await onSubmit(prompt);
    } catch (e) {
      setErr(`AI build failed: ${e.message}. A basic form was loaded so you can keep going.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 grid place-items-center p-4">
      <div className="bg-white rounded-xl border shadow-card max-w-2xl w-full">
        <div className="p-4 border-b">
          <div className="text-lg font-semibold">✨ Build with AI</div>
          <div className="text-slate-500 text-sm">Describe the form you want. The AI will return a ready-to-edit form.</div>
        </div>
        <div className="p-4 space-y-3">
          <textarea
            className="w-full p-3 border rounded-md h-40"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          {err && <div className="text-sm text-red-600">{err}</div>}
        </div>
        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 border rounded-md">Cancel</button>
          <button
            onClick={handleGo}
            disabled={loading}
            className="px-4 py-1.5 rounded-md bg-indigo-600 text-white"
          >
            {loading ? "Building…" : "Build"}
          </button>
        </div>
      </div>
    </div>
  );
};


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
// ---- LoginPage (drop-in replacement) ----
// LoginPage.jsx — robust version
// ---- LoginPage (drop-in replacement) ----
// LoginPage.jsx — robust version
const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errMsg, setErrMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  // in LoginPage
  // The new, simpler handleLogin function
  async function handleLogin(e) {
    e.preventDefault();
    setErrMsg(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setErrMsg(error.message || 'Invalid credentials.');
    }
    // The onAuthStateChange listener will now handle the navigation

    setLoading(false);
  }

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
              autoComplete="username"
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
              autoComplete="current-password"
            />
          </div>

          {errMsg && (
            <div className="bg-red-100 border border-red-300 text-red-700 text-sm rounded-md p-3">
              {errMsg}
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
// Sidebar.jsx (or keep in the same file)
const Sidebar = ({ current, onNavigate, formsCount = 0, onLogout, onOpenAISection }) => {
  const Item = ({ id, label, icon, badge }) => {
    const active = current === id;
    return (
      <button
        onClick={() => onNavigate?.(id)}
        className={`nav-item ${active ? 'is-active' : ''}`}
      >
        <span className="nav-icon">{icon}</span>
        <span className="nav-label">{label}</span>
        {typeof badge === 'number' && <span className="badge">{badge}</span>}
      </button>
    );
  };

  return (
<aside className="sidebar relative flex flex-col h-screen z-20">  <div className="sidebar__glass" />

  {/* Centered logo */}
  <div className="sidebar__brand">
    <div className="brand-mark brand-mark--big">
      <SvgLogo size={38} />
    </div>
  </div>

{/* Menu */}
<div className="sidebar__section">
  <nav className="nav">
    <Item id="forms" label="Forms" icon={<IconHash />} badge={formsCount} />
    <Item id="media" label="Media" icon={<IconImage />} />
    
    {/* The new Build with AI button, styled as a nav item */}
    <button 
      className={`nav-item ${current === 'ai_builder' ? 'is-active' : ''}`} 
      onClick={onOpenAISection}
    >
      <span className="nav-icon">✨</span>
      <span className="nav-label">Build with AI</span>
    </button>
  </nav>
</div>

  {/* Footer pinned to bottom */}
  <div className="sidebar__footer mt-auto p-3">
    <button className="link-ghost" onClick={onLogout}>
      <span className="nav-icon"><IconLogout /></span>
      <span className="nav-label">Logout</span>
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


const DashboardPage = ({ forms, createNewForm, editForm, previewForm, duplicateForm, deleteForm, shareForm, onLogout, onOpenAISection, initialTab = 'forms' }) => { // ✅ COMMA ADDED

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] =  useState(initialTab);
  const filteredForms = forms.filter(form =>
    (form.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (form.title?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

  return (
<div className="h-screen grid grid-cols-[14rem_1fr] overflow-hidden">  <Sidebar
  current={activeTab}
  onNavigate={setActiveTab}
  formsCount={forms.length}
  onLogout={onLogout}
  onOpenAISection={onOpenAISection}
/>



<div className="bg-slate-50 h-full overflow-auto">
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
// ----- NLP helpers: tokenize, ordinals, field matching -----
const ORDINAL_WORDS = { first:1, second:2, third:3, fourth:4, fifth:5, sixth:6, seventh:7, eighth:8, ninth:9, tenth:10 };

const normalizeWord = (s) => String(s||'').trim().toLowerCase();

const getOrdinalIndex = (text) => {
  const t = normalizeWord(text);
  if (ORDINAL_WORDS[t]) return ORDINAL_WORDS[t] - 1;
  const m = t.match(/\b(\d+)(st|nd|rd|th)?\b/); // "2nd", "3", etc.
  if (m) return Math.max(0, parseInt(m[1], 10) - 1);
  return null;
};

const fieldTypeAliases = {
  text: ['text','input','short text'],
  email: ['email'],
  textarea: ['textarea','long text','message'],
  dropdown: ['select','dropdown'],
  radio: ['radio','radiogroup'],
  checkbox: ['checkbox','checkboxes'],
  date: ['date'],
  phone: ['phone','tel','telephone','mobile'],
  file: ['file','upload'],
  button: ['button','submit','cta'],
  html: ['html','note','content','rich text'],
};

const matchType = (token) => {
  const t = normalizeWord(token);
  for (const [type, aliases] of Object.entries(fieldTypeAliases)) {
    if (aliases.includes(t)) return type;
  }
  return null;
};

// ----- Multi-instruction interpreter -----
// Supports commands like:
//  - set "Email" label color to #0ea5e9
//  - make first text field placeholder "Your full name"
//  - change button text to "Send"
//  - title "Contact Us"
//  - set Email input text color blue and border color #999
//  - second radio field label color red, third field bg #fafafa
//  - for "Message" placeholder "Tell us about your project"
const interpretPromptEdits = (prompt, fields, globalStyles) => {
  const p = String(prompt || '');
  const updates = [];   // { fieldId, patch }
  const styleEdits = {}; // global style patches (title, theme, etc.)

  // Split on semicolons or " and " / " & " but keep quoted chunks intact
  const parts = p
    .split(/;|\n|(?<!["'`])\band\b(?![^"']*["'])|(?<!["'`])\s&\s(?![^"']*["'])/gi)
    .map(s => s.trim())
    .filter(Boolean);

  // color token detection
  const COLOR_TOKEN = /(#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-zA-Z]+)/i;

  const tryColor = (tok) => {
    // reuse your toColor() from code
    return toColor ? toColor(tok) : tok;
  };

  // helpers to apply
  const pushFieldPatch = (f, patch) => {
    if (!f) return;
    updates.push({ fieldId: f.id, patch });
  };

  for (let raw of parts) {
    const s = raw.trim();

    // ---- Title text change ----
    // e.g., title "Contact us", set title to "Get in touch"
    if (/\btitle\b/i.test(s)) {
      const q = s.match(/["“”'`](.+?)["“”'`]/);
      if (q) {
        styleEdits._title = q[1];
        continue;
      }
      const m = s.match(/\b(?:set|make|change)\s+title\s+(?:to|as)?\s*(.+)$/i);
      if (m) {
        styleEdits._title = m[1].replace(/^["'`]|["'`]$/g,'').trim();
        continue;
      }
    }

    // ---- Button label change ----
    // e.g., set button text to "Send", change submit to "Send Now"
    if (/\b(button|submit|cta)\b/i.test(s) && /\b(text|label)\b/i.test(s)) {
      const q = s.match(/["“”'`](.+?)["“”'`]/);
      const newTxt = q ? q[1] : (s.split(/\bto\b/i)[1] || '').replace(/^["'`]|["'`]$/g,'').trim();
      const btn = fields.find(f => f.type === 'button');
      if (btn && newTxt) pushFieldPatch(btn, { label: newTxt });
      continue;
    }

    // ---- Generic field label rename ----
    // e.g., rename "Email" to "Work Email"
    if (/\brename\b/i.test(s)) {
      const m = s.match(/\brename\s+(.+?)\s+to\s+(.+)$/i);
      if (m) {
        const from = m[1].trim();
        const to = m[2].replace(/^["'`]|["'`]$/g,'').trim();
        const f = findFieldRef(fields, from) || fields.find(x => (x.label||'').toLowerCase() === from.toLowerCase());
        if (f && to) pushFieldPatch(f, { label: to });
        continue;
      }
    }

    // ---- Placeholder edit ----
    // e.g., set "Full Name" placeholder "Jane Doe"
    if (/\bplaceholder\b/i.test(s)) {
      const m = s.match(/(.+?)\bplaceholder\b\s*(?:(?:to|as|=)\s*)?["“”'`](.+?)["“”'`]/i)
            || s.match(/set\s+(.+?)\s+placeholder\s+(?:to|as|=)?\s*(.+)$/i);
      if (m) {
        const ref = m[1].trim();
        const ph = (m[2] || '').replace(/^["'`]|["'`]$/g,'').trim();
        const f = findFieldRef(fields, ref) || fields.find(x => (x.label||'').toLowerCase() === ref.toLowerCase());
        if (f && ph) pushFieldPatch(f, { placeholder: ph });
        continue;
      }
    }

    // ---- Per-field color edits ----
    // patterns like: set "<label>" label color to <color>
    //                second text field input text color blue
    //                "Email" border color #999
    //                third field bg #fafafa
    const colorTargetMap = [
      { key: 'labelColor', rx: /(label(?:\s*text)?)\s*color/i },
      { key: 'inputTextColor', rx: /(input\s*(?:text)?|text)\s*color/i },
      { key: 'borderColor', rx: /(border|outline)\s*color/i },
      { key: 'bgColor', rx: /(bg|background)\s*(?:color)?/i },
      { key: 'optionTextColor', rx: /(option|options|radio|checkbox)\s*(?:text\s*)?color/i },
    ];

    // Try to extract a field ref phrase up front
    // Heuristic: before "color" / "placeholder" keywords OR quotes
    let refGuess = null;
    const quoted = s.match(/["“”'`](.+?)["“”'`]/);
    if (quoted) refGuess = quoted[1];
    else {
      const refTry = s.match(/\b(?:first|second|third|\d+(?:st|nd|rd|th)?)\s+[a-z ]+?\s*field\b/i)
                 || s.match(/\blabel\s*:\s*.+$/i);
      if (refTry) refGuess = refTry[0];
    }
    const refField = refGuess ? findFieldRef(fields, refGuess) : null;

    // color target?
    const target = colorTargetMap.find(t => t.rx.test(s));
    const colorM = s.match(COLOR_TOKEN);
    if ((refField && target && colorM) || (/^(set|make|change)\b/i.test(s) && target && colorM)) {
      const color = tryColor(colorM[0]);
      if (color) {
        if (refField) {
          pushFieldPatch(refField, { [target.key]: color });
        } else {
          // If no specific field found, allow applying to all matching type by ordinal-less hint e.g., "all radios label color red"
          if (/all\s+radios?/i.test(s)) {
            fields.filter(f => f.type === 'radio').forEach(f => pushFieldPatch(f, { [target.key]: color }));
          } else if (/all\s+checkbox(es)?/i.test(s)) {
            fields.filter(f => f.type === 'checkbox').forEach(f => pushFieldPatch(f, { [target.key]: color }));
          }
        }
        continue;
      }
    }

    // ---- Global style color shortcuts (if user writes "title color blue", etc.) ----
    if (/\btitle\b/i.test(s) && /\bcolor\b/i.test(s) && COLOR_TOKEN.test(s)) {
      const c = tryColor(s.match(COLOR_TOKEN)[0]);
      if (c) styleEdits.titleColor = c;
      continue;
    }
    if (/\b(primary|theme|accent)\b/i.test(s) && /\bcolor\b/i.test(s) && COLOR_TOKEN.test(s)) {
      const c = tryColor(s.match(COLOR_TOKEN)[0]);
      if (c) styleEdits.primaryColor = c;
      continue;
    }
    if (/\b(form|page|body|screen|canvas)\b/i.test(s) && /\b(bg|background)\b/i.test(s) && COLOR_TOKEN.test(s)) {
      const c = tryColor(s.match(COLOR_TOKEN)[0]);
      if (c) styleEdits.backgroundColor = c;
      continue;
    }
    if (/\b(card|container|panel|box)\b/i.test(s) && /\b(bg|background)\b/i.test(s) && COLOR_TOKEN.test(s)) {
      const c = tryColor(s.match(COLOR_TOKEN)[0]);
      if (c) styleEdits.fieldCardBgColor = c;
      continue;
    }
  }

  return { updates, styleEdits };
};

// Find a field by: exact label; ordinal + type; plain ordinal in overall order
const findFieldRef = (fields, descriptor) => {
  const d = normalizeWord(descriptor);

  // 1) "label: Email" or quoted label
  const q = d.match(/label\s*:\s*(.+)$/);
  if (q) {
    const label = q[1].replace(/^["']|["']$/g,'').trim().toLowerCase();
    return fields.find(f => (f.label||'').toLowerCase() === label) || null;
  }
  const quoted = d.match(/["“”'`](.+?)["“”'`]/);
  if (quoted) {
    const label = quoted[1].toLowerCase();
    return fields.find(f => (f.label||'').toLowerCase() === label) || null;
  }

  // 2) "<ordinal> <type>" → e.g., "second text field"
  const m2 = d.match(/\b(first|second|third|fourth|fifth|\d+(?:st|nd|rd|th)?)\s+([a-z ]+?)\s*(field)?\b/);
  if (m2) {
    const idx = getOrdinalIndex(m2[1]);
    const tp = matchType(m2[2]);
    if (idx != null && tp) {
      const arr = fields.filter(x => x.type === tp);
      return arr[idx] || null;
    }
  }

  // 3) simple ordinal in overall order: "third field"
  const m3 = d.match(/\b(first|second|third|fourth|fifth|\d+(?:st|nd|rd|th)?)\s+field\b/);
  if (m3) {
    const idx = getOrdinalIndex(m3[1]);
    return idx != null ? fields[idx] || null : null;
  }

  return null;
};

const FormBuilderPage = ({ initialForm, saveForm, saveAndExit, backToDashboard, previewForm }) => {
  const [fields, setFields] = useState(asArray(initialForm.fields));
  const [formTitle, setFormTitle] = useState(initialForm.title);
  const [formName, setFormName] = useState(initialForm.name);
  const [formStyles, setFormStyles] = useState(asObject(initialForm.styles, DEFAULT_STYLES));
  const [formConfig, setFormConfig] = useState(asObject(initialForm.config, DEFAULT_CONFIG));
  const [showAIModal, setShowAIModal] = useState(false);

// inside FormBuilderPage
const buildFormWithAI = async (userPrompt) => {
  // 1) Call AI and build a safe baseline
  let ai;
  try {
    const llmText = await callAiBuilder(userPrompt);
    ai = parseAIFormJSON(llmText);
  } catch {
    ai = {
      name: "New Form",
      title: "Untitled Form",
      fields: [
        { type: "text", label: "Your Name", required: true, placeholder: "Jane Doe" },
        { type: "email", label: "Email", required: true, placeholder: "name@example.com" },
        { type: "button", label: "Submit" }
      ],
      styles: {},
      config: {}
    };
  }

  // 2) Styles = AI styles + prompt-derived styles
  const finalStyles = normalizeStyles({
    ...(ai.styles || {}),
    ...stylesFromPrompt(userPrompt),
  });

  // 3) Field list (normalize first, then fulfill “two text fields” if asked)
  const wantsTwoText = /(^|\b)two\b.*\btext\s*fields?/i.test(userPrompt);

  const normalizeField = (f) => {
    const id = f.id || `f_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    let options = Array.isArray(f.options) ? f.options : [];
    options = options.map((o) => (typeof o === 'string' ? o : (o?.label || o?.value || ''))).filter(Boolean);

    const t = String(f.type || '').toLowerCase();
    const typeMap = {
      text:'text', input:'text', email:'email', textarea:'textarea',
      select:'dropdown', dropdown:'dropdown',
      radio:'radio', radiogroup:'radio',
      checkbox:'checkbox', checkboxes:'checkbox',
      date:'date', file:'file', phone:'phone', tel:'phone',
      html:'html', button:'button', submit:'button',
    };
    return { id, ...f, type: typeMap[t] || 'text', options };
  };

  let newFields = Array.isArray(ai.fields) ? ai.fields.map(normalizeField) : [];

  if (wantsTwoText) {
    const existingText = newFields.filter(f => f.type === 'text');
    const needed = Math.max(0, 2 - existingText.length);
    for (let i = 0; i < needed; i++) {
      newFields.push(normalizeField({
        type: 'text',
        label: `Text Field ${existingText.length + i + 1}`,
        placeholder: 'Enter text',
      }));
    }
  }

  // 4) NLP edits
  const { updates, styleEdits } = interpretPromptEdits(userPrompt, newFields, finalStyles);
  if (Array.isArray(updates)) {
    for (const { fieldId, patch } of updates) {
      newFields = newFields.map(f => (f.id === fieldId ? { ...f, ...patch } : f));
    }
  }

  const mergedStyles = { ...finalStyles, ...styleEdits };

  // 5) Apply to builder state
  if (styleEdits._title) setFormTitle(styleEdits._title);
  setFields(newFields);
  setFormStyles(mergedStyles);
  setFormName(ai.name || "Untitled Form");
  setFormConfig(asObject(ai.config, DEFAULT_CONFIG));
  setShowAIModal(false);
};
  
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

  // ===== inside FormBuilderPage =====
return (
  <>
    
<div className="h-screen min-h-0 bg-slate-100 flex flex-col overflow-hidden">
    {/* Top Bar */}
      
      <div className="bg-gray-900 text-white shadow-md">
        <div className="max-w-full mx-auto px-6 h-14 grid grid-cols-3 items-center">
          <div className="flex items-center gap-3" />
          <div className="flex justify-center items-center gap-4">
            <div className="flex items-center gap-8">
              {['settings', 'build', 'styling'].map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={`uppercase text-sm tracking-wide transition ${
                    activeTab === t ? 'text-cyan-400 border-b-2 border-cyan-400 pb-1' : 'text-gray-300 hover:text-white'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end items-center gap-2">
            <button onClick={backToDashboard} className="px-3 py-1.5 rounded-md border text-sm hover:bg-slate-100 hover:text-black transition-colors">
              Back
            </button>

            <button
              onClick={() =>
                previewForm({
                  ...initialForm,
                  name: formName,
                  title: formTitle,
                  fields,
                  styles: formStyles,
                  config: formConfig,
                })
              }
className="px-3 py-1.5 rounded-md border text-sm hover:bg-slate-100 hover:text-black flex items-center gap-2">
              <IconEye /> Preview
            </button>


            <button
              onClick={() =>
                saveForm({
                  ...initialForm,
                  name: formName,
                  title: formTitle,
                  fields,
                  styles: formStyles,
                  config: formConfig,
                })
              }
              className="px-3 py-1.5 rounded-md border text-sm hover:bg-slate-100 hover:text-black">
            
              Save
            </button>

            <button
              onClick={() =>
                saveAndExit({
                  ...initialForm,
                  name: formName,
                  title: formTitle,
                  fields,
                  styles: formStyles,
                  config: formConfig,
                })
              }
              className="px-4 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 hover:text-black">
            
              Save & Exit
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
<div className="builder-grid grid gap-4 p-4 flex-1 min-h-0 max-w-full overflow-hidden">
    
    {/* LEFT: Toolbox (build & styling tabs) */}
        {/* LEFT: Toolbox (build & styling tabs) */}
{(activeTab === 'build' || activeTab === 'styling') && (
  <aside
  className="builder-left bg-slate-900 rounded-xl shadow-card border border-slate-800 overflow-y-auto self-stretch"
style={{ height: 'auto' }}
>

  <div className="p-3 space-y-2">
<div className="text-slate-200 text-xs uppercase tracking-wide mb-2 font-bold text-center">Fields</div>
      <ToolboxItem type="text"     label="Text"      icon={<IconHash/>} defaultData={{ placeholder: 'Enter text', required:false }} />
      <ToolboxItem type="email"    label="Email"     icon={<IconHash/>} defaultData={{ placeholder: 'name@example.com', required:false }} />
      <ToolboxItem type="textarea" label="Textarea"  icon={<IconHash/>} defaultData={{ placeholder: 'Enter long text', required:false }} />
      <ToolboxItem type="dropdown" label="Dropdown"  icon={<IconHash/>} defaultData={{ options:['Option 1','Option 2'], required:false }} />
      <ToolboxItem type="radio"    label="Radio"     icon={<IconHash/>} defaultData={{ options:['Option A','Option B'], required:false }} />
      <ToolboxItem type="checkbox" label="Checkbox"  icon={<IconHash/>} defaultData={{ options:['Item 1','Item 2'], required:false }} />
      <ToolboxItem type="date"     label="Date"      icon={<IconHash/>} defaultData={{ required:false }} />
      <ToolboxItem type="file"     label="File"      icon={<IconHash/>} defaultData={{ required:false }} />
      <ToolboxItem type="phone"    label="Phone"     icon={<IconHash/>} defaultData={{ placeholder: '(555) 555-5555', required:false }} />
      <ToolboxItem type="button"   label="Button"    icon={<IconHash/>} defaultData={{ label:'Submit' }} />
      <ToolboxItem type="html"     label="HTML Block" icon={<IconHash/>} defaultData={{ label:'Note', content:'<p>Edit me</p>' }} />
    </div>
  </aside>
)}


        {/* CENTER: Canvas / Settings */}
     <main
  className={`builder-main h-full min-h-0 rounded-xl shadow-card border p-6 pb-24 panel-scroll overflow-y-auto ${
            dragOver ? 'ring-2 ring-cyan-400' : ''
          } ${activeTab === 'settings' ? 'col-span-3' : ''}`}
          onDrop={activeTab === 'build' ? addFromToolbox : undefined}
          onDragOver={
            activeTab === 'build'
              ? (e) => {
                  e.preventDefault();
                  setDragOver(true);
                }
              : undefined
          }
          
          onDragLeave={activeTab === 'build' ? () => setDragOver(false) : undefined}
          style={{
            fontFamily: formStyles.fontFamily,
            backgroundColor: activeTab !== 'settings' ? formStyles.backgroundColor : '#ffffff',
          }}
          onClick={() => {
            setSelectedFieldId(null);
          }}
        >
          {/* --- BUILD TAB CONTENT --- */}
          {/* Always-visible title header */}

{activeTab === 'build' && (
<div className="mx-auto space-y-3 pb-24" style={{ maxWidth: `${formStyles.formWidthPct || 100}%` }}>
    <h1
     className="text-2xl font-bold mb-6 text-center"
      style={{ color: formStyles.titleColor || formStyles.textColor }}
    >
      {formTitle || 'Untitled Form'}
    </h1>

    {fields.length === 0 && (
      <div
        className={`p-10 border-2 border-dashed rounded-xl text-slate-500 text-sm text-center ${
          dragOver ? 'border-cyan-400 bg-cyan-50/40' : 'border-slate-300 bg-white'
        }`}
      >
        Drag items from the left to add fields
      </div>
    )}

    {fields.map((f, i) => (
      <FormField
        key={f.id}
        field={f}
        index={i}
        formStyles={formStyles}
        isSelected={selectedFieldId === f.id}
        onSelect={setSelectedFieldId}
        onRemove={(id) => removeField(id)}
        onDragStart={onDragStartExisting}
        onDrop={onDropExisting}
      />
    ))}
  </div>
)}



          {/* --- STYLING TAB CONTENT --- */}
       {activeTab === 'styling' && (
  <div
    className="mx-auto rounded-2xl shadow-lg p-6 sm:p-8 h-full overflow-y-auto"
    style={{ maxWidth: `${formStyles.formWidthPct || 100}%`, backgroundColor: formStyles.backgroundColor }}
  >
    {formStyles.logoUrl && (
      <img src={formStyles.logoUrl} alt="logo" className="max-h-16 mx-auto mb-6" />
    )}

    <h2
      className="text-2xl font-bold text-center mb-6"
      style={{ color: formStyles.titleColor || formStyles.textColor }}
    >
      {formTitle || 'Untitled Form'}
    </h2>

    <div className="space-y-4">
     {Array.isArray(fields) && fields.length > 0 ? (
  fields.map((f) => {
    // If the field is a button, render it without the container
    if (f.type === 'button') {
      return <FieldRendererPreview key={f.id} field={f} formStyles={formStyles} />;
    }
    
    // Otherwise, render it with the container
    return (
      <div
        key={f.id}
        className="p-4 border rounded-xl shadow-sm"
        style={{
          backgroundColor: formStyles.fieldCardBgColor,
          borderColor: formStyles.borderColor,
        }}
      >
        <FieldRendererPreview field={f} formStyles={formStyles} />
      </div>
    );
  })
) : (
        <div className="p-10 border-2 border-dashed rounded-xl text-slate-500 text-sm text-center bg-white">
          Add some fields in the Build tab to see them here.
        </div>
      )}
    </div>
  </div>
)}


          {/* --- SETTINGS TAB CONTENT --- */}
        {activeTab === 'settings' && (
  <div className="mx-auto max-w-3xl space-y-8">
    {/* Title header always visible */}
   <div className="text-center mb-6">
</div>


    {/* Basic */}
    <section className="p-4 border rounded-xl bg-white space-y-4">
      <div className="text-sm font-semibold text-slate-700">Basics</div>
      <div>
        <label className="text-xs font-medium text-slate-500 mb-1 block">Form Name</label>
        <input
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
          className="w-full px-3 py-2 border rounded-md"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-500 mb-1 block">Form Title (shown to users)</label>
        <input
          value={formTitle}
          onChange={(e) => setFormTitle(e.target.value)}
          className="w-full px-3 py-2 border rounded-md"
        />
      </div>
    </section>

    {/* Submit behavior */}
    <section className="p-4 border rounded-xl bg-white space-y-4">
      <div className="text-sm font-semibold text-slate-700">Submit Behavior</div>
      <div>
        <label className="text-xs font-medium text-slate-500 mb-1 block">Redirect URL</label>
        <input
          value={formConfig.submit?.redirectUrl || ''}
          onChange={(e) => setFormConfig((p) => ({ ...p, submit: { ...p.submit, redirectUrl: e.target.value } }))}
          placeholder="/thanks"
          className="w-full px-3 py-2 border rounded-md"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!!formConfig.submit?.openInNewTab}
          onChange={(e) => setFormConfig((p) => ({ ...p, submit: { ...p.submit, openInNewTab: e.target.checked } }))}
        />
        Open in new tab
      </label>
    </section>

    {/* Email notifications */}
    <section className="p-4 border rounded-xl bg-white space-y-4">
      <div className="text-sm font-semibold text-slate-700">Email Notifications</div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!!formConfig.email?.enabled}
          onChange={(e) => setFormConfig((p) => ({ ...p, email: { ...p.email, enabled: e.target.checked } }))}
        />
        Enable
      </label>

      {formConfig.email?.enabled && (
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">From Name</label>
            <input
              value={formConfig.email.fromName}
              onChange={(e) => setFormConfig((p) => ({ ...p, email: { ...p.email, fromName: e.target.value } }))}
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">From Email</label>
            <input
              value={formConfig.email.fromEmail}
              onChange={(e) => setFormConfig((p) => ({ ...p, email: { ...p.email, fromEmail: e.target.value } }))}
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-slate-500 mb-1 block">Additional “To” (comma separated)</label>
            <input
              value={formConfig.email.additionalTo}
              onChange={(e) => setFormConfig((p) => ({ ...p, email: { ...p.email, additionalTo: e.target.value } }))}
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-slate-500 mb-1 block">Subject</label>
            <input
              value={formConfig.email.subject}
              onChange={(e) => setFormConfig((p) => ({ ...p, email: { ...p.email, subject: e.target.value } }))}
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-slate-500 mb-1 block">Body</label>
            <textarea
              value={formConfig.email.body}
              onChange={(e) => setFormConfig((p) => ({ ...p, email: { ...p.email, body: e.target.value } }))}
              rows={4}
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>
        </div>
      )}
    </section>
  </div>
)}

        </main>

       {/* RIGHT: Field/Styling panels */}
{(activeTab === 'build' || activeTab === 'styling') && (
  <aside
    className="builder-right bg-white rounded-xl shadow-card border overflow-y-auto self-stretch"
style={{ height: 'auto' }}
  >
    <div className="p-4 h-full space-y-6">
      {/* Field Settings */}
      <section>
        <div className="text-xs font-semibold text-slate-500 mb-2">Field</div>
        <FieldSettingsPanel field={selectedField} updateField={updateField} />
      </section>

      <hr className="border-slate-200" />

      {/* Styling */}
      <section>
        <div className="text-xs font-semibold text-slate-500 mb-2">Styling</div>
        <StylingPanel
          styles={formStyles}
          setStyles={setFormStyles}
          formTitle={formTitle}
          setFormTitle={setFormTitle}
        />
      </section>
    </div>
  </aside>
)}




      </div>
    </div>

    {/* ✅ The modal is a sibling so it overlays the builder when open */}
    <BuildWithAIModal
      open={showAIModal}
      onClose={() => setShowAIModal(false)}
      onSubmit={buildFormWithAI}
    />
   </>
);
}; 
const PreviewPage = ({ previewData, exitPreview }) => {

  return (
    <div
  className="h-screen p-6 overflow-hidden preview-shell"

     style={{
  fontFamily: previewData.styles.fontFamily,
  backgroundColor: previewData.styles.backgroundColor,

  '--studio-bg': previewData.styles.backgroundColor,
  '--field-bg': previewData.styles.fieldBgColor,
  '--field-bdr': previewData.styles.borderColor,
}}

    >
      <div
  className="max-w-2xl mx-auto border rounded-2xl shadow-card p-8 preview-card-scroll"
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
      {previewData.fields.map((f) => {
  const content = <FieldRendererPreview key={f.id} field={f} formStyles={previewData.styles} />;

  if (f.type === 'button') return <div key={f.id}>{content}</div>;  // no card

  return (
    <div key={f.id} className="p-4 border rounded-xl shadow-sm"
         style={{ backgroundColor: previewData.styles.fieldCardBgColor,
                  borderColor: previewData.styles.borderColor }}>
      {content}
    </div>
  );
})}

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

// === AI Builder PAGE (standalone, no modal) ===
// === AI Builder PAGE (standalone, with sidebar) ===
// Replace your old AIBuildPage component with this new one

const AIBuildPage = ({ forms, onBuild, onCancel, onNavigate, onLogout }) => {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const handleGo = async () => {
    try {
      setErr("");
      setLoading(true);
      await onBuild(prompt);
    } catch (e) {
      setErr("Failed to build with AI. Try a simpler prompt.");
    } finally {
      setLoading(false);
    }
  };

  const handleExampleClick = (examplePrompt) => {
    setPrompt(examplePrompt);
  };

  return (
    <div className="min-h-screen grid grid-cols-[14rem_1fr]">
      <Sidebar
        current="ai_builder"
        onNavigate={onNavigate}
        formsCount={forms.length}
        onLogout={onLogout}
        onOpenAISection={() => {}}
      />

      <div className="bg-slate-50 h-full overflow-auto">
        {/* Main Content Area */}
<main className="flex flex-col items-center justify-center min-h-full p-4 sm:p-6 pb-24">  
   <div className="w-full max-w-3xl mx-auto">
            
            {/* 1. Header with Icon */}
            <div className="text-center">
              <div className="inline-block p-4 bg-indigo-100/50 text-indigo-600 rounded-2xl mb-4">
                <MagicWandIcon />
              </div>
              <h1 className="text-4xl font-bold text-slate-800 tracking-tight">
                Create with AI
              </h1>
              <p className="mt-2 text-lg text-slate-500">
                Describe the form you want. The AI will build it for you in seconds.
              </p>
            </div>

            {/* 2. Enhanced Text Input Area */}
            <div className="relative mt-10">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full p-4 border-2 border-slate-200/60 rounded-xl resize-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow shadow-sm hover:shadow-md text-base text-slate-700"
                placeholder="e.g., A simple contact form with a dark theme..."
                rows={5}
              />
            </div>


            {/* 4. Action Buttons */}
            <div className="mt-8 flex items-center gap-4">
              <button
                onClick={handleGo}
                disabled={loading}
                className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-all text-base"
              >
                {loading ? "Building…" : "✨ Build Form"}
              </button>
              <button onClick={() => onCancel('forms')} className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium transition-colors">
                Back to Forms
              </button>
            </div>
             {err && <div className="mt-4 text-sm text-red-600">{err}</div>}
          </div>
        </main>
      </div>
    </div>
  );
};

/* -------------------------------------------------------
   MAIN APP CONTROLLER
------------------------------------------------------- */
function App() {
  

  // ---- state (top) ----
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);
  const [view, setView] = useState('dashboard');
  const [initialDashboardTab, setInitialDashboardTab] = useState('forms'); // ✅ ADD THIS LINE
  const backToDashboard = (tab = 'forms') => {  setInitialDashboardTab(tab);  setView('dashboard');};
  const [forms, setForms] = useState([]);
  const [currentFormId, setCurrentFormId] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [builderDraft, setBuilderDraft] = useState(null);
  const [embedModalFormId, setEmbedModalFormId] = useState(null);
  const [publicFormData, setPublicFormData] = useState(null);

  // ---- effects (still before any return) ----
  // Single auth effect: get initial session + listen for changes
 // ... inside the App component

// Effect to handle Supabase auth state changes
// Effect to handle Supabase auth state changes (correct cleanup)
useEffect(() => {
  let mounted = true;
  setBooting(true);

  // we capture the unsubscribe function here so React can call it
  let unsubscribe = () => {};

  (async () => {
    // 1) Read the current session immediately
    const { data: { session } } = await supabase.auth.getSession();
    if (!mounted) return;
    setSession(session ?? null);
    setBooting(false); // we can render now

    // 2) Subscribe for future changes
    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_event, sess) => {
        if (!mounted) return;
        setSession(sess ?? null);
      });

    // hand the real unsubscribe up to the effect
    unsubscribe = () => subscription?.unsubscribe();
  })();

  // 3) Proper cleanup returned to React
  return () => {
    mounted = false;
    unsubscribe();
  };
}, []);



// Effect to fetch data ONLY when the session changes
useEffect(() => {
  // If the user is logged out, clear their forms and do nothing else.
  if (!session) {
    setForms([]);
    return;
  }

  // This part handles the public form view from a URL hash
  const hash = window.location.hash;
  if (hash.startsWith('#form-data/')) {
    try {
      const compressed = hash.substring(11);
      const decompressed = LZString.decompressFromEncodedURIComponent(compressed);
      const formData = JSON.parse(decompressed);
      if (formData) {
        setPublicFormData(formData);
        setView('public_form');
      }
    } catch (e) {
      console.error("Failed to parse form data from URL", e);
    }
    return; // Stop here if it's a public form
  }

  // Fetch the user's forms from Supabase
  const fetchForms = async () => {
    const { data, error } = await supabase
      .from('forms')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching forms:', error);
    } else {
      const normalized = (data || []).map((f) => ({
        ...f,
        fields: asArray(f.fields),
        styles: asObject(f.styles, DEFAULT_STYLES),
        config: asObject(f.config, DEFAULT_CONFIG),
      }));
      setForms(normalized);
    }
  };

  fetchForms();
}, [session]); //

  // Persist small UI state
  useEffect(() => { if (view !== 'public_form') localStorage.setItem('view', view); }, [view]);

  useEffect(() => {
    if (currentFormId) localStorage.setItem('currentFormId', currentFormId);
    else localStorage.removeItem('currentFormId');
  }, [currentFormId]);

  // ... keep the rest of your existing code (view switching, forms, etc.)
  

  // ⬇️ MOVE THIS FUNCTION HERE (top-level inside App, not inside useEffect)
// inside App()
const buildFormWithAIDashboard = async (userPrompt) => {
  let ai;
  try {
    const llmText = await callAiBuilder(userPrompt);
    ai = parseAIFormJSON(llmText);
  } catch (e) {
    console.error('AI builder failed:', e);
    ai = {
      name: "New Form",
      title: "Untitled Form",
      fields: [
        { type: "text", label: "Your Name", required: true },
        { type: "email", label: "Email", required: true },
        { type: "button", label: "Submit" }
      ],
      styles: {},
      config: {}
    };
  }

  const finalStyles = normalizeStyles({
    ...(ai.styles || {}),
    ...stylesFromPrompt(userPrompt),
  });

  // ✅ declare these ONCE
  const wantsTwoText = /(^|\b)two\b.*\btext\s*fields?/i.test(userPrompt);
  let newFields = Array.isArray(ai.fields) ? ai.fields : [];
if (wantsTwoText) {    newFields = [
      { type: 'text', label: 'Text Field 1', placeholder: 'Enter text' },
      { type: 'text', label: 'Text Field 2', placeholder: 'Enter text' },
    ];
  }

    // Normalize newFields to ensure each has an id
  newFields = (Array.isArray(newFields) ? newFields : []).map(f => ({
    id: f.id || `f_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
    ...f,
  }));

  // 1) Run NLP edit interpreter
const { updates, styleEdits } = interpretPromptEdits(userPrompt, newFields, finalStyles);

if (Array.isArray(updates)) {
  for (const { fieldId, patch } of updates) {
    newFields = newFields.map(f => (f.id === fieldId ? { ...f, ...patch } : f));
  }
}

const mergedStyles = { ...finalStyles, ...styleEdits };

const draft = {
  id: `draft_${Date.now()}`,
  name: ai.name || "Untitled Form",
  title: styleEdits._title || ai.title || "Untitled Form",
  fields: newFields,
  styles: mergedStyles,
  config: asObject(ai.config, DEFAULT_CONFIG),
  created_at: new Date().toISOString(),
};

setBuilderDraft(draft);
setCurrentFormId(null);
setView("builder");
};

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
// inside FormBuilderPage (after the useState hooks)



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
// in App() — replace both functions

const saveForm = async (updated) => {
  const { id, created_at, ...payload } = updated; // strip read-only
  const isDraft = !id || String(id).startsWith('draft_');

  if (isDraft) {
    // INSERT new row
    const { data, error } = await supabase
      .from('forms')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Error inserting form:', error);
      alert('Could not save form (insert). See console for details.');
      return null;
    }

    // Put new row into local state and switch builder to DB-backed id
    setForms(prev => [data, ...prev]);
    setCurrentFormId(data.id);
    setBuilderDraft(null);
    return data;
  } else {
    // UPDATE existing row
    const { data, error } = await supabase
      .from('forms')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating form:', error);
      alert('Could not save form (update). See console for details.');
      return null;
    }

    setForms(prev => prev.map(f => (f.id === data.id ? data : f)));
    return data;
  }
};

const saveAndExit = async (updated) => {
  const saved = await saveForm(updated);
  if (saved) {
    setBuilderDraft(null);
    setView('dashboard');
  }
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

 // in App (your handleLogout)
const handleLogout = async () => {
  // Clear both server & local cached session
  await supabase.auth.signOut({ scope: 'local' }); // ⬅️ important
  await supabase.auth.getSession();                // force a read to settle state

  // local UI cleanup
  localStorage.removeItem('view');
  localStorage.removeItem('currentFormId');
  setCurrentFormId(null);
  setEmbedModalFormId(null);
  setPreviewData(null);
  setBuilderDraft(null);
  setPublicFormData(null);
  setView('login');
};


  const currentFormForBuilder = builderDraft || forms.find(f => f.id === currentFormId);

    // --- RENDER LOGIC (after hooks) ---
  if (booting) {
    return <div className="min-h-screen grid place-items-center text-slate-500">Loading…</div>;
  }
// Inside the App component's return logic...
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
  }

 if (view === 'ai_builder') {
  return (
    <AIBuildPage
      forms={forms}
      onBuild={buildFormWithAIDashboard}
      onCancel={() => backToDashboard('forms')} // ✅ Use the new function
      onNavigate={backToDashboard}              // ✅ Pass the new function
      onLogout={handleLogout}
    />
  );
}


  if (view === 'dashboard') {
    return (
      <>
        {embedModalFormId && (
          <EmbedModal formId={embedModalFormId} forms={forms} onClose={() => setEmbedModalFormId(null)} />
        )}
     
       <DashboardPage
        key={initialDashboardTab} // ✅ Add a key to ensure the component re-renders
      initialTab={initialDashboardTab} // ✅ Pass the initial tab state
  forms={forms}

  createNewForm={createNewForm}
  editForm={editForm}
  deleteForm={deleteForm}
  shareForm={shareForm}
  duplicateForm={duplicateForm}
  onOpenAISection={() => setView('ai_builder')}
  onLogout={handleLogout}
  previewForm={(id) => {
    const f = forms.find((x) => x.id === id);
    if (f) { setBuilderDraft(null); setPreviewData(f); setView('preview'); }
  }}
/>
      </>
    );
  }

  if (view === 'builder' && currentFormForBuilder) {
    return (
      <FormBuilderPage
        initialForm={currentFormForBuilder}
        saveForm={saveForm}
        saveAndExit={saveAndExit}
        backToDashboard={() => {
          setCurrentFormId(null);
          setView('dashboard');
        }}
        previewForm={startPreviewFromBuilder}
      />
    );
  }

  if (view === 'preview' && previewData) {
    return <PreviewPage previewData={previewData} exitPreview={exitPreview} />;
  }

  // Fallback
  return <LoginPage />;
}  // closes App properly

/* -------------------------------------------------------
   Error Boundary wrapper
------------------------------------------------------- */
class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state = { hasError:false, err:null }; }
  static getDerivedStateFromError(err){ return { hasError:true, err }; }
  render(){
    if (this.state.hasError) {
      return (
        <div style={{padding:16,fontFamily:'monospace'}}>
          <h3>App crashed</h3>
          <pre style={{whiteSpace:'pre-wrap'}}>{String(this.state.err)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function AppWrapper(){
  return (
    <div className="ui-fix">
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </div>
  );
}

