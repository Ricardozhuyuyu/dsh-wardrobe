/* dsh-wardrobe — Client 半边：左栏图标 + 整页衣橱。
   系列大 tab / 套小 tab / 设定图 / 字段明细（发型上衣下衣裙鞋配饰包）/ 搜索 / 能出门筛选 / 随机一套 / 此刻-穿着联动。 */
window.__ModuleLoader__.load({
  id: '@local/dsh-wardrobe',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useRef, useState } = React;

    const PANEL_ID = 'dsh-wardrobe';
    const BASE = (() => {
      try {
        if (typeof document !== 'undefined' && document.baseURI) return String(new URL('dsh-wardrobe/', document.baseURI));
      } catch (error) { /* ignore */ }
      return '/dsh-wardrobe/';
    })();
    const DATA_URL = `${BASE}data.json`;
    const WEAR_URL = `${BASE}wear`;
    const EDIT_URL = `${BASE}edit`;
    const SETTINGS_URL = `${BASE}settings`;
    const UNLOCK_URL = `${BASE}unlock`;
    const LOCK_URL = `${BASE}lock`;

    /** 解锁令牌：放内存 + sessionStorage，关掉浏览器就没了。 */
    const KEY_STORE = 'dsh-wardrobe.key';
    let KEY = (() => {
      try {
        return window.sessionStorage.getItem(KEY_STORE) || '';
      } catch {
        return '';
      }
    })();
    const setKey = (value) => {
      KEY = String(value || '');
      try {
        if (KEY) window.sessionStorage.setItem(KEY_STORE, KEY);
        else window.sessionStorage.removeItem(KEY_STORE);
      } catch {
        /* 隐私模式：只留内存 */
      }
    };
    const withKey = (url) => (KEY ? `${url}${url.includes('?') ? '&' : '?'}k=${encodeURIComponent(KEY)}` : url);

    const mediaUrl = (src) => {
      const value = String(src || '');
      if (!value) return '';
      if (/^(https?:|data:|blob:)/i.test(value)) return value;
      return withKey(`${BASE}${value.replace(/^\/+/, '')}`);
    };

    const readPref = (key, fallback) => {
      try {
        return window.localStorage.getItem(`dsh-wardrobe.${key}`) || fallback;
      } catch {
        return fallback;
      }
    };
    const writePref = (key, value) => {
      try {
        window.localStorage.setItem(`dsh-wardrobe.${key}`, value);
      } catch {
        /* 隐私模式：记不住就算了 */
      }
    };

    function HangerIcon({ size = 16 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.1, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, focusable: false,
      },
      h('path', { d: 'M8 4.2a1.5 1.5 0 1 1 1.5 1.5c0 .6-.5.9-1 1.2' }),
      h('path', { d: 'M8.5 6.9 3 10.4a1 1 0 0 0 .55 1.8h8.9a1 1 0 0 0 .55-1.8L8.5 6.9' }));
    }

    const CSS = `
.yw-root{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;outline:none}
.yw-head{display:flex;align-items:center;gap:10px;padding:16px 24px 8px;flex-wrap:wrap}
.yw-title{font-size:17px;font-weight:600;letter-spacing:.02em}
.yw-sub{color:var(--dsw-alias-label-secondary);font-size:12px}
.yw-grow{flex:1;min-width:8px}
.yw-search{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:7px;padding:5px 9px;font-size:12.5px;font-family:inherit;width:190px;outline:none}
.yw-search::placeholder{color:var(--dsw-alias-label-secondary);opacity:.8}
.yw-search:focus{border-color:var(--dsw-alias-brand-primary)}
.yw-seg{display:flex;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;overflow:hidden}
.yw-seg button{border:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;font-family:inherit;padding:5px 10px;cursor:pointer}
.yw-seg button+button{border-left:1px solid var(--dsw-alias-border-l1)}
.yw-seg button[data-on="1"]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600}
.yw-ghost{border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:7px;padding:5px 10px;font-size:12px;font-family:inherit;cursor:pointer}
.yw-ghost:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}
.yw-ghost:disabled{opacity:.45;cursor:default}
.yw-series{display:flex;gap:6px;padding:2px 24px 8px;flex-wrap:wrap}
.yw-stab{display:flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:5px 12px;font-size:12.5px;cursor:pointer;font-family:inherit}
.yw-stab:hover{color:var(--dsw-alias-label-primary)}
.yw-stab[data-on="1"]{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.yw-stab b{font-weight:600}
.yw-stab em{font-style:normal;font-size:11px;opacity:.55}
.yw-otabs{display:flex;gap:4px;padding:0 24px 10px;overflow-x:auto;scrollbar-width:none}
.yw-otabs::-webkit-scrollbar{display:none}
.yw-otab{flex:none;display:flex;align-items:center;gap:6px;border:1px solid transparent;border-bottom-color:var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:6px 6px 0 0;padding:5px 10px;font-size:12.5px;cursor:pointer;font-family:inherit;white-space:nowrap}
.yw-otab:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1)}
.yw-otab[data-on="1"]{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1);border-bottom-color:transparent;font-weight:600}
.yw-otab i{font-style:normal;font-size:10.5px;opacity:.5;letter-spacing:.03em}
.yw-otab u{text-decoration:none;font-size:10px;padding:0 4px;border-radius:3px;background:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-bg-base);opacity:.85}
.yw-otab s{text-decoration:none;width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-state-success-primary)}
.yw-body{flex:1;min-height:0;display:flex;border-top:1px solid var(--dsw-alias-border-l1)}
.yw-stage{flex:1;min-width:0;max-width:calc(100% - 412px);display:flex;flex-direction:column;align-items:stretch;justify-content:center;padding:16px 16px 0;position:relative;min-height:0}
.yw-stagebody{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;position:relative}
.yw-figure{position:relative;display:flex;align-items:center;justify-content:center;max-width:100%;max-height:100%}
.yw-stage img{max-width:100%;max-height:calc(100vh - 300px);object-fit:contain;border-radius:10px;cursor:zoom-in;box-shadow:0 10px 30px rgba(0,0,0,.16);display:block}
.yw-cap{position:absolute;left:50%;bottom:-6px;transform:translateX(-50%);background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:2px 10px;font-size:11px;white-space:nowrap}
.yw-arrow{position:absolute;top:50%;transform:translateY(-50%);width:30px;height:30px;border-radius:50%;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:14px;line-height:1;display:flex;align-items:center;justify-content:center;opacity:.75}
.yw-arrow:hover{opacity:1;color:var(--dsw-alias-label-primary)}
.yw-arrow[data-side="l"]{left:-6px}
.yw-arrow[data-side="r"]{right:-6px}
.yw-empty{color:var(--dsw-alias-label-secondary);font-size:12.5px;border:1px dashed var(--dsw-alias-border-l2);border-radius:12px;padding:32px 40px;text-align:center;line-height:1.9;max-width:340px}
.yw-empty b{color:var(--dsw-alias-state-warn-primary);font-weight:600}
.yw-side{width:412px;flex:none;border-left:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);padding:18px 18px 22px;overflow:auto;display:flex;flex-direction:column;gap:10px}
.yw-name{display:flex;align-items:center;gap:8px;font-size:19px;font-weight:600;letter-spacing:.04em;flex-wrap:wrap}
.yw-id{font-size:11px;font-weight:400;letter-spacing:.06em;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);border-radius:4px;padding:1px 6px}
.yw-chip{font-size:10.5px;font-weight:500;letter-spacing:.04em;border-radius:999px;padding:1px 8px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}
.yw-chip[data-wear="out"]{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}
.yw-chip[data-wear="home"]{color:var(--dsw-alias-state-idle-primary);border-color:var(--dsw-alias-state-idle-primary)}
.yw-chip[data-wear="once"]{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}
.yw-chip[data-miss="1"]{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.yw-sum{font-size:12.5px;line-height:1.8;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word}
.yw-sum[data-full="1"]{color:var(--dsw-alias-label-primary)}
.yw-more{align-self:flex-start;border:none;background:transparent;color:var(--dsw-alias-brand-primary);font-size:12px;cursor:pointer;padding:0;font-family:inherit}
.yw-sep{height:1px;background:var(--dsw-alias-border-l1);margin:2px 0}
.yw-cap2{font-size:11px;letter-spacing:.08em;color:var(--dsw-alias-label-secondary);opacity:.85;display:flex;align-items:baseline;gap:6px}
.yw-cap2 em{font-style:normal;opacity:.7}
.yw-fields{display:flex;flex-direction:column;gap:3px}
.yw-frow{display:flex;gap:8px;font-size:12px;line-height:1.6;align-items:baseline}
.yw-flabel{flex:none;width:34px;color:var(--dsw-alias-label-secondary);opacity:.75;font-size:11.5px}
.yw-fval{flex:1;min-width:0;color:var(--dsw-alias-label-primary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.yw-frow[data-blank="1"] .yw-fval{color:var(--dsw-alias-state-warn-primary);opacity:.75;font-style:italic}
.yw-tags{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.yw-tag{border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:10.5px;font-family:inherit;cursor:pointer;letter-spacing:.02em}
.yw-tag:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}
.yw-tag[data-edit="1"]{margin-left:auto;border-style:dashed;opacity:.8}
.yw-finput{flex:1;min-width:0;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border-radius:6px;padding:3px 7px;font-size:12px;font-family:inherit;outline:none}
.yw-finput:focus{border-color:var(--dsw-alias-brand-primary)}
.yw-tagedit{display:flex;gap:8px;align-items:center}
.yw-editbar{display:flex;gap:8px;align-items:center}
.yw-thumbs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.yw-tag--dash{margin-left:auto;border-style:dashed;font-size:10.5px;padding:1px 7px}
.yw-tag--danger{font-size:10.5px;padding:1px 7px;border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent);color:var(--dsw-alias-state-error-primary)}
.yw-tag--danger:hover{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent)}
.yw-tag--dash[data-on="1"]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary)}
.yw-filepick{cursor:pointer;position:relative;overflow:hidden}
.yw-filepick input{position:absolute;inset:0;opacity:0;cursor:pointer}
.yw-dialog code{font-size:11px;background:var(--dsw-alias-bg-layer-2);border-radius:5px;padding:1px 5px;display:inline-block;margin:2px 0}
.yw-catpick{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);border-radius:10px;padding:8px;display:flex;flex-wrap:wrap;gap:5px;align-items:center;font-size:11px}
.yw-catpick em{font-style:normal;color:var(--dsw-alias-label-secondary);flex-basis:100%;margin-bottom:2px}
.yw-drop{position:absolute;top:3px;right:3px;width:18px;height:18px;line-height:1;border-radius:50%;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:12px;padding:0;opacity:.55;transition:opacity .12s;box-shadow:0 1px 4px rgba(0,0,0,.18)}
.yw-thumb:hover .yw-drop{opacity:1}
.yw-thumb[data-on="1"] .yw-drop{opacity:.75}
.yw-drop:hover{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.yw-hiddenbox{border:1px dashed var(--dsw-alias-border-l1);border-radius:8px;padding:6px 8px;margin-top:8px;font-size:11px;color:var(--dsw-alias-label-secondary);display:flex;flex-direction:column;gap:4px}
.yw-hiddenrow{display:flex;align-items:center;justify-content:space-between;gap:6px}
.yw-hiddenrow span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.yw-thumb{position:relative;display:block;padding:0;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);border-radius:8px;overflow:hidden;cursor:pointer;aspect-ratio:3/4}
.yw-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.yw-thumb[data-on="1"]{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 1px var(--dsw-alias-brand-primary) inset}
.yw-thumb span{position:absolute;left:0;right:0;bottom:0;padding:3px 4px;font-size:10px;line-height:1.2;color:#fff;background:linear-gradient(transparent,rgba(0,0,0,.72));text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.yw-now{border:1px solid var(--dsw-alias-border-l1);border-radius:9px;padding:9px 11px;background:var(--dsw-alias-bg-layer-2);display:flex;flex-direction:column;gap:5px}
.yw-nowhead{display:flex;align-items:baseline;gap:6px;font-size:12px}
.yw-nowhead b{font-weight:600}
.yw-nowhead span{color:var(--dsw-alias-label-secondary);font-size:11px}
.yw-nowtext{font-size:11.5px;line-height:1.7;color:var(--dsw-alias-label-secondary);max-height:72px;overflow:auto;white-space:pre-wrap;word-break:break-word}
.yw-primary{border:1px solid var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);border-radius:7px;padding:5px 11px;font-size:12px;font-family:inherit;cursor:pointer;font-weight:600}
.yw-primary:disabled{opacity:.5;cursor:default}
.yw-toast{font-size:11.5px;color:var(--dsw-alias-state-success-primary)}
.yw-toast[data-err="1"]{color:var(--dsw-alias-state-error-primary)}
.yw-zoom{position:fixed;inset:0;z-index:60;background:rgba(8,8,10,.86);display:flex;align-items:center;justify-content:center;padding:24px;cursor:zoom-out}
.yw-zoom img{max-width:100%;max-height:100%;object-fit:contain;border-radius:8px}
.yw-specwrap,.yw-storywrap{display:flex;flex-direction:column;gap:10px;min-height:0}
.yw-sidecards{display:flex;gap:6px}
.yw-card{flex:1;font-family:inherit;font-size:11.5px;padding:6px 8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.yw-card[data-on="1"]{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-brand-primary);background:color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent);font-weight:600}
.yw-storytop{display:flex;align-items:center;gap:8px}
.yw-srow{border-left:2px solid var(--dsw-alias-border-l2);padding:2px 0 2px 10px;display:flex;flex-direction:column;gap:2px}
.yw-srow[data-kind="picked"]{border-left-color:var(--dsw-alias-brand-primary)}
.yw-sdate{display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--dsw-alias-label-secondary);letter-spacing:.02em}
.yw-sdate .yw-drop{opacity:.45;font-size:11px}
.yw-srow:hover .yw-sdate .yw-drop{opacity:.9}
.yw-sraw{margin-top:3px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.yw-sraw summary{cursor:pointer;opacity:.7}
.yw-sraw div{margin-top:3px;line-height:1.6;white-space:pre-wrap}
.yw-srow[data-editing="1"]{border-left-color:var(--dsw-alias-brand-primary);background:color-mix(in srgb, var(--dsw-alias-brand-primary) 6%, transparent);padding:8px}
.yw-seditrow{display:flex;gap:5px;align-items:center}
.yw-stextarea{resize:vertical;line-height:1.6;min-height:62px;font-family:inherit}
.yw-sedited{font-size:9.5px;padding:0 5px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}
.yw-stext{font-size:12.5px;line-height:1.75;color:var(--dsw-alias-label-primary)}
.yw-candsearch{display:flex;gap:6px;align-items:center;padding:0 14px 8px}
.yw-candsearch .yw-finput{flex:1}
.yw-candlist{display:flex;flex-direction:column;gap:5px;overflow:auto;min-height:0;padding-right:2px}
.yw-cand{display:flex;gap:8px;align-items:flex-start;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:6px 8px;background:var(--dsw-alias-bg-layer-2);cursor:pointer}
.yw-cand[data-on="1"]{border-color:var(--dsw-alias-brand-primary);background:color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent)}
.yw-cand input{margin-top:2px;accent-color:var(--dsw-alias-brand-primary)}
.yw-candbody{display:flex;flex-direction:column;gap:2px;min-width:0}
.yw-canddate{font-size:10.5px;color:var(--dsw-alias-label-secondary)}
.yw-candtext{font-size:12px;line-height:1.65}
.yw-custom{border-top:1px solid var(--dsw-alias-border-l1);padding-top:8px;display:flex;flex-direction:column;gap:5px}
.yw-customrow{display:flex;gap:6px}
.yw-dateinput{width:118px;flex:none}
.yw-hint{font-size:11px;color:var(--dsw-alias-label-secondary)}
.yw-actions{display:flex;gap:6px}
.yw-actions .yw-primary{flex:1}
.yw-dlg--wide{width:min(1040px,100%);max-height:86vh;overflow:hidden}
.yw-dlghead{display:flex;align-items:baseline;gap:8px}
.yw-dlghead span{font-size:11px;color:var(--dsw-alias-label-secondary)}
.yw-catbar{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
.yw-catedit{display:flex;flex-direction:column;gap:5px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;padding:8px}
.yw-caterow{display:flex;gap:5px;align-items:center}
.yw-caterow .yw-finput{flex:1}
.yw-adminbar{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
.yw-adminmsg{font-size:11.5px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:7px;padding:4px 8px}
.yw-adminbody{overflow:auto;min-height:0;padding-right:2px}
.yw-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:8px}
.yw-cell{border:1px solid var(--dsw-alias-border-l1);border-radius:9px;padding:6px;display:flex;flex-direction:column;gap:5px;background:var(--dsw-alias-bg-layer-2);min-width:0}
.yw-cell img{width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:6px;background:var(--dsw-alias-bg-base)}
.yw-cell[data-hidden="1"]{opacity:.72;border-style:dashed}
.yw-cellmiss{width:100%;aspect-ratio:3/4;display:flex;align-items:center;justify-content:center;border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);font-size:11px}
.yw-cellmeta{display:flex;align-items:baseline;gap:4px;font-size:11px;min-width:0}
.yw-cellmeta b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.yw-cellmeta span{color:var(--dsw-alias-label-secondary);font-size:10px}
.yw-cellops{display:flex;gap:4px;align-items:center}
.yw-cellops .yw-catsel{flex:1;margin-left:0;min-width:0}
.yw-story{overflow:auto;display:flex;flex-direction:column;gap:12px;font-size:12.5px;line-height:1.8}
.yw-story h4{margin:0 0 3px;font-size:12px;letter-spacing:.06em;color:var(--dsw-alias-label-secondary);font-weight:600}
.yw-story p{margin:0;color:var(--dsw-alias-label-primary);white-space:pre-wrap}
.yw-story i{font-style:normal;color:var(--dsw-alias-label-secondary);font-size:11px}
.yw-storymore summary{cursor:pointer;font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.yw-storymore section{margin-top:8px}
.yw-mask{position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:24px}
.yw-dlg{width:min(460px,100%);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:18px;display:flex;flex-direction:column;gap:10px;box-shadow:0 24px 60px rgba(0,0,0,.35)}
.yw-dlg h3{margin:0;font-size:15px;font-weight:600}
.yw-dlg p{margin:0;font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.7}
.yw-worn{font-size:12px;line-height:1.7;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);word-break:break-word;max-height:96px;overflow:auto}
.yw-ta{width:100%;box-sizing:border-box;min-height:70px;resize:vertical;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12.5px;line-height:1.7;padding:8px 10px;outline:none}
.yw-ta:focus{border-color:var(--dsw-alias-brand-primary)}
.yw-dlgfoot{display:flex;justify-content:flex-end;gap:8px;align-items:center}
.yw-state{flex:1;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary);font-size:13px;padding:40px;text-align:center;line-height:1.9}
.yw-state[data-err="1"]{color:var(--dsw-alias-state-error-primary)}
.yw-cats{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;padding:10px 4px 12px;flex:none}
.yw-cats:empty{display:none}
.yw-cat{display:inline-flex;align-items:baseline;gap:5px;border:1px solid transparent;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:4px 12px;font-size:11.5px;font-family:inherit;cursor:pointer;transition:color .12s,border-color .12s,background .12s}
.yw-cat:hover{color:var(--dsw-alias-label-primary)}
.yw-cat em{font-style:normal;font-size:10px;opacity:.65}
.yw-cat[data-on="1"]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-weight:600}
.yw-cat[data-locked="1"]::after{content:"🔒";font-size:9px;opacity:.8}
.yw-lock{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;border:1px dashed var(--dsw-alias-border-l2);border-radius:12px;padding:28px;text-align:center;color:var(--dsw-alias-label-secondary);min-height:220px}
.yw-lock b{font-size:13.5px;color:var(--dsw-alias-label-primary)}
.yw-lock p{margin:0;font-size:12px;line-height:1.8;max-width:340px}
.yw-lockrow{display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap}
.yw-thumb[data-locked="1"]{border-style:dashed}
.yw-thumblock{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--dsw-alias-label-secondary);background:repeating-linear-gradient(45deg,var(--dsw-alias-bg-layer-2),var(--dsw-alias-bg-layer-2) 6px,var(--dsw-alias-bg-base) 6px,var(--dsw-alias-bg-base) 12px)}
.yw-photoedit{display:flex;flex-direction:column;gap:5px;border-top:1px dashed var(--dsw-alias-border-l1);padding-top:8px;max-height:190px;overflow:auto}
.yw-prow{display:flex;gap:8px;align-items:center}
.yw-pname{flex:1;min-width:0;font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.yw-prow select{flex:none;width:104px}
@media (max-width:980px){.yw-body{flex-direction:column}.yw-side{width:auto;border-left:none;border-top:1px solid var(--dsw-alias-border-l1)}.yw-stage img{max-height:50vh}}
`;

    function useWardrobeData() {
      const [state, setState] = useState({ status: 'loading', data: null, error: '' });
      const [nonce, setNonce] = useState(0);
      useEffect(() => {
        let alive = true;
        setState((prev) => ({ ...prev, status: prev.data ? 'refreshing' : 'loading', error: '' }));
        const url = withKey(nonce === 0 ? DATA_URL : `${DATA_URL}?t=${Date.now()}`);
        fetch(url, { cache: 'no-store' })
          .then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
          })
          .then((data) => {
            if (alive) setState({ status: 'ready', data, error: '' });
          })
          .catch((error) => {
            if (alive) setState((prev) => ({ ...prev, status: prev.data ? 'ready' : 'error', error: String(error?.message || error) }));
          });
        return () => {
          alive = false;
        };
      }, [nonce]);
      return { ...state, reload: useCallback(() => setNonce((n) => n + 1), []) };
    }

    /** 差一个字也认：只在词长 ≥3 时开，两字的差别太大（「长靴」和「长裤」只差一个）。 */
    const typoHit = (hay, word) => {
      if (word.length < 3) return false;
      for (const token of hay.split(/[^0-9a-z\u4e00-\u9fff]+/)) {
        if (!token || Math.abs(token.length - word.length) > 1) continue;
        let diff = 0;
        let i = 0;
        let j = 0;
        while (i < token.length && j < word.length) {
          if (token[i] === word[j]) {
            i += 1;
            j += 1;
            continue;
          }
          diff += 1;
          if (diff > 1) break;
          if (token.length > word.length) i += 1;
          else if (token.length < word.length) j += 1;
          else {
            i += 1;
            j += 1;
          }
        }
        if (diff + (token.length - i) + (word.length - j) <= 1) return true;
      }
      return false;
    };

    /** 拆开的词也认：搜「白毛衣」能认出「米白针织毛衣」（同一个词块里按顺序含有这三字）。 */
    const looseHit = (hay, word) => {
      if (word.length < 3) return false;
      for (const token of hay.split(/[^0-9a-z\u4e00-\u9fff]+/)) {
        if (token.length < word.length) continue;
        let j = 0;
        for (let i = 0; i < token.length && j < word.length; i += 1) if (token[i] === word[j]) j += 1;
        if (j === word.length) return true;
      }
      return false;
    };

    const haystackOf = (item) => [
      item.id, item.name, item.wearLabel, item.summary, item.detail,
      ...(item.tags || []),
      ...(item.fields || []).map((field) => `${field.label} ${field.value}`),
      ...(item.images || []).map((image) => image.label),
    ].join(' ').toLowerCase();

    function WardrobePage() {
      const { status, data, error, reload } = useWardrobeData();
      const [seriesKey, setSeriesKey] = useState(() => readPref('series', 'G'));
      const [outfitId, setOutfitId] = useState(() => readPref('outfit', ''));
      const [imageIndex, setImageIndex] = useState(0);
      const [fullDetail, setFullDetail] = useState(false);
      const [zoom, setZoom] = useState(null);
      const [query, setQuery] = useState('');
      const [filter, setFilter] = useState('all');   // all | out | missing
      const [wearOpen, setWearOpen] = useState(false);
      const [wearNote, setWearNote] = useState('');
      const [wearSaving, setWearSaving] = useState(false);
      const [editing, setEditing] = useState(false);
      const [draft, setDraft] = useState({});        // kind -> 输入框里的值
      const [tagDraft, setTagDraft] = useState('');  // 手工标签，顿号分隔
      const [aliasDraft, setAliasDraft] = useState('');  // 别名（改过名的老名字）
      const [photoDraft, setPhotoDraft] = useState({}); // 文件名 -> 分类
      const [catKey, setCatKey] = useState('');      // 当前图的分类
      const [catEditOpen, setCatEditOpen] = useState(false); // 「改这张归类」的面板
      const [backupOpen, setBackupOpen] = useState(false);   // 备份/迁移面板
      const [backupMsg, setBackupMsg] = useState('');
      const [adminOpen, setAdminOpen] = useState(false);
      const [admin, setAdmin] = useState(null);         // { cats, rows }
      const [adminTab, setAdminTab] = useState('all');
      const [adminBusy, setAdminBusy] = useState(false);
      const [catDraft, setCatDraft] = useState([]);      // 正在编辑的分类表
      const [catEditing, setCatEditing] = useState(false);
      const [adminMsg, setAdminMsg] = useState('');
      const [sideTab, setSideTab] = useState(() => {
        try { return localStorage.getItem('dsh-wardrobe.side') || 'spec'; } catch { return 'spec'; }
      });
      const [story, setStory] = useState(null);
      const [storyBusy, setStoryBusy] = useState(false);
      const [storyErr, setStoryErr] = useState('');
      const [checkOpen, setCheckOpen] = useState(false);
      const [candQuery, setCandQuery] = useState('');
      const [cands, setCands] = useState(null);
      const [candBusy, setCandBusy] = useState(false);
      const [candPick, setCandPick] = useState({});
      const [customDate, setCustomDate] = useState('');
      const [sEditKey, setSEditKey] = useState('');
      const [sDate, setSDate] = useState('');
      const [sText, setSText] = useState('');
      const [sBusy, setSBusy] = useState(false);
      const [sRewriting, setSRewriting] = useState('');
      const [customText, setCustomText] = useState('');
      const [lockPwd, setLockPwd] = useState('');
      const [lockErr, setLockErr] = useState('');
      const [lockBusy, setLockBusy] = useState(false);
      const [pwdOpen, setPwdOpen] = useState(false);
      const [pwdCurrent, setPwdCurrent] = useState('');
      const [pwdNew, setPwdNew] = useState('');
      const [pwdMsg, setPwdMsg] = useState('');
      const [pwdBusy, setPwdBusy] = useState(false);
      const [saving, setSaving] = useState(false);
      const [toast, setToast] = useState(null);      // { text, error }
      const rootRef = useRef(null);

      const series = data?.series || [];
      const fieldKinds = data?.fieldKinds || [];
      const nowState = data?.state || null;

      const filtered = useMemo(() => {
        const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
        if (!terms.length && filter === 'all') return series;
        const lexicon = [];
        for (const bucket of series) for (const item of bucket.items) for (const tag of item.tags || []) lexicon.push(tag);
        const variants = terms.map((term) => {
          const out = new Set([term]);
          const stem = term.replace(/[子儿]$/, '');
          if (stem && stem !== term) out.add(stem);
          for (const tag of lexicon) {
            if (tag.includes(term) || term.includes(tag) || tag.includes(stem)) out.add(tag);
          }
          return [...out];
        });
        return series
          .map((bucket) => ({
            ...bucket,
            items: bucket.items.filter((item) => {
              if (filter === 'out' && item.wear !== 'out') return false;
              if (filter === 'missing' && item.count > 0) return false;
              if (!terms.length) return true;
              const hay = haystackOf(item);
              return variants.every((list, idx) =>
                list.some((word) => hay.includes(word))
                || typoHit(hay, terms[idx])
                || looseHit(hay, terms[idx]));
            }),
          }))
          .filter((bucket) => bucket.items.length > 0);
      }, [series, filter, query]);

      const activeSeries = filtered.find((bucket) => bucket.key === seriesKey) || filtered[0] || null;
      const activeOutfit = activeSeries
        ? activeSeries.items.find((item) => item.id === outfitId) || activeSeries.items[0] || null
        : null;
      const groups = activeOutfit?.groups || [];
      // 默认先看设定整图；没有就看这套自己的图，最后才轮到合集。
      const defaultCat = groups.find((group) => group.key === 'setting')
        || groups.find((group) => group.key === 'other')
        || groups[0] || null;
      const activeCat = groups.find((group) => group.key === catKey) || defaultCat;
      const images = activeCat?.images || [];
      const safeIndex = images.length ? Math.min(imageIndex, images.length - 1) : 0;
      const currentImage = images[safeIndex] || null;
      const totalImages = useMemo(
        () => series.reduce((sum, item) => sum + item.items.reduce((n, outfit) => n + outfit.count, 0), 0),
        [series],
      );
      const shownCount = useMemo(() => filtered.reduce((sum, bucket) => sum + bucket.items.length, 0), [filtered]);
      const missingCount = useMemo(
        () => series.reduce((sum, bucket) => sum + bucket.items.filter((item) => item.count === 0).length, 0),
        [series],
      );

      useEffect(() => {
        if (!activeSeries) return;
        writePref('series', activeSeries.key);
      }, [activeSeries?.key]);

      useEffect(() => {
        if (!activeOutfit) return;
        writePref('outfit', activeOutfit.id);
        setImageIndex(0);
        setCatKey('');
        setPhotoDraft({});
        setFullDetail(false);
        setEditing(false);
      }, [activeOutfit?.id]);

      useEffect(() => {
        setImageIndex(0);
        setFullDetail(false);
      }, [activeSeries?.key]);

      const step = useCallback((delta) => {
        if (!activeSeries) return;
        const items = activeSeries.items;
        const index = Math.max(0, items.findIndex((item) => item.id === activeOutfit?.id));
        const next = items[(index + delta + items.length) % items.length];
        if (next) setOutfitId(next.id);
      }, [activeSeries, activeOutfit?.id]);

      const stepImage = useCallback((delta) => {
        if (images.length < 2) return;
        setImageIndex((prev) => (prev + delta + images.length) % images.length);
      }, [images.length]);

      const randomOutfit = useCallback(() => {
        const pool = [];
        for (const bucket of filtered) for (const item of bucket.items) pool.push({ bucket: bucket.key, item });
        if (!pool.length) return;
        const picked = pool[Math.floor(Math.random() * pool.length)];
        setSeriesKey(picked.bucket);
        setOutfitId(picked.item.id);
      }, [filtered]);

      const patchPhotos = useCallback(async ({ photos, hide, restore }) => {
        if (!activeOutfit) return;
        try {
          const response = await fetch(EDIT_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: activeOutfit.id, photos, hide, restore }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload.error) throw new Error(payload.error || `HTTP ${response.status}`);
          setToast({ text: hide ? '移出图库了（文件没删）' : restore ? '加回图库了' : '分类改好了', error: false });
          reload();
        } catch (err) {
          setToast({ text: `没改成：${err.message}`, error: true });
        }
      }, [activeOutfit, reload]);

      const setImageCat = (name, cat) => patchPhotos({ photos: { [name]: cat } });

      const removeImage = (name) => {
        if (!name) return;
        if (!window.confirm(`把「${name}」移出图库？\n只是衣橱里不显示，图片文件不动。`)) return;
        setImageIndex(0);
        patchPhotos({ hide: [name] });
      };

      const restoreImage = (name) => patchPhotos({ restore: [name] });

      const importBackup = async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const response = await fetch(`${BASE}import`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: text,
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload.error) throw new Error(payload.error || `HTTP ${response.status}`);
          setBackupMsg(`导入好了：${payload.merged} 套，现在一共 ${payload.total} 套有记录`);
          reload();
        } catch (err) {
          setBackupMsg(`没导进去：${err.message}`);
        } finally {
          event.target.value = '';
        }
      };

      const openWear = useCallback(() => {
        if (!activeOutfit) return;
        setWearNote(nowState?.stateText || '');
        setToast(null);
        setWearOpen(true);
      }, [activeOutfit, nowState?.stateText]);

      const submitWear = useCallback(async () => {
        if (!activeOutfit || wearSaving) return;
        setWearSaving(true);
        setToast(null);
        try {
          const response = await fetch(WEAR_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: activeOutfit.id, state: wearNote }),
          });
          const text = await response.text();
          if (!response.ok) throw new Error(text.slice(0, 200) || `HTTP ${response.status}`);
          const next = JSON.parse(text);
          setWearOpen(false);
          setToast({ text: `记下了：${next.when || ''} 穿 ${activeOutfit.name}`, error: false });
          reload();
        } catch (failure) {
          setToast({ text: `没写成：${String(failure?.message || failure)}`, error: true });
        } finally {
          setWearSaving(false);
        }
      }, [activeOutfit, wearNote, wearSaving, reload]);

      const unlock = useCallback(() => {
        if (lockBusy) return;
        setLockBusy(true);
        setLockErr('');
        fetch(UNLOCK_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ password: lockPwd }),
        })
          .then(async (response) => {
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
            setKey(body.token);
            setLockPwd('');
            reload();
          })
          .catch((error) => setLockErr(String(error?.message || error)))
          .finally(() => setLockBusy(false));
      }, [lockPwd, lockBusy, reload]);

      const savePassword = useCallback(() => {
        if (pwdBusy) return;
        setPwdBusy(true);
        setPwdMsg('');
        fetch(SETTINGS_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ password: pwdNew, current: pwdCurrent }),
        })
          .then(async (response) => {
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
            setPwdOpen(false);
            setPwdCurrent('');
            setPwdNew('');
            setKey('');
            reload();
          })
          .catch((error) => setPwdMsg(String(error?.message || error)))
          .finally(() => setPwdBusy(false));
      }, [pwdBusy, pwdNew, pwdCurrent, reload]);

      const relock = useCallback(() => {
        fetch(LOCK_URL, { method: 'POST' }).catch(() => {}).then(() => {
          setKey('');
          reload();
        });
      }, [reload]);

      const startEdit = useCallback(() => {
        if (!activeOutfit) return;
        const next = {};
        for (const kind of fieldKinds) next[kind.key] = '';
        for (const field of activeOutfit.fields || []) next[field.key] = field.value;
        setDraft(next);
        setTagDraft((activeOutfit.manualTags || []).join('、'));
        const photos = {};
        for (const image of activeOutfit.images || []) photos[image.name] = image.cat;
        setPhotoDraft(photos);
        setToast(null);
        setEditing(true);
      }, [activeOutfit, fieldKinds]);

      const saveEdit = useCallback(async () => {
        if (!activeOutfit || saving) return;
        setSaving(true);
        setToast(null);
        try {
          const base = {};
          for (const field of activeOutfit.fields || []) base[field.key] = field.value;
          const changed = {};
          for (const kind of fieldKinds) {
            const before = base[kind.key] || '';
            const after = String(draft[kind.key] ?? '').trim();
            if (after !== before) changed[kind.key] = after;
          }
          const tags = tagDraft.split(/[、,，;；\s]+/).map((tag) => tag.trim()).filter(Boolean);
          const beforeTags = activeOutfit.manualTags || [];
          const tagsChanged = tags.join('|') !== beforeTags.join('|');
          const aliases = aliasDraft.split(/[、,，;；\s]+/).map((name) => name.trim()).filter(Boolean);
          const beforeAliases = activeOutfit.aliases || [];
          const aliasesChanged = aliases.join('|') !== beforeAliases.join('|');
          const photos = {};
          for (const image of activeOutfit.images || []) {
            const was = image.cat;
            const now = photoDraft[image.name] ?? was;
            if (now !== was) photos[image.name] = now;
          }
          const photosChanged = Object.keys(photos).length > 0;
          if (!Object.keys(changed).length && !tagsChanged && !photosChanged && !aliasesChanged) {
            setEditing(false);
            return;
          }
          const response = await fetch(EDIT_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              id: activeOutfit.id,
              fields: changed,
              tags: tagsChanged ? tags : undefined,
              photos: photosChanged ? photos : undefined,
              aliases: aliasesChanged ? aliases : undefined,
            }),
          });
          const text = await response.text();
          if (!response.ok) throw new Error(text.slice(0, 200) || `HTTP ${response.status}`);
          setEditing(false);
          setToast({ text: '改好了，已经写进 fields.json', error: false });
          reload();
        } catch (failure) {
          setToast({ text: `没存上：${String(failure?.message || failure)}`, error: true });
        } finally {
          setSaving(false);
        }
      }, [activeOutfit, saving, draft, tagDraft, photoDraft, fieldKinds, reload]);

      // 切到「故事」页、或换了一套，就去拉那套的时间线
      useEffect(() => {
        if (sideTab !== 'story') return;
        if (!activeOutfit?.id) return;
        if (story?.id === activeOutfit.id) return;
        loadStory(activeOutfit.id);
      }, [sideTab, activeOutfit?.id, story?.id]);

      // 关掉候选面板的快捷键
      useEffect(() => {
        if (!checkOpen) return undefined;
        const onEsc = (event) => { if (event.key === 'Escape') setCheckOpen(false); };
        window.addEventListener('keydown', onEsc);
        return () => window.removeEventListener('keydown', onEsc);
      }, [checkOpen]);

      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape' && (backupOpen || pwdOpen)) {
            event.preventDefault();
            setBackupOpen(false);
            setPwdOpen(false);
            return;
          }
          if (wearOpen) {
            if (event.key === 'Escape') {
              event.preventDefault();
              setWearOpen(false);
            }
            return;
          }
          if (zoom) {
            if (event.key === 'Escape') {
              event.preventDefault();
              setZoom(null);
            }
            return;
          }
          const root = rootRef.current;
          if (!root || !root.contains(document.activeElement)) return;
          if (event.metaKey || event.ctrlKey || event.altKey) return;
          const tag = document.activeElement?.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA') return;
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            step(1);
          } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            step(-1);
          } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && filtered.length > 1) {
            event.preventDefault();
            const index = Math.max(0, filtered.findIndex((item) => item.key === activeSeries?.key));
            const next = filtered[(index + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length];
            if (next) setSeriesKey(next.key);
          }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [zoom, wearOpen, backupOpen, pwdOpen, step, filtered, activeSeries?.key]);

      const loadAdmin = useCallback(async () => {
        setAdminBusy(true);
        try {
          const response = await fetch(`${BASE}gallery`, { cache: 'no-store' });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
          setAdmin(payload);
          setCatDraft(payload.cats);
        } catch (err) {
          setToast({ text: `后台没打开：${err.message}`, error: true });
          setAdminOpen(false);
        } finally {
          setAdminBusy(false);
        }
      }, []);

      const openAdmin = () => {
        setAdminOpen(true);
        setAdminMsg('');
        setAdminTab('all');
        setCatEditing(false);
        setAdmin(null);
        loadAdmin();
      };

      const patchRow = (name, patch) => setAdmin((current) => (current
        ? { ...current, rows: current.rows.map((row) => (row.name === name ? { ...row, ...patch } : row)) }
        : current));

      const setRowCat = async (row, cat) => {
        patchRow(row.name, { cat, manual: cat });
        setAdminMsg(`正在把「${row.name}」归到 ${(admin?.cats || []).find((c) => c.key === cat)?.label || cat}…`);
        try {
          const response = await fetch(EDIT_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: row.outfitId, photos: { [row.name]: cat } }),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          setAdminMsg(`已改：${row.outfitName} 的「${row.name}」→ ${(admin?.cats || []).find((c) => c.key === cat)?.label || cat}`);
          await loadAdmin();
          reload();
        } catch (err) {
          patchRow(row.name, { cat: row.cat, manual: row.manual });
          setAdminMsg(`没改成：${err.message}`);
        }
      };

      const toggleRowHidden = async (row, nextHidden) => {
        const hidden = nextHidden;
        patchRow(row.name, { hidden });
        setAdminMsg(hidden ? `正在把「${row.name}」移出图库…` : `正在把「${row.name}」放回来…`);
        try {
          const body = hidden ? { id: row.outfitId, hide: [row.name] } : { id: row.outfitId, restore: [row.name] };
          const response = await fetch(EDIT_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload?.error) throw new Error(payload?.error || `HTTP ${response.status}`);
          setAdminMsg(hidden ? `已移出「${row.name}」（文件没删，能在「已移出」里放回来）` : `已放回「${row.name}」`);
          await loadAdmin();
          reload();
        } catch (err) {
          patchRow(row.name, { hidden: !hidden });
          setAdminMsg(`没处理成：${err.message}`);
        }
      };

      const persistCats = async () => {
        try {
          const response = await fetch(`${BASE}cats`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ cats: catDraft }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload.error) throw new Error(payload.error || `HTTP ${response.status}`);
          setCatEditing(false);
          await loadAdmin();
          reload();
        } catch (err) {
          setToast({ text: `分类没存上：${err.message}`, error: true });
        }
      };

      const pickSide = (tab) => {
        setSideTab(tab);
        try { localStorage.setItem('dsh-wardrobe.side', tab); } catch { /* 记不住就算了 */ }
      };

      const loadStory = async (id) => {
        if (!id) return;
        setStoryBusy(true);
        setStoryErr('');
        try {
          const response = await fetch(`${BASE}story?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
          const payload = await response.json();
          if (!response.ok || payload.error) throw new Error(payload.error || `HTTP ${response.status}`);
          setStory(payload);
        } catch (err) {
          setStoryErr(err.message);
        } finally {
          setStoryBusy(false);
        }
      };

      const openStory = () => {
        if (!activeOutfit) return;
        pickSide('story');
        setStory(null);
        loadStory(activeOutfit.id);
      };

      const loadCands = async (keyword = '') => {
        if (!activeOutfit) return;
        setCandBusy(true);
        try {
          const query = keyword ? `&q=${encodeURIComponent(keyword)}` : '';
          const response = await fetch(`${BASE}story/candidates?id=${encodeURIComponent(activeOutfit.id)}${query}`, { cache: 'no-store' });
          const payload = await response.json();
          if (!response.ok || payload.error) throw new Error(payload.error || `HTTP ${response.status}`);
          setCands(payload);
        } catch (err) {
          setCands({ items: [], error: err.message });
        } finally {
          setCandBusy(false);
        }
      };

      const openCheck = async () => {
        if (!activeOutfit) return;
        setCheckOpen(true);
        setCandBusy(true);
        setCands(null);
        setCandPick({});
        setCustomDate('');
        setCustomText('');
        setCandQuery('');
        await loadCands('');
      };

      const savePicks = async () => {
        if (!activeOutfit) return;
        const chosen = (cands?.items || []).filter((item) => candPick[item.key]);
        if (customText.trim()) chosen.push({ date: customDate, text: customText.trim() });
        if (!chosen.length) { setCheckOpen(false); return; }
        setCandBusy(true);
        try {
          const response = await fetch(`${BASE}story/pick`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: activeOutfit.id, items: chosen.map((item) => ({ date: item.date, text: item.text })) }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload.error) throw new Error(payload.error || `HTTP ${response.status}`);
          setStory(payload);
          setCheckOpen(false);
        } catch (err) {
          setToast({ text: `没放进故事：${err.message}`, error: true });
        } finally {
          setCandBusy(false);
        }
      };

      const startStoryEdit = (row) => {
        setSEditKey(row.key);
        setSDate(row.date || '');
        setSText(row.text || '');
      };

      const saveStoryEdit = async () => {
        if (!activeOutfit || !sEditKey) return;
        setSBusy(true);
        try {
          const response = await fetch(`${BASE}story/edit`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: activeOutfit.id, key: sEditKey, date: sDate, text: sText }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload.error) throw new Error(payload.error || `HTTP ${response.status}`);
          setStory(payload);
          setSEditKey('');
        } catch (err) {
          setToast({ text: `没改上：${err.message}`, error: true });
        } finally {
          setSBusy(false);
        }
      };

      const rewriteStory = async (rowKey) => {
        if (!activeOutfit) return;
        setSRewriting(rowKey);
        try {
          const response = await fetch(`${BASE}story/rewrite`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: activeOutfit.id, key: rowKey }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload.error) throw new Error(payload.error || `HTTP ${response.status}`);
          const fresh = await fetch(`${BASE}story?id=${encodeURIComponent(activeOutfit.id)}`, { cache: 'no-store' }).then((r) => r.json());
          setStory(fresh);
        } catch (err) {
          setToast({ text: `没改成：${err.message}`, error: true });
        } finally {
          setSRewriting('');
        }
      };

      const dropStory = async (rowKey) => {
        if (!activeOutfit) return;
        try {
          const response = await fetch(`${BASE}story/drop`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: activeOutfit.id, key: rowKey }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload.error) throw new Error(payload.error || `HTTP ${response.status}`);
          setStory(payload);
        } catch (err) {
          setToast({ text: `没拿掉：${err.message}`, error: true });
        }
      };

      const header = h('div', { className: 'yw-head' },
        h('div', { className: 'yw-title' }, '衣橱'),
        h('div', { className: 'yw-sub' },
          data
            ? (filter === 'all' && !query.trim()
              ? `${data.total} 套 · ${totalImages} 张图${missingCount ? ` · ${missingCount} 套缺图` : ''}`
              : `筛出 ${shownCount} 套`)
            : '正在翻衣橱…'),
        h('div', { className: 'yw-grow' }),
        h('input', {
          className: 'yw-search', type: 'search', value: query, placeholder: '搜：黑色 / 长靴 / 露肩',
          onChange: (event) => setQuery(event.target.value),
        }),
        h('div', { className: 'yw-seg' },
          [['all', '全部'], ['out', '能出门'], ['missing', '缺图']].map(([key, label]) => h('button', {
            key, type: 'button', 'data-on': filter === key ? '1' : '0',
            onClick: () => setFilter(key),
          }, label))),
        h('button', {
          type: 'button', className: 'yw-ghost', onClick: randomOutfit,
          disabled: !shownCount, title: '在筛出来的里面随便挑一套',
        }, '随机一套'),
        data?.hasPassword && data?.unlocked
          ? h('button', { type: 'button', className: 'yw-ghost', onClick: relock, title: '把私密照重新锁上' }, '上锁')
          : null,
        h('button', {
          type: 'button', className: 'yw-ghost', onClick: () => { setPwdOpen(true); setPwdMsg(''); },
          title: '私密照的密码',
        }, '私密'),
        h('button', {
          type: 'button', className: 'yw-ghost', onClick: openAdmin,
          title: '按分类看全部图，改分类 / 移出 / 改分类名',
        }, '管理'),
        h('button', {
          type: 'button', className: 'yw-ghost', onClick: () => { setBackupOpen(true); setBackupMsg(''); },
          title: '导出/导入这份衣橱的设置',
        }, '备份'),
        h('button', { type: 'button', className: 'yw-ghost', onClick: reload }, status === 'refreshing' ? '刷…' : '刷新'));

      if (!data) {
        return h('div', { className: 'yw-root', ref: rootRef, tabIndex: -1 },
          h('style', null, CSS),
          header,
          h('div', { className: 'yw-state', 'data-err': status === 'error' ? '1' : '0' },
            status === 'error' ? `衣橱打不开：${error}` : '正在翻衣橱…'));
      }

      if (!filtered.length) {
        return h('div', { className: 'yw-root', ref: rootRef, tabIndex: -1 },
          h('style', null, CSS),
          header,
          h('div', { className: 'yw-state' },
            query.trim() ? `「${query.trim()}」一条都没找到 —— 换个说法，或者清掉搜索框。` : '这个筛选下没有套。'));
      }

      const seriesTabs = h('div', { className: 'yw-series' },
        filtered.map((bucket) => h('button', {
          key: bucket.key, type: 'button', className: 'yw-stab',
          'data-on': bucket.key === activeSeries?.key ? '1' : '0',
          onClick: () => setSeriesKey(bucket.key),
          title: `${bucket.label} · ${bucket.note}`,
        },
        h('b', null, bucket.key), h('span', null, bucket.label),
        h('em', null, String(bucket.items.length)))));

      const outfitTabs = h('div', { className: 'yw-otabs' },
        (activeSeries?.items || []).map((item) => h('button', {
          key: item.id, type: 'button', className: 'yw-otab',
          'data-on': item.id === activeOutfit?.id ? '1' : '0',
          onClick: () => setOutfitId(item.id),
          title: `${item.name} · ${item.wearLabel}${item.count ? '' : ' · 缺图'}`,
        },
        item.wear === 'out' ? h('s', null) : null,
        h('i', null, item.id), h('span', null, item.name),
        item.count ? null : h('u', null, '缺图'))));

      const catBar = groups.length ? h('div', { className: 'yw-cats' },
        groups.map((group) => h('button', {
          key: group.key, type: 'button', className: 'yw-cat',
          'data-on': group.key === activeCat?.key ? '1' : '0',
          'data-locked': group.key === 'private' && group.images.some((image) => image.locked) ? '1' : '0',
          onClick: () => { setCatKey(group.key); setImageIndex(0); setLockErr(''); },
          title: group.hint,
        }, group.label, h('em', null, String(group.images.length))))) : null;

      const lockedHere = Boolean(activeCat && activeCat.key === 'private' && activeCat.images.some((image) => image.locked));

      const lockBox = lockedHere
        ? (data.hasPassword
          ? h('div', { className: 'yw-lock' },
            h('b', null, '私密照锁着'),
            h('p', null, `这套有 ${activeCat.images.length} 张私密照。输密码解开，解开状态只在这一会儿有效。`),
            h('div', { className: 'yw-lockrow' },
              h('input', {
                className: 'yw-finput', type: 'password', value: lockPwd, placeholder: '密码',
                onChange: (event) => { setLockPwd(event.target.value); setLockErr(''); },
                onKeyDown: (event) => { if (event.key === 'Enter') unlock(); },
              }),
              h('button', { type: 'button', className: 'yw-primary', disabled: lockBusy, onClick: unlock }, lockBusy ? '开…' : '解锁')),
            lockErr ? h('div', { className: 'yw-toast', 'data-err': '1' }, lockErr) : null)
          : h('div', { className: 'yw-lock' },
            h('b', null, '还没设密码'),
            h('p', null, '私密照要先设一个密码。密码存在本机的 ~/.dsh/dsh-wardrobe/settings.json，不进 git。'),
            h('button', { type: 'button', className: 'yw-primary', onClick: () => setPwdOpen(true) }, '去设密码')))
        : null;

      const stage = h('div', { className: 'yw-stage' },
        h('div', { className: 'yw-stagebody' },
          lockedHere
          ? lockBox
          : (currentImage
            ? h('div', { className: 'yw-figure' },
              h('img', {
                src: mediaUrl(currentImage.src), alt: `${activeOutfit.name} ${currentImage.label}`,
                onClick: () => setZoom(mediaUrl(currentImage.src)),
              }),
              images.length > 1 ? h('button', {
                type: 'button', className: 'yw-arrow', 'data-side': 'l',
                onClick: () => stepImage(-1), title: '上一张',
              }, '‹') : null,
              images.length > 1 ? h('button', {
                type: 'button', className: 'yw-arrow', 'data-side': 'r',
                onClick: () => stepImage(1), title: '下一张',
              }, '›') : null,
              h('div', { className: 'yw-cap' },
                `${currentImage.label}${images.length > 1 ? ` · ${safeIndex + 1}/${images.length}` : ''}`))
            : h('div', { className: 'yw-empty' },
              h('b', null, '这套还没有图'),
              h('br'), '清单里有名字和设定，图库里没出图 —— 补的时候看右边的字段。'))),
        catBar);

      const detail = activeOutfit?.detail || '';
      const summary = activeOutfit?.summary || '';
      const canExpand = detail.length > summary.length + 8;

      const fieldRows = fieldKinds.map((kind) => {
        const hit = (activeOutfit?.fields || []).find((field) => field.key === kind.key);
        return { key: kind.key, label: kind.label, value: hit?.value || '' };
      });
      for (const field of activeOutfit?.fields || []) {
        if (!fieldRows.some((row) => row.key === field.key)) {
          fieldRows.push({ key: field.key, label: field.label, value: field.value });
        }
      }
      const blank = fieldRows.filter((row) => !row.value).length;

      const nowLine = nowState && !nowState.missing
        ? h('div', { className: 'yw-now' },
          h('div', { className: 'yw-nowhead' },
            h('span', null, '此刻穿着'),
            h('b', null, `${nowState.name || '—'}${nowState.id ? ` ${nowState.id}` : ''}`),
            h('span', null, nowState.when ? `· ${nowState.when}` : '')),
          nowState.outfitText ? h('div', { className: 'yw-nowtext' }, nowState.outfitText) : null,
          nowState.stateText ? h('div', { className: 'yw-nowtext' }, nowState.stateText) : null)
        : null;

      const specBody = h('div', { className: 'yw-specwrap' },
        h('div', { className: 'yw-name' },
          h('span', null, activeOutfit?.name || '—'),
          activeOutfit ? h('span', { className: 'yw-id' }, activeOutfit.id) : null,
          activeOutfit ? h('span', { className: 'yw-chip', 'data-wear': activeOutfit.wear || '' }, activeOutfit.wearLabel) : null,
          activeOutfit && !activeOutfit.count ? h('span', { className: 'yw-chip', 'data-miss': '1' }, '缺图') : null),
        h('div', { className: 'yw-sum', 'data-full': fullDetail ? '1' : '0' },
          fullDetail || !canExpand ? detail : summary),
        canExpand ? h('button', {
          type: 'button', className: 'yw-more',
          onClick: () => setFullDetail((prev) => !prev),
        }, fullDetail ? '收起设定' : '展开设定') : null,
        h('div', { className: 'yw-tags' },
          (activeOutfit?.tags || []).map((tag) => h('button', {
            key: tag, type: 'button', className: 'yw-tag',
            onClick: () => setQuery(tag), title: `搜这个：${tag}`,
          }, tag)),
          activeOutfit ? h('button', {
            type: 'button', className: 'yw-tag', 'data-edit': '1', onClick: startEdit,
          }, editing ? '编辑中…' : '编辑') : null),
        h('div', { className: 'yw-cap2' },
          '里外件',
          editing ? h('em', null, '改完点保存') : (blank ? h('em', null, `${blank} 项没写`) : null)),
        activeOutfit ? h('div', { className: 'yw-fields' },
          fieldRows.map((row) => (editing
            ? h('div', { key: row.key, className: 'yw-frow' },
              h('span', { className: 'yw-flabel' }, row.label),
              h('input', {
                className: 'yw-finput', value: draft[row.key] ?? '', placeholder: '没写就留空',
                onChange: (event) => setDraft((prev) => ({ ...prev, [row.key]: event.target.value })),
              }))
            : h('div', { key: row.key, className: 'yw-frow', 'data-blank': row.value ? '0' : '1' },
              h('span', { className: 'yw-flabel' }, row.label),
              h('span', { className: 'yw-fval', title: row.value || '还没写' }, row.value || '未写'))))) : null,
        editing && (activeOutfit?.images || []).length ? h('div', { className: 'yw-photoedit' },
          h('div', { className: 'yw-cap2' }, '图的分类', h('em', null, '改完点保存')),
          (activeOutfit.images || []).map((image) => h('div', { key: image.name, className: 'yw-prow' },
            h('span', { className: 'yw-pname', title: image.name }, image.name),
            h('select', {
              className: 'yw-finput',
              value: photoDraft[image.name] ?? image.cat,
              onChange: (event) => {
                const value = event.target.value;
                setPhotoDraft((prev) => ({ ...prev, [image.name]: value }));
              },
            }, (data.photoCats || []).map((cat) => h('option', { key: cat.key, value: cat.key }, cat.label)))))) : null,
        editing ? h('div', { className: 'yw-tagedit' },
          h('span', { className: 'yw-flabel' }, '标签'),
          h('input', {
            className: 'yw-finput', value: tagDraft, placeholder: '手工标签，顿号分隔（自动标签不用写）',
            onChange: (event) => setTagDraft(event.target.value),
          })) : null,
        editing ? h('div', { className: 'yw-tagedit' },
          h('span', { className: 'yw-flabel' }, '别名'),
          h('input', {
            className: 'yw-finput', value: aliasDraft, placeholder: '改过名的老名字，顿号分隔（如 白靴套）',
            onChange: (event) => setAliasDraft(event.target.value),
          })) : null,
        editing ? h('div', { className: 'yw-editbar' },
          h('button', { type: 'button', className: 'yw-primary', disabled: saving, onClick: saveEdit },
            saving ? '存着…' : '保存'),
          h('button', { type: 'button', className: 'yw-ghost', onClick: () => setEditing(false) }, '取消')) : null,
        activeOutfit ? h('div', { className: 'yw-actions' },
          h('button', { type: 'button', className: 'yw-primary', onClick: openWear }, '今天穿这套'),
          h('button', { type: 'button', className: 'yw-ghost', onClick: openStory, title: '设计来历、穿过它做过什么、记忆里的片段' }, '这套的故事')) : null,
        toast ? h('div', { className: 'yw-toast', 'data-err': toast.error ? '1' : '0' }, toast.text) : null,
        h('div', { className: 'yw-sep' }),
        h('div', { className: 'yw-cap2' },
          activeCat ? `${activeCat.label} · ${images.length}` : '图 · 无',
          currentImage ? h('button', {
            type: 'button', className: 'yw-tag yw-tag--dash',
            'data-on': catEditOpen ? '1' : '0',
            title: '改这张图归到哪一类',
            onClick: () => setCatEditOpen((open) => !open),
          }, '改这张归类') : null,
          currentImage ? h('button', {
            type: 'button', className: 'yw-tag yw-tag--danger',
            title: '把这张移出图库（文件不删）',
            onClick: () => removeImage(currentImage.name),
          }, '移出这张') : null),
        catEditOpen && currentImage ? h('div', { className: 'yw-catpick' },
          h('em', null, `「${currentImage.label}」归到：`),
          (data.photoCats || []).map((cat) => h('button', {
            key: cat.key, type: 'button', className: 'yw-cat',
            'data-on': cat.key === currentImage.cat ? '1' : '0',
            onClick: () => { setCatEditOpen(false); if (cat.key !== currentImage.cat) setImageCat(currentImage.name, cat.key); },
          }, cat.label))) : null,
        images.length ? h('div', { className: 'yw-thumbs' },
          images.map((image, index) => h('div', {
            key: image.name || image.label, role: 'button', tabIndex: 0, className: 'yw-thumb',
            'data-on': index === safeIndex ? '1' : '0',
            'data-locked': image.locked ? '1' : '0',
            onClick: () => {
              if (image.locked) { setCatKey('private'); return; }
              setCatEditOpen(false);
              setImageIndex(index);
            },
            onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') setImageIndex(index); },
            title: image.label,
          },
          image.locked
            ? h('div', { className: 'yw-thumblock' }, '锁')
            : h('img', { src: mediaUrl(image.src), alt: image.label, loading: 'lazy' }),
          h('span', null, image.label),
          h('button', {
            type: 'button', className: 'yw-drop', title: '移出图库（文件不动）',
            onClick: (event) => { event.stopPropagation(); removeImage(image.name); },
          }, '×')))) : null,
        (activeOutfit?.hiddenImages || []).length ? h('div', { className: 'yw-hiddenbox' },
          h('b', null, `已移出 ${activeOutfit.hiddenImages.length} 张`),
          activeOutfit.hiddenImages.map((name) => h('div', { key: name, className: 'yw-hiddenrow' },
            h('span', null, name),
            h('button', { type: 'button', className: 'yw-tag', onClick: () => restoreImage(name) }, '放回来')))) : null,
        nowLine);

      const storyRows = (story?.timeline || []).map((row) => (sEditKey === row.key
        ? h('div', { key: row.key, className: 'yw-srow', 'data-kind': row.kind, 'data-editing': '1' },
          h('div', { className: 'yw-seditrow' },
            h('input', {
              className: 'yw-finput yw-dateinput', value: sDate, placeholder: '2026-10-31',
              onChange: (event) => setSDate(event.target.value),
            }),
            h('button', { type: 'button', className: 'yw-primary', disabled: sBusy, onClick: saveStoryEdit }, sBusy ? '存着…' : '保存'),
            h('button', { type: 'button', className: 'yw-ghost', onClick: () => setSEditKey('') }, '取消')),
          h('textarea', {
            className: 'yw-finput yw-stextarea', value: sText, rows: 3,
            onChange: (event) => setSText(event.target.value),
          }))
        : h('div', { key: row.key, className: 'yw-srow', 'data-kind': row.kind },
          h('div', { className: 'yw-sdate' },
            h('span', null, row.date || '没写日子'),
            row.edited ? h('span', { className: 'yw-sedited' }, '改过') : null,
            h('div', { className: 'yw-grow' }),
            h('button', {
              type: 'button', className: 'yw-drop', title: '用模型把这段改写成一句时间线',
              disabled: sRewriting === row.key,
              onClick: () => rewriteStory(row.key),
            }, sRewriting === row.key ? '…' : '重写'),
            h('button', { type: 'button', className: 'yw-drop', title: '改这条', onClick: () => startStoryEdit(row) }, '改'),
            h('button', { type: 'button', className: 'yw-drop', title: row.kind === 'worn' ? '从故事里拿掉（不改 此刻-穿着.md）' : '从故事里拿掉', onClick: () => dropStory(row.key) }, '×')),
          h('div', { className: 'yw-stext' }, row.line || row.text),
          row.generated ? null : h('details', { className: 'yw-sraw' },
            h('summary', null, '看原文'),
            h('div', null, row.raw || row.text)))));

      const storyBody = h('div', { className: 'yw-storywrap' },
        h('div', { className: 'yw-storytop' },
          h('span', null, story ? `${story.timeline.length} 条` : ''),
          h('div', { className: 'yw-grow' }),
          h('button', { type: 'button', className: 'yw-tag yw-tag--dash', onClick: openCheck, title: '从记忆库里找可能相关的片段，自己挑' }, '检查故事是否全')),
        storyBusy ? h('div', { className: 'yw-empty' }, '正在翻记忆…') : null,
        storyErr ? h('div', { className: 'yw-toast', 'data-err': '1' }, storyErr) : null,
        !storyBusy && story && !story.timeline.length ? h('div', { className: 'yw-empty' }, '这套还没有故事，点上面那个按钮翻一翻') : null,
        storyRows,
        story?.design?.sections?.length ? h('details', { className: 'yw-storymore' },
          h('summary', null, '设计设定'),
          story.design.sections.map((section) => h('section', { key: section.heading },
            h('h4', null, section.heading),
            h('p', null, section.text)))) : null);

      const side = h('aside', { className: 'yw-side' },
        h('div', { className: 'yw-sidecards' },
          h('button', {
            type: 'button', className: 'yw-card', 'data-on': sideTab === 'spec' ? '1' : '0',
            onClick: () => pickSide('spec'),
          }, '里外件'),
          h('button', {
            type: 'button', className: 'yw-card', 'data-on': sideTab === 'story' ? '1' : '0',
            onClick: openStory,
          }, '故事 · ', String(story?.timeline?.length || 0))),
        sideTab === 'story' ? storyBody : specBody);

      const adminRows = admin?.rows || [];
      const tabs = [{ key: 'all', label: '全部', count: adminRows.filter((row) => !row.hidden).length }]
        .concat((admin?.cats || []).map((cat) => ({
          key: cat.key, label: cat.label,
          count: adminRows.filter((row) => row.cat === cat.key && !row.hidden).length,
        })))
        .concat([{ key: 'hidden', label: '已移出', count: adminRows.filter((row) => row.hidden).length }]);
      const shownRows = adminTab === 'all'
        ? adminRows.filter((row) => !row.hidden)
        : adminTab === 'hidden'
          ? adminRows.filter((row) => row.hidden)
          : adminRows.filter((row) => row.cat === adminTab && !row.hidden);

      const catEditor = catEditing
        ? h('div', { className: 'yw-catedit' },
          catDraft.map((cat, index) => h('div', { key: cat.key, className: 'yw-caterow' },
            h('input', {
              className: 'yw-finput', value: cat.label,
              onChange: (event) => setCatDraft((list) => list.map((row, i) => (i === index ? { ...row, label: event.target.value } : row))),
            }),
            h('button', {
              type: 'button', className: 'yw-ghost', disabled: index === 0,
              onClick: () => setCatDraft((list) => {
                const next = [...list];
                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                return next;
              }),
            }, '↑'),
            h('button', {
              type: 'button', className: 'yw-ghost', disabled: index === catDraft.length - 1,
              onClick: () => setCatDraft((list) => {
                const next = [...list];
                [next[index + 1], next[index]] = [next[index], next[index + 1]];
                return next;
              }),
            }, '↓'),
            h('button', {
              type: 'button', className: 'yw-tag yw-tag--danger',
              onClick: () => setCatDraft((list) => list.filter((row) => row.key !== cat.key)),
            }, '删')))
            .concat([
              h('div', { key: '__add', className: 'yw-caterow' },
                h('button', {
                  type: 'button', className: 'yw-ghost',
                  onClick: () => setCatDraft((list) => [...list, { key: `custom-${Date.now().toString(36)}`, label: '新分类' }]),
                }, '＋ 新分类'),
                h('div', { className: 'yw-grow' }),
                h('button', { type: 'button', className: 'yw-primary', onClick: persistCats }, '保存分类'),
                h('button', { type: 'button', className: 'yw-ghost', onClick: () => { setCatEditing(false); setCatDraft(admin?.cats || []); } }, '取消')),
            ]))
        : null;

      const adminDialog = adminOpen
        ? h('div', { className: 'yw-mask', onClick: () => setAdminOpen(false) },
          h('div', { className: 'yw-dlg yw-dlg--wide', onClick: (event) => event.stopPropagation() },
            h('div', { className: 'yw-dlghead' },
              h('h3', null, '图库管理'),
              h('span', null, admin ? `${adminRows.filter((row) => !row.hidden).length} 张图 · 点格子上的下拉改分类` : (adminBusy ? '正在翻…' : '')),
              h('div', { className: 'yw-grow' }),
              h('button', { type: 'button', className: 'yw-ghost', onClick: () => setAdminOpen(false) }, '关了')),
            adminMsg ? h('div', { className: 'yw-adminmsg' }, adminMsg) : null,
            catEditor,
            h('div', { className: 'yw-adminbar' },
              tabs.map((tab) => h('button', {
                key: tab.key, type: 'button', className: 'yw-cat',
                'data-on': adminTab === tab.key ? '1' : '0',
                onClick: () => setAdminTab(tab.key),
              }, tab.label, h('em', null, String(tab.count)))),
              h('button', {
                type: 'button', className: 'yw-tag yw-tag--dash',
                onClick: () => { setCatEditing(true); setCatDraft(admin?.cats || []); },
              }, '改分类名 / 排序')),
            h('div', { className: 'yw-adminbody' },
              shownRows.length
                ? h('div', { className: 'yw-grid' }, shownRows.map((row) => h('div', {
                  key: `${row.outfitId}-${row.name}`, className: 'yw-cell',
                  'data-hidden': row.hidden ? '1' : '0',
                },
                row.src ? h('img', { src: mediaUrl(row.src), alt: row.name, loading: 'lazy' }) : h('div', { className: 'yw-cellmiss' }, '已移出'),
                h('div', { className: 'yw-cellmeta' },
                  h('b', null, row.outfitName), h('span', null, row.outfitId)),
                row.hidden
                  ? h('button', { type: 'button', className: 'yw-ghost', onClick: () => toggleRowHidden(row, false) }, '放回来')
                  : h('div', { className: 'yw-cellops' },
                    h('select', {
                      className: 'yw-catsel', value: row.cat,
                      onChange: (event) => setRowCat(row, event.target.value),
                    }, (admin?.cats || []).map((cat) => h('option', { key: cat.key, value: cat.key }, cat.label))),
                    h('button', { type: 'button', className: 'yw-tag yw-tag--danger', onClick: () => toggleRowHidden(row, true) }, '移出')))))
                : h('div', { className: 'yw-empty' }, '这一类里还没有图'))))
        : null;

      const checkDialog = checkOpen
        ? h('div', { className: 'yw-mask', onClick: () => setCheckOpen(false) },
          h('div', { className: 'yw-dlg yw-dlg--wide', onClick: (event) => event.stopPropagation() },
            h('div', { className: 'yw-dlghead' },
              h('h3', null, '可能跟这套有关的记忆'),
              h('span', null, cands ? `${cands.items.length} 条候选 · 挑中的会按日期排进故事` : '正在翻…'),
              h('div', { className: 'yw-grow' }),
              h('button', { type: 'button', className: 'yw-ghost', onClick: () => setCheckOpen(false) }, '关了')),
            h('div', { className: 'yw-candsearch' },
              h('input', {
                className: 'yw-finput', value: candQuery, placeholder: '搜别的词（如 香港 / 灰靴 / 演唱会），空的就按这套的名字和别名找',
                onChange: (event) => setCandQuery(event.target.value),
                onKeyDown: (event) => { if (event.key === 'Enter') loadCands(candQuery.trim()); },
              }),
              h('button', { type: 'button', className: 'yw-ghost', disabled: candBusy, onClick: () => loadCands(candQuery.trim()) }, '搜'),
              h('button', { type: 'button', className: 'yw-ghost', disabled: candBusy, onClick: () => { setCandQuery(''); loadCands(''); } }, '按名字')),
            cands?.keyword ? h('div', { className: 'yw-hint' }, `按「${cands.keyword}」搜的`) : null,
            candBusy ? h('div', { className: 'yw-empty' }, '正在扫记忆库…') : null,
            cands?.error ? h('div', { className: 'yw-toast', 'data-err': '1' }, cands.error) : null,
            h('div', { className: 'yw-candlist' },
              (cands?.items || []).map((item) => h('label', {
                key: item.key, className: 'yw-cand', 'data-on': candPick[item.key] ? '1' : '0',
              },
              h('input', {
                type: 'checkbox', checked: Boolean(candPick[item.key]),
                onChange: (event) => setCandPick((prev) => ({ ...prev, [item.key]: event.target.checked })),
              }),
              h('div', { className: 'yw-candbody' },
                h('div', { className: 'yw-canddate' }, item.date || '没写日子'),
                h('div', { className: 'yw-candtext' }, item.text))))),
            h('div', { className: 'yw-custom' },
              h('div', { className: 'yw-cap2' }, '自己写一条', h('em', null, '记忆里没有的，直接补')),
              h('div', { className: 'yw-customrow' },
                h('input', {
                  className: 'yw-finput yw-dateinput', value: customDate, placeholder: '2026-10-31',
                  onChange: (event) => setCustomDate(event.target.value),
                }),
                h('input', {
                  className: 'yw-finput', value: customText, placeholder: '那天穿着它干了什么',
                  onChange: (event) => setCustomText(event.target.value),
                }))),
            h('div', { className: 'yw-adminbar' },
              h('span', { className: 'yw-hint' }, `挑中 ${Object.values(candPick).filter(Boolean).length + (customText.trim() ? 1 : 0)} 条`),
              h('div', { className: 'yw-grow' }),
              h('button', { type: 'button', className: 'yw-primary', disabled: candBusy, onClick: savePicks }, '放进故事'))))
        : null;

      const backupDialog = backupOpen
        ? h('div', { className: 'yw-mask', onClick: () => setBackupOpen(false) },
          h('div', { className: 'yw-dialog', onClick: (event) => event.stopPropagation() },
            h('h3', null, '备份 / 换电脑'),
            h('p', null, '这套衣橱的改动（字段、标签、图的归类、移出的图、私密密码）都存在本机：'),
            h('code', null, '~/.dsh/dsh-wardrobe/'),
            h('p', null, '图片本身不在里面 —— 图在 ctx/图库/衣橱图库/，跟着工作区走。换电脑把这两样搬过去就行。'),
            h('div', { className: 'yw-lockrow' },
              h('a', { className: 'yw-primary', href: `${BASE}export`, download: '' }, '导出设置文件'),
              h('label', { className: 'yw-ghost yw-filepick' },
                '导入设置文件',
                h('input', { type: 'file', accept: 'application/json,.json', onChange: importBackup }))),
            backupMsg ? h('div', { className: 'yw-toast' }, backupMsg) : null,
            h('div', { className: 'yw-lockrow' },
              h('button', { type: 'button', className: 'yw-ghost', onClick: () => setBackupOpen(false) }, '关了'))))
        : null;

      const pwdDialog = pwdOpen
        ? h('div', { className: 'yw-mask', onClick: (event) => { if (event.target === event.currentTarget) setPwdOpen(false); } },
          h('div', { className: 'yw-dlg' },
            h('h3', null, data.hasPassword ? '换私密照的密码' : '给私密照设一个密码'),
            h('p', null, data.hasPassword
              ? '要先输现在的密码。改完所有已经解开的地方会重新锁上。'
              : '设完之后，私密照要输密码才能看。密码只存本机，忘了只能重设（删掉 settings.json）。'),
            data.hasPassword ? h('input', {
              className: 'yw-finput', type: 'password', value: pwdCurrent, placeholder: '现在的密码',
              onChange: (event) => setPwdCurrent(event.target.value),
            }) : null,
            h('input', {
              className: 'yw-finput', type: 'password', value: pwdNew, placeholder: '新密码（至少 4 位）',
              onChange: (event) => setPwdNew(event.target.value),
              onKeyDown: (event) => { if (event.key === 'Enter') savePassword(); },
            }),
            pwdMsg ? h('div', { className: 'yw-toast', 'data-err': '1' }, pwdMsg) : null,
            h('div', { className: 'yw-dlgfoot' },
              h('div', { className: 'yw-grow' }),
              h('button', { type: 'button', className: 'yw-ghost', onClick: () => setPwdOpen(false) }, '算了'),
              h('button', { type: 'button', className: 'yw-primary', disabled: pwdBusy, onClick: savePassword },
                pwdBusy ? '写着…' : '存密码'))))
        : null;

      const zoomLayer = zoom
        ? h('div', { className: 'yw-zoom', onClick: () => setZoom(null) },
          h('img', { src: zoom, alt: activeOutfit?.name || '' }))
        : null;

      const wearDialog = wearOpen && activeOutfit
        ? h('div', { className: 'yw-mask', onClick: (event) => { if (event.target === event.currentTarget) setWearOpen(false); } },
          h('div', { className: 'yw-dlg' },
            h('h3', null, `记一笔：穿「${activeOutfit.name}」`),
            h('p', null, '会改「此刻-穿着.md」的「现在」那一行，再往历史表插一行。'),
            h('div', { className: 'yw-worn' }, activeOutfit.fieldsText || activeOutfit.summary || ''),
            h('textarea', {
              className: 'yw-ta', value: wearNote, placeholder: '人在哪、在做什么（可以不写）',
              onChange: (event) => setWearNote(event.target.value),
            }),
            h('div', { className: 'yw-dlgfoot' },
              toast && toast.error ? h('div', { className: 'yw-toast', 'data-err': '1' }, toast.text) : null,
              h('div', { className: 'yw-grow' }),
              h('button', { type: 'button', className: 'yw-ghost', onClick: () => setWearOpen(false) }, '算了'),
              h('button', {
                type: 'button', className: 'yw-primary', disabled: wearSaving, onClick: submitWear,
              }, wearSaving ? '写着…' : '记下来'))))
        : null;

      return h('div', { className: 'yw-root', ref: rootRef, tabIndex: -1 },
        h('style', null, CSS),
        header,
        seriesTabs,
        outfitTabs,
        h('div', { className: 'yw-body' }, stage, side),
        zoomLayer,
        wearDialog,
        pwdDialog,
        backupDialog,
        adminDialog,
        checkDialog);
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.inject(['layout'], (pageCtx) => pageCtx.slots.inject('main', () => {
          const stopPage = pageCtx.slots.register({
            name: 'main', key: PANEL_ID,
          }, WardrobePage);
          const stopIcon = pageCtx.slots.inject('sidebar.panellist', () => pageCtx.slots.register({
            name: 'sidebar.panellist', id: PANEL_ID, order: 12,
            label: '衣橱',
          }, HangerIcon));
          return () => {
            stopIcon();
            stopPage();
          };
        }));
      },
    };
  },
});
