/* @ds-bundle: {"format":4,"namespace":"TableAIDesignSystem_f48f27","components":[{"name":"ChatComposer","sourcePath":"components/a2a/ChatComposer.jsx"},{"name":"ChatMessage","sourcePath":"components/a2a/ChatMessage.jsx"},{"name":"Accordion","sourcePath":"components/content/Accordion.jsx"},{"name":"PersonCard","sourcePath":"components/content/PersonCard.jsx"},{"name":"Quote","sourcePath":"components/content/Quote.jsx"},{"name":"Steps","sourcePath":"components/content/Steps.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Checkbox","sourcePath":"components/core/Checkbox.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"FieldLabel","sourcePath":"components/core/Input.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"Radio","sourcePath":"components/core/Radio.jsx"},{"name":"RadioGroup","sourcePath":"components/core/Radio.jsx"},{"name":"Select","sourcePath":"components/core/Select.jsx"},{"name":"Switch","sourcePath":"components/core/Switch.jsx"},{"name":"Textarea","sourcePath":"components/core/Textarea.jsx"},{"name":"BarChart","sourcePath":"components/data/BarChart.jsx"},{"name":"DataTable","sourcePath":"components/data/DataTable.jsx"},{"name":"DonutChart","sourcePath":"components/data/DonutChart.jsx"},{"name":"Badge","sourcePath":"components/display/Badge.jsx"},{"name":"Card","sourcePath":"components/display/Card.jsx"},{"name":"TileGrid","sourcePath":"components/display/Card.jsx"},{"name":"Divider","sourcePath":"components/display/Divider.jsx"},{"name":"Eyebrow","sourcePath":"components/display/Eyebrow.jsx"},{"name":"Skeleton","sourcePath":"components/display/Skeleton.jsx"},{"name":"Stat","sourcePath":"components/display/Stat.jsx"},{"name":"Tag","sourcePath":"components/display/Tag.jsx"},{"name":"Dialog","sourcePath":"components/feedback/Dialog.jsx"},{"name":"ConfirmDialog","sourcePath":"components/feedback/Dialog.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"ToastStack","sourcePath":"components/feedback/Toast.jsx"},{"name":"Tooltip","sourcePath":"components/feedback/Tooltip.jsx"},{"name":"ICON_PATHS","sourcePath":"components/icons/Icon.jsx"},{"name":"ICON_NAMES","sourcePath":"components/icons/Icon.jsx"},{"name":"Icon","sourcePath":"components/icons/Icon.jsx"},{"name":"NavBar","sourcePath":"components/navigation/NavBar.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"}],"sourceHashes":{"components/a2a/ChatComposer.jsx":"5beda4bf9480","components/a2a/ChatMessage.jsx":"08c7814a18fb","components/content/Accordion.jsx":"554e8dd13dca","components/content/PersonCard.jsx":"60a33fc015b1","components/content/Quote.jsx":"7ab4cd984a7f","components/content/Steps.jsx":"7f0beee2f1a8","components/core/Button.jsx":"581d68c68031","components/core/Checkbox.jsx":"39ecc6241890","components/core/IconButton.jsx":"bc6d6d60cec4","components/core/Input.jsx":"697f037e5732","components/core/Radio.jsx":"7d7ac0a1dcac","components/core/Select.jsx":"55dbe0e8c9a4","components/core/Switch.jsx":"c4dd79290c34","components/core/Textarea.jsx":"435a5d2f4e9d","components/data/BarChart.jsx":"e9bc210832ef","components/data/DataTable.jsx":"1d09244b16a2","components/data/DonutChart.jsx":"2e08d00c2e05","components/display/Badge.jsx":"7570474bc6ef","components/display/Card.jsx":"a5d358d65407","components/display/Divider.jsx":"ad61a9b175ba","components/display/Eyebrow.jsx":"7cd11eba502f","components/display/Skeleton.jsx":"82d26404aaae","components/display/Stat.jsx":"e28f62f7e4b4","components/display/Tag.jsx":"2776bf1f9250","components/feedback/Dialog.jsx":"07a631be2bb3","components/feedback/Toast.jsx":"8ab76c25c741","components/feedback/Tooltip.jsx":"68b73073794f","components/icons/Icon.jsx":"70d8f2f69580","components/navigation/NavBar.jsx":"66cd75927368","components/navigation/Tabs.jsx":"35fd326d6045","ui_kits/admin/admin.jsx":"85d4b829d707","ui_kits/admin/screens.jsx":"a979a0e7b872","ui_kits/website/app.jsx":"fe30ac7293a1","ui_kits/website/content.jsx":"c373a6a9fba1","ui_kits/website/home.jsx":"ea6e4997de76","ui_kits/website/pages.jsx":"d72c9b3a931c","ui_kits/website/shell.jsx":"f18530927e9d","ui_kits/website/studio-content.jsx":"138751a42f1d","ui_kits/website/studio.jsx":"3ccbfad19e91"},"inlinedExternals":[],"unexposedExports":[{"name":"fieldFrame","sourcePath":"components/core/Input.jsx"}]} */

(() => {

const __ds_ns = (window.TableAIDesignSystem_f48f27 = window.TableAIDesignSystem_f48f27 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/content/PersonCard.jsx
try { (() => {
/**
 * Team / advisor card. Square portrait slot (never circular), name, role in tracked caps, short bio.
 * Without `photo` a hairline square with the initial stands in — no stock faces.
 */
function PersonCard({
  name,
  role,
  bio,
  photo,
  initial,
  tags = [],
  layout = "vertical",
  style
}) {
  const horizontal = layout === "horizontal";
  const portrait = photo ? /*#__PURE__*/React.createElement("img", {
    src: photo,
    alt: typeof name === "string" ? name : "",
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      filter: "grayscale(1) contrast(1.05)",
      display: "block"
    }
  }) : /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: horizontal ? 28 : 40,
      fontWeight: 200,
      color: "var(--text-subtle)"
    }
  }, initial || (typeof name === "string" ? name.trim()[0] : ""));
  return /*#__PURE__*/React.createElement("article", {
    style: {
      display: horizontal ? "grid" : "flex",
      gridTemplateColumns: horizontal ? "96px 1fr" : undefined,
      flexDirection: "column",
      gap: horizontal ? 24 : 20,
      fontFamily: "var(--font-sans)",
      color: "var(--text)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      aspectRatio: horizontal ? "1 / 1" : "4 / 5",
      width: "100%",
      border: "1px solid var(--border)",
      background: "var(--bg-container-low)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden"
    }
  }, portrait), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("h4", {
    style: {
      margin: "0 0 6px",
      fontSize: 18,
      fontWeight: 500,
      letterSpacing: "-0.01em",
      lineHeight: 1.3
    }
  }, name), role ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "0 0 12px",
      fontSize: 11,
      letterSpacing: "var(--ls-track-md)",
      textTransform: "uppercase",
      color: "var(--text-muted)",
      lineHeight: 1.5
    }
  }, role) : null, bio ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      lineHeight: 1.6,
      color: "var(--text-muted)"
    }
  }, bio) : null, tags.length ? /*#__PURE__*/React.createElement("ul", {
    style: {
      listStyle: "none",
      margin: "16px 0 0",
      padding: 0,
      display: "flex",
      flexWrap: "wrap",
      gap: 6
    }
  }, tags.map(t => /*#__PURE__*/React.createElement("li", {
    key: t,
    style: {
      fontSize: 11,
      padding: "3px 8px",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-sm)",
      color: "var(--text-muted)"
    }
  }, t))) : null));
}
Object.assign(__ds_scope, { PersonCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/content/PersonCard.jsx", error: String((e && e.message) || e) }); }

// components/content/Quote.jsx
try { (() => {
/** Pull quote: large light type, optional gold 48px hairline above, tracked attribution line. */
function Quote({
  children,
  author,
  role,
  accent = true,
  size = "lg",
  align = "left",
  style
}) {
  const fs = {
    md: "clamp(20px,2.2vw,26px)",
    lg: "clamp(24px,3vw,40px)"
  }[size] || size;
  return /*#__PURE__*/React.createElement("figure", {
    style: {
      margin: 0,
      fontFamily: "var(--font-sans)",
      color: "var(--text)",
      textAlign: align,
      ...style
    }
  }, accent ? /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      display: "block",
      width: 48,
      height: 1,
      background: "var(--accent)",
      margin: align === "center" ? "0 auto 32px" : "0 0 32px"
    }
  }) : null, /*#__PURE__*/React.createElement("blockquote", {
    style: {
      margin: 0,
      fontSize: fs,
      fontWeight: 300,
      lineHeight: 1.35,
      letterSpacing: "-0.02em",
      textWrap: "pretty"
    }
  }, children), author ? /*#__PURE__*/React.createElement("figcaption", {
    style: {
      marginTop: 24,
      display: "flex",
      flexDirection: "column",
      gap: 4,
      alignItems: align === "center" ? "center" : "flex-start"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 500
    }
  }, author), role ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      letterSpacing: "var(--ls-track-md)",
      textTransform: "uppercase",
      color: "var(--text-muted)"
    }
  }, role) : null) : null);
}
Object.assign(__ds_scope, { Quote });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/content/Quote.jsx", error: String((e && e.message) || e) }); }

// components/content/Steps.jsx
try { (() => {
/**
 * Numbered process / ladder (01 → 02 → 03). Hairline connectors; the `active` step gets a gold hairline and full-ink
 * text, completed steps stay ink, upcoming steps are muted.
 */
function Steps({
  items = [],
  active,
  orientation = "horizontal",
  numbered = true,
  style
}) {
  const vertical = orientation === "vertical";
  const state = i => active == null ? "idle" : i < active ? "done" : i === active ? "active" : "todo";
  return /*#__PURE__*/React.createElement("ol", {
    style: {
      listStyle: "none",
      margin: 0,
      padding: 0,
      display: "grid",
      gridTemplateColumns: vertical ? "1fr" : `repeat(${items.length}, minmax(0,1fr))`,
      gap: vertical ? 0 : 24,
      fontFamily: "var(--font-sans)",
      color: "var(--text)",
      ...style
    }
  }, items.map((it, i) => {
    const s = state(i);
    const ink = s === "todo" ? "var(--text-subtle)" : "var(--text)";
    const rule = s === "active" ? "var(--accent)" : s === "todo" ? "var(--border)" : "var(--border-strong)";
    return /*#__PURE__*/React.createElement("li", {
      key: i,
      "aria-current": s === "active" ? "step" : undefined,
      style: vertical ? {
        display: "grid",
        gridTemplateColumns: "48px 1fr",
        gap: 16,
        paddingBottom: i < items.length - 1 ? 32 : 0,
        position: "relative"
      } : {
        borderTop: `${s === "active" ? 2 : 1}px solid ${rule}`,
        paddingTop: s === "active" ? 23 : 24,
        transition: "border-color var(--dur-base) var(--ease-standard)"
      }
    }, vertical ? /*#__PURE__*/React.createElement("span", {
      style: {
        position: "relative",
        display: "flex",
        justifyContent: "center"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 9,
        height: 9,
        marginTop: 6,
        borderRadius: "50%",
        background: s === "active" ? "var(--accent)" : s === "todo" ? "var(--bg)" : "var(--text)",
        border: `1px solid ${s === "active" ? "var(--accent)" : s === "todo" ? "var(--color-outline)" : "var(--text)"}`,
        zIndex: 1
      }
    }), i < items.length - 1 ? /*#__PURE__*/React.createElement("span", {
      style: {
        position: "absolute",
        top: 18,
        bottom: -26,
        width: 1,
        background: "var(--border)"
      }
    }) : null) : null, /*#__PURE__*/React.createElement("div", null, numbered ? /*#__PURE__*/React.createElement("span", {
      style: {
        display: "block",
        marginBottom: 12,
        fontSize: 12,
        letterSpacing: "var(--ls-track-lg)",
        color: s === "active" ? "var(--accent-text)" : "var(--text-muted)"
      }
    }, it.number || String(i + 1).padStart(2, "0")) : null, /*#__PURE__*/React.createElement("h4", {
      style: {
        margin: "0 0 8px",
        fontSize: 17,
        fontWeight: 500,
        letterSpacing: "-0.01em",
        lineHeight: 1.35,
        color: ink
      }
    }, it.title), it.description ? /*#__PURE__*/React.createElement("p", {
      style: {
        margin: 0,
        fontSize: 14,
        lineHeight: 1.6,
        color: s === "todo" ? "var(--text-subtle)" : "var(--text-muted)"
      }
    }, it.description) : null, it.meta ? /*#__PURE__*/React.createElement("p", {
      style: {
        margin: "12px 0 0",
        fontSize: 11,
        letterSpacing: "var(--ls-track-md)",
        textTransform: "uppercase",
        color: "var(--text-subtle)"
      }
    }, it.meta) : null));
  }));
}
Object.assign(__ds_scope, { Steps });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/content/Steps.jsx", error: String((e && e.message) || e) }); }

// components/core/Radio.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Radio: 16px ring; selected shows a Sundial Gold dot inside a deep-blue ring (active state = gold). */
function Radio({
  checked = false,
  onChange,
  name,
  value,
  label,
  description,
  disabled = false,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: "inline-flex",
      alignItems: "flex-start",
      gap: 12,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      fontFamily: "var(--font-sans)",
      color: "var(--text)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: "relative",
      width: 16,
      height: 16,
      flexShrink: 0,
      marginTop: label ? 2 : 0,
      borderRadius: "50%",
      boxSizing: "border-box",
      border: `1px solid ${checked ? "var(--border-strong)" : "var(--color-outline)"}`,
      background: "var(--bg)",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      outline: focus ? "1px solid var(--focus-ring)" : "none",
      outlineOffset: 2,
      transition: "all var(--dur-fast) var(--ease-standard)"
    }
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "radio",
    name: name,
    value: value,
    checked: checked,
    disabled: disabled,
    onChange: e => onChange && onChange(value, e),
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      position: "absolute",
      inset: 0,
      opacity: 0,
      margin: 0,
      cursor: "inherit"
    }
  }, rest)), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: "var(--accent)",
      transform: checked ? "scale(1)" : "scale(0)",
      transition: "transform var(--dur-fast) var(--ease-standard)"
    }
  })), label ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      lineHeight: 1.4
    }
  }, label), description ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "var(--text-muted)"
    }
  }, description) : null) : null);
}

/** Vertical or horizontal group of Radio items. `options`: [{value,label,description?}]. */
function RadioGroup({
  name,
  value,
  onChange,
  options = [],
  direction = "column",
  gap = 12,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    role: "radiogroup",
    style: {
      display: "flex",
      flexDirection: direction,
      gap,
      ...style
    }
  }, options.map(o => /*#__PURE__*/React.createElement(Radio, {
    key: o.value,
    name: name,
    value: o.value,
    label: o.label,
    description: o.description,
    disabled: o.disabled,
    checked: value === o.value,
    onChange: onChange
  })));
}
Object.assign(__ds_scope, { Radio, RadioGroup });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Radio.jsx", error: String((e && e.message) || e) }); }

// components/core/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Toggle: 36×20 track. Off = hairline grey; on = deep blue. The only fully rounded control in the system. */
function Switch({
  checked = false,
  onChange,
  label,
  description,
  disabled = false,
  size = "md",
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const w = size === "sm" ? 28 : 36,
    h = size === "sm" ? 16 : 20,
    k = h - 4;
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 12,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      fontFamily: "var(--font-sans)",
      color: "var(--text)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "false",
    style: {
      position: "relative",
      width: w,
      height: h,
      borderRadius: "var(--radius-full)",
      flexShrink: 0,
      boxSizing: "border-box",
      background: checked ? "var(--bg-inverse)" : "var(--color-outline-variant)",
      outline: focus ? "var(--focus-ring-width) solid var(--focus-ring)" : "none",
      outlineOffset: 2,
      transition: "background var(--dur-fast) var(--ease-standard)"
    }
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    role: "switch",
    checked: checked,
    disabled: disabled,
    onChange: e => onChange && onChange(e.target.checked, e),
    "aria-checked": checked,
    onFocus: e => setFocus(e.currentTarget.matches(":focus-visible")),
    onBlur: () => setFocus(false),
    style: {
      position: "absolute",
      inset: 0,
      opacity: 0,
      margin: 0,
      cursor: "inherit"
    }
  }, rest)), /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      top: 2,
      left: 2,
      width: k,
      height: k,
      borderRadius: "50%",
      background: "var(--bg)",
      transform: checked ? `translateX(${w - h}px)` : "translateX(0)",
      transition: "transform var(--dur-fast) var(--ease-standard)"
    }
  })), label ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      lineHeight: 1.4
    }
  }, label), description ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "var(--text-muted)"
    }
  }, description) : null) : null);
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Switch.jsx", error: String((e && e.message) || e) }); }

// components/data/BarChart.jsx
try { (() => {
/** Minimal horizontal/vertical bar chart. Deep-blue bars; one `highlight` bar in gold. No gridlines, no axes boxes. */
function BarChart({
  data = [],
  orientation = "horizontal",
  highlight,
  max,
  format = v => v,
  unit = "",
  height = 220,
  barThickness = 12,
  style
}) {
  const top = max ?? Math.max(1, ...data.map(d => d.value));
  const isHi = (d, i) => typeof highlight === "function" ? highlight(d, i) : highlight === i || highlight === d.label;
  const label = {
    fontSize: 11,
    letterSpacing: "var(--ls-track-md)",
    textTransform: "uppercase",
    color: "var(--text-muted)"
  };
  if (orientation === "vertical") {
    return /*#__PURE__*/React.createElement("div", {
      role: "img",
      "aria-label": data.map(d => `${d.label} ${format(d.value)}${unit}`).join(", "),
      style: {
        display: "flex",
        alignItems: "flex-end",
        gap: 24,
        height,
        fontFamily: "var(--font-sans)",
        borderBottom: "1px solid var(--border-strong)",
        ...style
      }
    }, data.map((d, i) => /*#__PURE__*/React.createElement("div", {
      key: d.label,
      style: {
        flex: 1,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        alignItems: "center",
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        fontVariantNumeric: "tabular-nums",
        color: isHi(d, i) ? "var(--accent-text)" : "var(--text)"
      }
    }, format(d.value), unit), /*#__PURE__*/React.createElement("div", {
      style: {
        width: "100%",
        maxWidth: barThickness * 4,
        height: `calc(${d.value / top * 100}% - 48px)`,
        minHeight: 1,
        background: isHi(d, i) ? "var(--accent)" : "var(--text)",
        opacity: isHi(d, i) ? 1 : 0.85
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        ...label,
        position: "relative",
        top: 28,
        whiteSpace: "nowrap"
      }
    }, d.label))));
  }
  return /*#__PURE__*/React.createElement("div", {
    role: "img",
    "aria-label": data.map(d => `${d.label} ${format(d.value)}${unit}`).join(", "),
    style: {
      display: "grid",
      gridTemplateColumns: "minmax(0,auto) 1fr auto",
      columnGap: 16,
      rowGap: 14,
      alignItems: "center",
      fontFamily: "var(--font-sans)",
      ...style
    }
  }, data.map((d, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: d.label
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      ...label,
      whiteSpace: "nowrap"
    }
  }, d.label), /*#__PURE__*/React.createElement("div", {
    style: {
      height: barThickness,
      background: "var(--bg-container-low)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${d.value / top * 100}%`,
      height: "100%",
      background: isHi(d, i) ? "var(--accent)" : "var(--text)",
      transformOrigin: "left",
      animation: "ta-line-expand var(--dur-line) var(--ease-standard) both"
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontVariantNumeric: "tabular-nums",
      textAlign: "right",
      color: isHi(d, i) ? "var(--accent-text)" : "var(--text)"
    }
  }, format(d.value), unit))));
}
Object.assign(__ds_scope, { BarChart });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/BarChart.jsx", error: String((e && e.message) || e) }); }

// components/data/DonutChart.jsx
try { (() => {
const RAMP = ["var(--color-deep-blue)", "var(--color-deep-blue-tint)", "var(--color-deep-blue-fixed-dim)", "var(--color-outline-variant)"];

/** Thin-ring donut + legend. Deep-blue ramp; one `highlight` segment in gold. */
function DonutChart({
  data = [],
  highlight,
  size = 180,
  thickness = 14,
  centerValue,
  centerLabel,
  format = v => v,
  unit = "",
  legend = true,
  style
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  let k = 0;
  let off = 0;
  const segs = data.map((d, i) => {
    const hi = highlight === i || highlight === d.label;
    const color = d.color || (hi ? "var(--accent)" : RAMP[Math.min(k++, RAMP.length - 1)]);
    const len = d.value / total * C;
    const s = {
      label: d.label,
      value: d.value,
      color,
      len,
      off
    };
    off += len;
    return s;
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 32,
      flexWrap: "wrap",
      fontFamily: "var(--font-sans)",
      color: "var(--text)",
      ...style
    }
  }, /*#__PURE__*/React.createElement(DonutRing, {
    segs: segs,
    size: size,
    r: r,
    C: C,
    thickness: thickness,
    centerValue: centerValue,
    centerLabel: centerLabel
  }), legend ? /*#__PURE__*/React.createElement(DonutLegend, {
    segs: segs,
    format: format,
    unit: unit
  }) : null);
}
function DonutRing({
  segs,
  size,
  r,
  C,
  thickness,
  centerValue,
  centerLabel
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      width: size,
      height: size,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    style: {
      transform: "rotate(-90deg)"
    },
    "aria-hidden": "true"
  }, segs.map(s => /*#__PURE__*/React.createElement("circle", {
    key: s.label,
    cx: size / 2,
    cy: size / 2,
    r: r,
    fill: "none",
    stroke: s.color,
    strokeWidth: thickness,
    strokeDasharray: Math.max(s.len - 2, 0) + " " + C,
    strokeDashoffset: -s.off
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 4
    }
  }, centerValue != null ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: Math.round(size * 0.17),
      fontWeight: 300,
      letterSpacing: "-0.03em",
      lineHeight: 1
    }
  }, centerValue) : null, centerLabel ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      letterSpacing: "var(--ls-track-md)",
      textTransform: "uppercase",
      color: "var(--text-muted)"
    }
  }, centerLabel) : null));
}
function DonutLegend({
  segs,
  format,
  unit
}) {
  return /*#__PURE__*/React.createElement("ul", {
    style: {
      listStyle: "none",
      margin: 0,
      padding: 0,
      display: "flex",
      flexDirection: "column",
      gap: 10,
      flex: 1,
      minWidth: 160
    }
  }, segs.map(s => /*#__PURE__*/React.createElement("li", {
    key: s.label,
    style: {
      display: "grid",
      gridTemplateColumns: "10px 1fr auto",
      gap: 12,
      alignItems: "center",
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 10,
      height: 10,
      background: s.color
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-muted)"
    }
  }, s.label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontVariantNumeric: "tabular-nums"
    }
  }, format(s.value), unit))));
}
Object.assign(__ds_scope, { DonutChart });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/DonutChart.jsx", error: String((e && e.message) || e) }); }

// components/display/Divider.jsx
try { (() => {
/**
 * Hairline rules. `variant="line"` full-width divider; `"accent"` the 48px deep-blue mark (.accent-line);
 * `"gold"` the same mark in Sundial Gold (section closers); `vertical` for divide-x strips.
 */
function Divider({
  variant = "line",
  vertical = false,
  width = 48,
  spacing = 0,
  align = "left",
  style
}) {
  const color = variant === "gold" ? "var(--accent)" : variant === "accent" ? "var(--text)" : variant === "strong" ? "var(--border-strong)" : "var(--border)";
  if (vertical) return /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      display: "inline-block",
      width: 1,
      alignSelf: "stretch",
      minHeight: 16,
      background: color,
      margin: `0 ${spacing}px`,
      ...style
    }
  });
  const short = variant === "accent" || variant === "gold";
  return /*#__PURE__*/React.createElement("hr", {
    "aria-hidden": "true",
    style: {
      border: 0,
      height: 1,
      width: short ? width : "100%",
      background: color,
      margin: `${spacing}px ${align === "center" ? "auto" : align === "right" ? "0 0 0 auto" : 0}`,
      transformOrigin: align === "center" ? "center" : "left",
      ...style
    }
  });
}
Object.assign(__ds_scope, { Divider });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Divider.jsx", error: String((e && e.message) || e) }); }

// components/display/Eyebrow.jsx
try { (() => {
/**
 * Tracked uppercase section label (12px / 0.3em) — the brand's most-used typographic device.
 * `number` prefixes "01 —"; `line` draws the 48px accent hairline before the text; `gold` tints the line.
 */
function Eyebrow({
  children,
  number,
  line = false,
  gold = false,
  as = "p",
  align = "left",
  color,
  style
}) {
  const Comp = as;
  return /*#__PURE__*/React.createElement(Comp, {
    style: {
      margin: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: align === "center" ? "center" : "flex-start",
      gap: 12,
      fontFamily: "var(--font-sans)",
      fontSize: 12,
      fontWeight: 400,
      letterSpacing: "var(--ls-track-xl)",
      textTransform: "uppercase",
      lineHeight: 1.4,
      color: color || "var(--text-muted)",
      ...style
    }
  }, line ? /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      display: "inline-block",
      width: 48,
      height: 1,
      background: gold ? "var(--accent)" : "var(--text)",
      opacity: gold ? 1 : 0.3,
      transformOrigin: "left",
      animation: "ta-line-expand var(--dur-line) var(--ease-standard) both"
    }
  }) : null, /*#__PURE__*/React.createElement("span", null, number ? /*#__PURE__*/React.createElement("span", {
    style: {
      marginRight: 12
    }
  }, number, " \u2014") : null, children));
}
Object.assign(__ds_scope, { Eyebrow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Eyebrow.jsx", error: String((e && e.message) || e) }); }

// components/display/Skeleton.jsx
try { (() => {
/** Loading placeholder: minimal deep-blue tint, slow opacity pulse, no shimmer (per TableAI_DESIGN.md §4). */
function Skeleton({
  width = "100%",
  height = 14,
  radius = "var(--radius-sm)",
  circle = false,
  lines = 0,
  gap = 10,
  style
}) {
  const block = (w, key) => /*#__PURE__*/React.createElement("span", {
    key: key,
    style: {
      display: "block",
      width: w,
      height: circle ? width : height,
      borderRadius: circle ? "50%" : radius,
      background: "rgba(10,22,38,0.07)",
      animation: "ta-skeleton 1.8s var(--ease-standard) infinite",
      ...style
    }
  });
  if (lines > 1) return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap
    }
  }, Array.from({
    length: lines
  }, (_, i) => block(i === lines - 1 ? "60%" : width, i)));
  return block(width);
}
Object.assign(__ds_scope, { Skeleton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Skeleton.jsx", error: String((e && e.message) || e) }); }

// components/display/Stat.jsx
try { (() => {
/**
 * Key figure: large light numeral + tracked label. `accent` renders the value in Sundial Gold — reserved for the
 * one figure that matters on a view. `countUp` animates from 0 on mount (website stats strip).
 */
function Stat({
  value,
  suffix = "",
  label,
  description,
  accent = false,
  countUp = false,
  size = "md",
  align = "center",
  style
}) {
  const numeric = typeof value === "number";
  const [n, setN] = React.useState(countUp && numeric ? 0 : value);
  React.useEffect(() => {
    if (!countUp || !numeric) {
      setN(value);
      return;
    }
    let start;
    let raf;
    const step = ts => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / 2000, 1);
      setN(Math.floor((1 - Math.pow(1 - p, 4)) * value));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, countUp, numeric]);
  const fs = {
    sm: 24,
    md: 36,
    lg: 56
  }[size] || 36;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: align === "center" ? "center" : "flex-start",
      textAlign: align,
      gap: 8,
      fontFamily: "var(--font-sans)",
      color: "var(--text)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: fs,
      fontWeight: 300,
      letterSpacing: "-0.03em",
      lineHeight: 1,
      color: accent ? "var(--accent-text)" : "var(--text)",
      fontVariantNumeric: "tabular-nums"
    }
  }, numeric ? n.toLocaleString() : n, suffix), label ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      letterSpacing: "var(--ls-track-md)",
      textTransform: "uppercase",
      color: "var(--text-muted)"
    }
  }, label) : null, description ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 12,
      lineHeight: 1.6,
      color: "var(--text-subtle)",
      maxWidth: 280
    }
  }, description) : null);
}
Object.assign(__ds_scope, { Stat });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Stat.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Tooltip.jsx
try { (() => {
/** Hover/focus tooltip: deep-blue panel, white 12px text, 2px radius. Wraps a single trigger child. */
function Tooltip({
  content,
  side = "top",
  delay = 150,
  children,
  style
}) {
  const [open, setOpen] = React.useState(false);
  const timer = React.useRef();
  const id = React.useId();
  const show = () => {
    timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };
  const pos = {
    top: {
      bottom: "calc(100% + 8px)",
      left: "50%",
      transform: "translateX(-50%)"
    },
    bottom: {
      top: "calc(100% + 8px)",
      left: "50%",
      transform: "translateX(-50%)"
    },
    left: {
      right: "calc(100% + 8px)",
      top: "50%",
      transform: "translateY(-50%)"
    },
    right: {
      left: "calc(100% + 8px)",
      top: "50%",
      transform: "translateY(-50%)"
    }
  }[side];
  return /*#__PURE__*/React.createElement("span", {
    style: {
      position: "relative",
      display: "inline-flex",
      ...style
    },
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
    onKeyDown: e => {
      if (e.key === "Escape") hide();
    }
  }, React.isValidElement(children) ? React.cloneElement(children, {
    "aria-describedby": id
  }) : children, open ? /*#__PURE__*/React.createElement("span", {
    id: id,
    role: "tooltip",
    style: {
      position: "absolute",
      zIndex: 120,
      whiteSpace: "nowrap",
      padding: "6px 10px",
      background: "var(--bg-inverse)",
      color: "var(--text-on-inverse)",
      fontFamily: "var(--font-sans)",
      fontSize: 12,
      lineHeight: 1.4,
      letterSpacing: "0.02em",
      borderRadius: "var(--radius-sm)",
      pointerEvents: "none",
      animation: "ta-reveal-up var(--dur-fast) var(--ease-standard) both",
      "--reveal-offset": "4px",
      "--reveal-blur": "0px",
      ...pos
    }
  }, content) : null);
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Tooltip.jsx", error: String((e && e.message) || e) }); }

// components/icons/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Lucide icons (ISC, assets/icons/lucide/LICENSE). Generated from assets/icons/lucide/*.svg — do not hand-edit paths.
const ICON_PATHS = {
  "arrow-left": "<path d=\"m12 19-7-7 7-7\"></path> <path d=\"M19 12H5\"></path>",
  "arrow-right": "<path d=\"M5 12h14\"></path> <path d=\"m12 5 7 7-7 7\"></path>",
  "arrow-up-right": "<path d=\"M7 7h10v10\"></path> <path d=\"M7 17 17 7\"></path>",
  "bell": "<path d=\"M10.268 21a2 2 0 0 0 3.464 0\"></path> <path d=\"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326\"></path>",
  "bot": "<path d=\"M12 8V4H8\"></path> <rect width=\"16\" height=\"12\" x=\"4\" y=\"8\" rx=\"2\"></rect> <path d=\"M2 14h2\"></path> <path d=\"M20 14h2\"></path> <path d=\"M15 13v2\"></path> <path d=\"M9 13v2\"></path>",
  "check": "<path d=\"M20 6 9 17l-5-5\"></path>",
  "chevron-down": "<path d=\"m6 9 6 6 6-6\"></path>",
  "chevron-right": "<path d=\"m9 18 6-6-6-6\"></path>",
  "circle-alert": "<circle cx=\"12\" cy=\"12\" r=\"10\"></circle> <line x1=\"12\" x2=\"12\" y1=\"8\" y2=\"12\"></line> <line x1=\"12\" x2=\"12.01\" y1=\"16\" y2=\"16\"></line>",
  "circle-check": "<circle cx=\"12\" cy=\"12\" r=\"10\"></circle> <path d=\"m16 9-5.5 5.5L8 12\"></path>",
  "copy": "<rect width=\"14\" height=\"14\" x=\"8\" y=\"8\" rx=\"2\" ry=\"2\"></rect> <path d=\"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2\"></path>",
  "cpu": "<path d=\"M12 20v2\"></path> <path d=\"M12 2v2\"></path> <path d=\"M17 20v2\"></path> <path d=\"M17 2v2\"></path> <path d=\"M2 12h2\"></path> <path d=\"M2 17h2\"></path> <path d=\"M2 7h2\"></path> <path d=\"M20 12h2\"></path> <path d=\"M20 17h2\"></path> <path d=\"M20 7h2\"></path> <path d=\"M7 20v2\"></path> <path d=\"M7 2v2\"></path> <rect x=\"4\" y=\"4\" width=\"16\" height=\"16\" rx=\"2\"></rect> <rect x=\"8\" y=\"8\" width=\"8\" height=\"8\" rx=\"1\"></rect>",
  "database": "<ellipse cx=\"12\" cy=\"5\" rx=\"9\" ry=\"3\"></ellipse> <path d=\"M3 5V19A9 3 0 0 0 21 19V5\"></path> <path d=\"M3 12A9 3 0 0 0 21 12\"></path>",
  "external-link": "<path d=\"M15 3h6v6\"></path> <path d=\"M10 14 21 3\"></path> <path d=\"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\"></path>",
  "eye": "<path d=\"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0\"></path> <circle cx=\"12\" cy=\"12\" r=\"3\"></circle>",
  "file-text": "<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"></path> <path d=\"M14 2v5a1 1 0 0 0 1 1h5\"></path> <path d=\"M10 9H8\"></path> <path d=\"M16 13H8\"></path> <path d=\"M16 17H8\"></path>",
  "globe": "<circle cx=\"12\" cy=\"12\" r=\"10\"></circle> <path d=\"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20\"></path> <path d=\"M2 12h20\"></path>",
  "handshake": "<path d=\"m11 17 2 2a1 1 0 1 0 3-3\"></path> <path d=\"m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4\"></path> <path d=\"m21 3 1 11h-2\"></path> <path d=\"M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3\"></path> <path d=\"M3 4h8\"></path>",
  "info": "<circle cx=\"12\" cy=\"12\" r=\"10\"></circle> <path d=\"M12 16v-4\"></path> <path d=\"M12 8h.01\"></path>",
  "languages": "<path d=\"m5 8 6 6\"></path> <path d=\"m4 14 6-6 2-3\"></path> <path d=\"M2 5h12\"></path> <path d=\"M7 2h1\"></path> <path d=\"m22 22-5-10-5 10\"></path> <path d=\"M14 18h6\"></path>",
  "layout-dashboard": "<rect width=\"7\" height=\"9\" x=\"3\" y=\"3\" rx=\"1\"></rect> <rect width=\"7\" height=\"5\" x=\"14\" y=\"3\" rx=\"1\"></rect> <rect width=\"7\" height=\"9\" x=\"14\" y=\"12\" rx=\"1\"></rect> <rect width=\"7\" height=\"5\" x=\"3\" y=\"16\" rx=\"1\"></rect>",
  "loader-circle": "<path d=\"M21 12a9 9 0 1 1-6.219-8.56\"></path>",
  "lock": "<rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\"></rect> <path d=\"M7 11V7a5 5 0 0 1 10 0v4\"></path>",
  "log-out": "<path d=\"m16 17 5-5-5-5\"></path> <path d=\"M21 12H9\"></path> <path d=\"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4\"></path>",
  "mail": "<path d=\"m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7\"></path> <rect x=\"2\" y=\"4\" width=\"20\" height=\"16\" rx=\"2\"></rect>",
  "map-pin": "<path d=\"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0\"></path> <circle cx=\"12\" cy=\"10\" r=\"3\"></circle>",
  "menu": "<path d=\"M4 5h16\"></path> <path d=\"M4 12h16\"></path> <path d=\"M4 19h16\"></path>",
  "minus": "<path d=\"M5 12h14\"></path>",
  "pencil": "<path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\"></path> <path d=\"m15 5 4 4\"></path>",
  "plus": "<path d=\"M5 12h14\"></path> <path d=\"M12 5v14\"></path>",
  "search": "<path d=\"m21 21-4.34-4.34\"></path> <circle cx=\"11\" cy=\"11\" r=\"8\"></circle>",
  "send": "<path d=\"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z\"></path> <path d=\"m21.854 2.147-10.94 10.939\"></path>",
  "settings": "<path d=\"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915\"></path> <circle cx=\"12\" cy=\"12\" r=\"3\"></circle>",
  "shield": "<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\"></path>",
  "sparkles": "<path d=\"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z\"></path> <path d=\"M20 2v4\"></path> <path d=\"M22 4h-4\"></path> <circle cx=\"4\" cy=\"20\" r=\"2\"></circle>",
  "trash": "<path d=\"M10 11v6\"></path> <path d=\"M14 11v6\"></path> <path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"></path> <path d=\"M3 6h18\"></path> <path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"></path>",
  "user": "<path d=\"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2\"></path> <circle cx=\"12\" cy=\"7\" r=\"4\"></circle>",
  "users": "<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"></path> <path d=\"M16 3.128a4 4 0 0 1 0 7.744\"></path> <path d=\"M22 21v-2a4 4 0 0 0-3-3.87\"></path> <circle cx=\"9\" cy=\"7\" r=\"4\"></circle>",
  "x": "<path d=\"M18 6 6 18\"></path> <path d=\"m6 6 12 12\"></path>",
  "zap": "<path d=\"M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z\"></path>"
};
const ICON_NAMES = Object.keys(ICON_PATHS);
/** Stroke icon from the Lucide set used by the TABLE AI website (1.5px stroke, currentColor). */
function Icon({
  name,
  size = 16,
  strokeWidth = 1.5,
  color = "currentColor",
  style,
  className,
  title,
  ...rest
}) {
  const inner = ICON_PATHS[name];
  if (!inner) return null;
  return /*#__PURE__*/React.createElement("svg", _extends({
    xmlns: "http://www.w3.org/2000/svg",
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": title ? undefined : true,
    role: title ? "img" : undefined,
    className: className,
    style: {
      display: "inline-block",
      flexShrink: 0,
      verticalAlign: "middle",
      ...style
    },
    dangerouslySetInnerHTML: {
      __html: (title ? `<title>${title}</title>` : "") + inner
    }
  }, rest));
}
Object.assign(__ds_scope, { ICON_PATHS, ICON_NAMES, Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/icons/Icon.jsx", error: String((e && e.message) || e) }); }

// components/a2a/ChatMessage.jsx
try { (() => {
/**
 * One turn in an agent-to-agent / human-in-the-loop thread (from the website's AIChatBox). `role`: "agent" (left,
 * surface bubble, sparkles avatar), "human" (right, deep-blue bubble, user avatar), "system" (centered hairline note).
 * `meta` is a tracked eyebrow above the bubble — use it to name the agent or node ("AGENT · SETTLEMENT", "EXPERT · BASEL").
 */
function ChatMessage({
  role = "agent",
  children,
  meta,
  time,
  pending = false,
  avatar,
  maxWidth = "80%",
  style
}) {
  if (role === "system") {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontFamily: "var(--font-sans)",
        fontSize: 11,
        letterSpacing: "var(--ls-track-md)",
        textTransform: "uppercase",
        color: "var(--text-subtle)",
        ...style
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        height: 1,
        background: "var(--border)"
      }
    }), children, /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        height: 1,
        background: "var(--border)"
      }
    }));
  }
  const human = role === "human";
  const av = avatar || /*#__PURE__*/React.createElement("span", {
    style: {
      width: 32,
      height: 32,
      borderRadius: "50%",
      flexShrink: 0,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      marginTop: meta ? 22 : 2,
      background: human ? "var(--bg-inverse)" : "var(--accent-wash)",
      color: human ? "var(--text-on-inverse)" : "var(--accent-text)",
      border: human ? "1px solid transparent" : "1px solid rgba(168,139,82,0.35)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: human ? "user" : "sparkles",
    size: 16
  }));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 12,
      alignItems: "flex-start",
      justifyContent: human ? "flex-end" : "flex-start",
      fontFamily: "var(--font-sans)",
      ...style
    }
  }, !human ? av : null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: human ? "flex-end" : "flex-start",
      gap: 6,
      maxWidth
    }
  }, meta ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      letterSpacing: "var(--ls-track-md)",
      textTransform: "uppercase",
      color: "var(--text-subtle)"
    }
  }, meta) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "10px 16px",
      borderRadius: "var(--radius)",
      fontSize: 14,
      lineHeight: 1.6,
      whiteSpace: "pre-wrap",
      background: human ? "var(--bg-inverse)" : "var(--bg-container-low)",
      color: human ? "var(--text-on-inverse)" : "var(--text-body)",
      border: human ? "1px solid transparent" : "1px solid var(--border)"
    }
  }, pending ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "loader-circle",
    size: 16,
    style: {
      color: "var(--text-muted)",
      animation: "ta-spin 1s linear infinite",
      display: "block"
    }
  }) : children), time ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--text-subtle)"
    }
  }, time) : null), human ? av : null);
}
Object.assign(__ds_scope, { ChatMessage });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/a2a/ChatMessage.jsx", error: String((e && e.message) || e) }); }

// components/content/Accordion.jsx
try { (() => {
/**
 * Hairline accordion (from the website's AI Labs details). Rows divided by 1px rules; "+" rotates to "×" when open.
 * Keyboard: header is a real button with aria-expanded / aria-controls.
 */
function Accordion({
  items = [],
  multiple = false,
  defaultOpen = [],
  indicator = "plus",
  style
}) {
  const [open, setOpen] = React.useState(() => new Set(defaultOpen));
  const baseId = React.useId();
  const toggle = i => setOpen(prev => {
    const next = new Set(multiple ? prev : []);
    if (prev.has(i)) next.delete(i);else next.add(i);
    return next;
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: "1px solid var(--border)",
      fontFamily: "var(--font-sans)",
      color: "var(--text)",
      ...style
    }
  }, items.map((it, i) => {
    const on = open.has(i);
    const panelId = baseId + "-p" + i;
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        borderBottom: "1px solid var(--border)"
      }
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      "aria-expanded": on,
      "aria-controls": panelId,
      onClick: () => toggle(i),
      style: {
        all: "unset",
        boxSizing: "border-box",
        width: "100%",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "24px 0"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "baseline",
        gap: 16
      }
    }, it.number ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 12,
        letterSpacing: "var(--ls-track-lg)",
        color: "var(--text-muted)"
      }
    }, it.number) : null, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 15,
        fontWeight: 500,
        letterSpacing: "-0.01em"
      }
    }, it.title)), indicator === "chevron" ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: "chevron-down",
      size: 14,
      style: {
        color: "var(--text-muted)",
        transform: on ? "rotate(180deg)" : "none",
        transition: "transform var(--dur-fast) var(--ease-standard)"
      }
    }) : /*#__PURE__*/React.createElement("span", {
      "aria-hidden": "true",
      style: {
        fontSize: 18,
        lineHeight: 1,
        color: "var(--text-muted)",
        transform: on ? "rotate(45deg)" : "none",
        transition: "transform var(--dur-fast) var(--ease-standard)"
      }
    }, "+")), /*#__PURE__*/React.createElement("div", {
      id: panelId,
      role: "region",
      hidden: !on,
      style: {
        paddingBottom: 24,
        fontSize: 14,
        lineHeight: 1.7,
        color: "var(--text-muted)",
        maxWidth: 760
      }
    }, it.content));
  }));
}
Object.assign(__ds_scope, { Accordion });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/content/Accordion.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SIZES = {
  sm: {
    height: 32,
    padding: "0 12px",
    fontSize: 13,
    gap: 8,
    icon: 14
  },
  md: {
    height: 40,
    padding: "0 20px",
    fontSize: 14,
    gap: 10,
    icon: 16
  },
  lg: {
    height: 56,
    padding: "0 32px",
    fontSize: 14,
    gap: 12,
    icon: 16
  }
};
function variantStyle(variant, {
  hover,
  active,
  disabled
}) {
  const base = {
    border: "1px solid transparent",
    background: "transparent",
    color: "var(--text)"
  };
  switch (variant) {
    case "cta":
      // Sundial Dark Gold — reserved for the single key conversion action on a view
      return {
        ...base,
        background: hover ? "var(--accent-hover)" : "var(--accent)",
        color: "var(--text)",
        borderColor: "transparent",
        boxShadow: active ? "inset 0 0 0 1px var(--color-gold-deep)" : "none"
      };
    case "outline":
      return {
        ...base,
        borderColor: active ? "var(--accent)" : "var(--border-strong)",
        color: "var(--text)",
        background: active ? "var(--accent-wash)" : "var(--bg)",
        boxShadow: hover && !active ? "inset 0 -1px 0 var(--accent)" : "none"
      };
    case "ghost":
      return {
        ...base,
        color: hover ? "var(--text)" : "var(--text-muted)",
        background: active ? "var(--accent-wash)" : hover ? "var(--bg-container-low)" : "transparent"
      };
    case "link":
      return {
        ...base,
        color: hover ? "var(--accent-text)" : "var(--text)",
        padding: 0,
        height: "auto",
        textDecoration: "none",
        boxShadow: hover ? "inset 0 -1px 0 currentColor" : "inset 0 -1px 0 var(--border)"
      };
    case "danger":
      return {
        ...base,
        borderColor: "var(--danger)",
        color: hover ? "var(--bg)" : "var(--danger)",
        background: hover ? "var(--danger)" : "var(--bg)"
      };
    case "primary":
    default:
      return {
        ...base,
        background: hover ? "var(--color-deep-blue-muted)" : "var(--bg-inverse)",
        color: "var(--text-on-inverse)",
        boxShadow: active ? "inset 0 0 0 1px var(--accent)" : "none"
      };
  }
}

/** TABLE AI button. Deep-blue structure by default; `cta` is the one gold conversion action per view. */
function Button({
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  loading = false,
  disabled = false,
  block = false,
  as,
  href,
  children,
  style,
  onClick,
  type = "button",
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const [active, setActive] = React.useState(false);
  const [focus, setFocus] = React.useState(false);
  const s = SIZES[size] || SIZES.md;
  const isDisabled = disabled || loading;
  const vs = variantStyle(variant, {
    hover: hover && !isDisabled,
    active: active && !isDisabled,
    disabled: isDisabled
  });
  const Comp = as || (href ? "a" : "button");
  const styles = {
    display: block ? "flex" : "inline-flex",
    width: block ? "100%" : undefined,
    alignItems: "center",
    justifyContent: "center",
    gap: s.gap,
    height: variant === "link" ? "auto" : s.height,
    padding: variant === "link" ? 0 : s.padding,
    fontFamily: "var(--font-sans)",
    fontSize: s.fontSize,
    fontWeight: 500,
    letterSpacing: "0.02em",
    lineHeight: 1,
    borderRadius: "var(--radius-control)",
    cursor: isDisabled ? "not-allowed" : "pointer",
    opacity: isDisabled ? 0.45 : 1,
    whiteSpace: "nowrap",
    userSelect: "none",
    textDecoration: "none",
    boxSizing: "border-box",
    transform: active && !isDisabled && variant !== "link" ? "scale(0.98)" : "none",
    transition: "background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-standard)",
    outline: focus ? "var(--focus-ring-width) solid var(--focus-ring)" : "none",
    outlineOffset: 2,
    ...vs,
    ...style
  };
  return /*#__PURE__*/React.createElement(Comp, _extends({
    type: Comp === "button" ? type : undefined,
    href: href,
    disabled: Comp === "button" ? isDisabled : undefined,
    "aria-disabled": isDisabled || undefined,
    style: styles,
    onClick: isDisabled ? undefined : onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setActive(false);
    },
    onMouseDown: () => setActive(true),
    onMouseUp: () => setActive(false),
    onFocus: e => setFocus(e.currentTarget.matches(":focus-visible")),
    onBlur: () => setFocus(false)
  }, rest), loading ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "loader-circle",
    size: s.icon,
    style: {
      animation: "ta-spin 1s linear infinite"
    }
  }) : icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: s.icon
  }) : null, children, iconRight && !loading ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconRight,
    size: s.icon
  }) : null);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** 16px square, 2px radius, deep-blue border; checked fills deep blue with a white check. Gold ring on focus. */
function Checkbox({
  checked = false,
  indeterminate = false,
  onChange,
  label,
  description,
  disabled = false,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const on = checked || indeterminate;
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: "inline-flex",
      alignItems: "flex-start",
      gap: 12,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      fontFamily: "var(--font-sans)",
      color: "var(--text)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: "relative",
      width: 16,
      height: 16,
      flexShrink: 0,
      marginTop: label ? 2 : 0,
      borderRadius: "var(--radius-sm)",
      boxSizing: "border-box",
      border: `1px solid ${on ? "var(--border-strong)" : "var(--color-outline)"}`,
      background: on ? "var(--bg-inverse)" : "var(--bg)",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      outline: focus ? "1px solid var(--focus-ring)" : "none",
      outlineOffset: 2,
      transition: "all var(--dur-fast) var(--ease-standard)"
    }
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    checked: checked,
    disabled: disabled,
    onChange: e => onChange && onChange(e.target.checked, e),
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      position: "absolute",
      inset: 0,
      opacity: 0,
      margin: 0,
      cursor: "inherit"
    }
  }, rest)), indeterminate ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "minus",
    size: 12,
    strokeWidth: 2,
    color: "var(--text-on-inverse)"
  }) : checked ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "check",
    size: 12,
    strokeWidth: 2,
    color: "var(--text-on-inverse)"
  }) : null), label ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      lineHeight: 1.4
    }
  }, label), description ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "var(--text-muted)"
    }
  }, description) : null) : null);
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SIZES = {
  sm: {
    box: 32,
    icon: 16
  },
  md: {
    box: 40,
    icon: 18
  }
};

/** Square icon-only button (nav menu, close, send, row actions). Always pass `label` for screen readers. */
function IconButton({
  icon,
  label,
  variant = "ghost",
  size = "md",
  active: pressed = false,
  disabled = false,
  loading = false,
  style,
  onClick,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const [down, setDown] = React.useState(false);
  const [focus, setFocus] = React.useState(false);
  const s = SIZES[size] || SIZES.md;
  const isDisabled = disabled || loading;
  const on = (pressed || down) && !isDisabled;
  const v = {
    ghost: {
      border: "1px solid transparent",
      background: on ? "var(--accent-wash)" : hover ? "var(--bg-container-low)" : "transparent",
      color: hover || on ? "var(--text)" : "var(--text-muted)"
    },
    outline: {
      border: `1px solid ${on ? "var(--accent)" : "var(--border-strong)"}`,
      background: on ? "var(--accent-wash)" : "var(--bg)",
      color: "var(--text)",
      boxShadow: hover && !on ? "inset 0 -1px 0 var(--accent)" : "none"
    },
    primary: {
      border: "1px solid transparent",
      background: hover ? "var(--color-deep-blue-muted)" : "var(--bg-inverse)",
      color: "var(--text-on-inverse)",
      boxShadow: on ? "inset 0 0 0 1px var(--accent)" : "none"
    }
  }[variant] || {};
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    "aria-label": label,
    title: label,
    "aria-pressed": pressed || undefined,
    disabled: isDisabled,
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: s.box,
      height: s.box,
      padding: 0,
      borderRadius: "var(--radius-control)",
      cursor: isDisabled ? "not-allowed" : "pointer",
      opacity: isDisabled ? 0.45 : 1,
      transform: down && !isDisabled ? "scale(0.96)" : "none",
      flexShrink: 0,
      outline: focus ? "1px solid var(--focus-ring)" : "none",
      outlineOffset: 2,
      transition: "all var(--dur-fast) var(--ease-standard)",
      ...v,
      ...style
    },
    onClick: isDisabled ? undefined : onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setDown(false);
    },
    onMouseDown: () => setDown(true),
    onMouseUp: () => setDown(false),
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false)
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: loading ? "loader-circle" : icon,
    size: s.icon,
    style: loading ? {
      animation: "ta-spin 1s linear infinite"
    } : undefined
  }));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function fieldFrame({
  focus,
  error,
  disabled
}) {
  return {
    display: "flex",
    alignItems: "center",
    width: "100%",
    boxSizing: "border-box",
    background: disabled ? "var(--bg-container-low)" : focus ? "var(--accent-wash)" : "var(--bg)",
    border: `1px solid ${error ? "var(--danger)" : focus ? "var(--accent)" : "var(--border)"}`,
    borderRadius: "var(--radius-control)",
    transition: "border-color var(--dur-fast) var(--ease-standard), background var(--dur-fast) var(--ease-standard)",
    opacity: disabled ? 0.6 : 1
  };
}
function FieldLabel({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  containerStyle
}) {
  return /*#__PURE__*/React.createElement("label", {
    htmlFor: htmlFor,
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      fontFamily: "var(--font-sans)",
      color: "var(--text)",
      minWidth: 0,
      ...containerStyle
    }
  }, label ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      letterSpacing: "0.05em",
      textTransform: "uppercase",
      color: "var(--text-muted)"
    }
  }, label, required ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--accent-text)"
    }
  }, " *") : null) : null, children, error ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "var(--danger)",
      display: "flex",
      alignItems: "center",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "circle-alert",
    size: 12
  }), error) : hint ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "var(--text-subtle)"
    }
  }, hint) : null);
}

/** Text input: hairline field, gold border + gold-mist wash on focus, red on error. */
function Input({
  label,
  hint,
  error,
  required,
  icon,
  prefix,
  suffix,
  size = "md",
  disabled = false,
  style,
  containerStyle,
  id,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const h = size === "sm" ? 32 : 40;
  const autoId = React.useId();
  const inputId = id || "in-" + autoId;
  return /*#__PURE__*/React.createElement(FieldLabel, {
    label: label,
    hint: hint,
    error: error,
    required: required,
    htmlFor: inputId,
    containerStyle: containerStyle
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      ...fieldFrame({
        focus,
        error,
        disabled
      }),
      height: h,
      padding: "0 12px",
      gap: 8,
      ...style
    }
  }, icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 16,
    style: {
      color: "var(--text-muted)"
    }
  }) : null, prefix ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: "var(--text-muted)"
    }
  }, prefix) : null, /*#__PURE__*/React.createElement("input", _extends({
    id: inputId,
    disabled: disabled,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    "aria-invalid": !!error || undefined,
    style: {
      flex: 1,
      minWidth: 0,
      border: 0,
      outline: 0,
      background: "transparent",
      fontFamily: "var(--font-sans)",
      fontSize: 14,
      color: "var(--text)",
      padding: 0,
      height: "100%"
    }
  }, rest)), suffix ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: "var(--text-muted)"
    }
  }, suffix) : null));
}
Object.assign(__ds_scope, { fieldFrame, FieldLabel, Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/core/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Native select in the brand field frame with a hairline chevron. `options`: [{value,label}] or strings. */
function Select({
  label,
  hint,
  error,
  required,
  options = [],
  placeholder,
  size = "md",
  disabled = false,
  style,
  containerStyle,
  id,
  value,
  onChange,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const h = size === "sm" ? 32 : 40;
  const autoId = React.useId();
  const selId = id || "sel-" + autoId;
  const opts = options.map(o => typeof o === "string" ? {
    value: o,
    label: o
  } : o);
  return /*#__PURE__*/React.createElement(__ds_scope.FieldLabel, {
    label: label,
    hint: hint,
    error: error,
    required: required,
    htmlFor: selId,
    containerStyle: containerStyle
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      ...__ds_scope.fieldFrame({
        focus,
        error,
        disabled
      }),
      height: h,
      padding: "0 12px",
      position: "relative",
      ...style
    }
  }, /*#__PURE__*/React.createElement("select", _extends({
    id: selId,
    disabled: disabled,
    value: value,
    onChange: onChange,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      flex: 1,
      minWidth: 0,
      appearance: "none",
      WebkitAppearance: "none",
      border: 0,
      outline: 0,
      background: "transparent",
      fontFamily: "var(--font-sans)",
      fontSize: 14,
      color: value === "" || value == null ? "var(--text-muted)" : "var(--text)",
      padding: 0,
      paddingRight: 24,
      height: "100%",
      cursor: disabled ? "not-allowed" : "pointer"
    }
  }, rest), placeholder ? /*#__PURE__*/React.createElement("option", {
    value: "",
    disabled: true
  }, placeholder) : null, opts.map(o => /*#__PURE__*/React.createElement("option", {
    key: o.value,
    value: o.value
  }, o.label))), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-down",
    size: 16,
    style: {
      position: "absolute",
      right: 12,
      color: "var(--text-muted)",
      pointerEvents: "none"
    }
  })));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Select.jsx", error: String((e && e.message) || e) }); }

// components/core/Textarea.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Multi-line field. Same frame as Input; `autoGrow` expands with content (used by the chat composer). */
function Textarea({
  label,
  hint,
  error,
  required,
  rows = 3,
  autoGrow = false,
  maxHeight = 160,
  disabled = false,
  style,
  containerStyle,
  id,
  onChange,
  value,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!autoGrow || !ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = Math.min(ref.current.scrollHeight, maxHeight) + "px";
  }, [value, autoGrow, maxHeight]);
  const autoId = React.useId();
  const areaId = id || "ta-" + autoId;
  return /*#__PURE__*/React.createElement(__ds_scope.FieldLabel, {
    label: label,
    hint: hint,
    error: error,
    required: required,
    htmlFor: areaId,
    containerStyle: containerStyle
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      ...__ds_scope.fieldFrame({
        focus,
        error,
        disabled
      }),
      padding: "10px 12px",
      ...style
    }
  }, /*#__PURE__*/React.createElement("textarea", _extends({
    ref: ref,
    id: areaId,
    rows: rows,
    disabled: disabled,
    value: value,
    onChange: onChange,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    "aria-invalid": !!error || undefined,
    style: {
      flex: 1,
      minWidth: 0,
      border: 0,
      outline: 0,
      background: "transparent",
      resize: autoGrow ? "none" : "vertical",
      fontFamily: "var(--font-sans)",
      fontSize: 14,
      lineHeight: 1.5,
      color: "var(--text)",
      padding: 0,
      maxHeight: autoGrow ? maxHeight : undefined,
      overflowY: "auto"
    }
  }, rest))));
}
Object.assign(__ds_scope, { Textarea });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Textarea.jsx", error: String((e && e.message) || e) }); }

// components/data/DataTable.jsx
try { (() => {
/**
 * Hairline data table. Tracked uppercase header, 1px row rules, no zebra, no fills.
 * Numeric columns right-align with tabular numerals. `comparison` keeps the first column sticky and emphasised.
 */
function DataTable({
  columns = [],
  rows = [],
  variant = "default",
  sortable = false,
  defaultSort,
  highlightRow,
  caption,
  emptyText = "No records",
  onRowClick,
  style
}) {
  const [sort, setSort] = React.useState(defaultSort || null);
  const [hoverRow, setHoverRow] = React.useState(-1);
  const compact = variant === "compact";
  const comparison = variant === "comparison";
  const padY = compact ? 10 : 16;
  const sorted = React.useMemo(() => {
    if (!sort) return rows;
    const col = columns.find(c => c.key === sort.key);
    const get = r => col && col.sortValue ? col.sortValue(r) : r[sort.key];
    return [...rows].sort((a, b) => {
      const x = get(a),
        y = get(b);
      const r = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""));
      return sort.dir === "asc" ? r : -r;
    });
  }, [rows, sort, columns]);
  const toggle = key => setSort(s => s && s.key === key ? s.dir === "asc" ? {
    key,
    dir: "desc"
  } : null : {
    key,
    dir: "asc"
  });
  const th = (c, i) => {
    const active = sort && sort.key === c.key;
    const canSort = sortable && c.sortable !== false;
    return /*#__PURE__*/React.createElement("th", {
      key: c.key,
      scope: "col",
      "aria-sort": active ? sort.dir === "asc" ? "ascending" : "descending" : undefined,
      style: {
        textAlign: c.numeric ? "right" : "left",
        padding: `${compact ? 8 : 12}px 16px`,
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: "var(--ls-track-md)",
        textTransform: "uppercase",
        color: active ? "var(--text)" : "var(--text-muted)",
        borderBottom: "1px solid var(--border-strong)",
        whiteSpace: "nowrap",
        width: c.width,
        position: comparison && i === 0 ? "sticky" : undefined,
        left: comparison && i === 0 ? 0 : undefined,
        background: "var(--bg)",
        zIndex: comparison && i === 0 ? 1 : undefined
      }
    }, canSort ? /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => toggle(c.key),
      style: {
        all: "unset",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6
      }
    }, c.label, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: "chevron-down",
      size: 12,
      style: {
        opacity: active ? 1 : 0.3,
        transform: active && sort.dir === "asc" ? "rotate(180deg)" : "none",
        transition: "transform var(--dur-fast) var(--ease-standard)"
      }
    })) : c.label);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: "100%",
      overflowX: "auto",
      fontFamily: "var(--font-sans)",
      color: "var(--text)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse",
      fontSize: compact ? 13 : 14
    }
  }, caption ? /*#__PURE__*/React.createElement("caption", {
    style: {
      captionSide: "top",
      textAlign: "left",
      padding: "0 0 12px",
      fontSize: 12,
      letterSpacing: "var(--ls-track-xl)",
      textTransform: "uppercase",
      color: "var(--text-muted)"
    }
  }, caption) : null, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, columns.map(th))), /*#__PURE__*/React.createElement("tbody", null, sorted.length === 0 ? /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: columns.length,
    style: {
      padding: "40px 16px",
      textAlign: "center",
      color: "var(--text-subtle)",
      borderBottom: "1px solid var(--border)"
    }
  }, emptyText)) : sorted.map((r, ri) => {
    const hl = highlightRow != null && (typeof highlightRow === "function" ? highlightRow(r, ri) : highlightRow === ri);
    const bg = hl ? "var(--accent-wash)" : onRowClick && hoverRow === ri ? "var(--bg-container-low)" : "var(--bg)";
    return /*#__PURE__*/React.createElement("tr", {
      key: r.id ?? ri,
      onClick: onRowClick ? () => onRowClick(r) : undefined,
      onMouseEnter: () => setHoverRow(ri),
      onMouseLeave: () => setHoverRow(-1),
      style: {
        cursor: onRowClick ? "pointer" : "default",
        transition: "background var(--dur-fast) var(--ease-standard)"
      }
    }, columns.map((c, ci) => /*#__PURE__*/React.createElement("td", {
      key: c.key,
      style: {
        padding: `${padY}px 16px`,
        borderBottom: "1px solid var(--border)",
        textAlign: c.numeric ? "right" : "left",
        fontVariantNumeric: c.numeric ? "tabular-nums" : undefined,
        verticalAlign: "top",
        lineHeight: 1.5,
        fontWeight: comparison && ci === 0 ? 500 : 400,
        color: c.muted ? "var(--text-muted)" : "var(--text)",
        background: bg,
        position: comparison && ci === 0 ? "sticky" : undefined,
        left: comparison && ci === 0 ? 0 : undefined
      }
    }, c.render ? c.render(r) : r[c.key])));
  }))));
}
Object.assign(__ds_scope, { DataTable });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/DataTable.jsx", error: String((e && e.message) || e) }); }

// components/display/Badge.jsx
try { (() => {
/** Status label: 11px tracked uppercase, 2px radius. `gold` marks state/key data; use sparingly. */
function Badge({
  variant = "neutral",
  icon,
  dot = false,
  children,
  style
}) {
  const v = {
    neutral: {
      border: "1px solid var(--border)",
      color: "var(--text-muted)",
      background: "var(--bg)"
    },
    strong: {
      border: "1px solid var(--border-strong)",
      color: "var(--text)",
      background: "var(--bg)"
    },
    inverse: {
      border: "1px solid transparent",
      color: "var(--text-on-inverse)",
      background: "var(--bg-inverse)"
    },
    gold: {
      border: "1px solid var(--accent)",
      color: "var(--accent-text)",
      background: "var(--accent-wash)"
    },
    error: {
      border: "1px solid transparent",
      color: "var(--danger-text)",
      background: "var(--danger-bg)"
    },
    success: {
      border: "1px solid transparent",
      color: "var(--success)",
      background: "var(--success-bg)"
    },
    warning: {
      border: "1px solid transparent",
      color: "var(--warning)",
      background: "var(--warning-bg)"
    }
  }[variant] || {};
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      height: 22,
      padding: "0 8px",
      borderRadius: "var(--radius-sm)",
      fontFamily: "var(--font-sans)",
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: "var(--ls-track-sm)",
      textTransform: "uppercase",
      lineHeight: 1,
      whiteSpace: "nowrap",
      boxSizing: "border-box",
      ...v,
      ...style
    }
  }, dot ? /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: variant === "gold" ? "var(--accent)" : variant === "error" ? "var(--danger)" : variant === "success" ? "var(--success)" : variant === "warning" ? "var(--warning)" : "currentColor"
    }
  }) : null, icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 12
  }) : null, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Badge.jsx", error: String((e && e.message) || e) }); }

// components/display/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Card / tile. Square corners, hairline border, white ground. `variant="tile"` is for gap-1px grids on a border-coloured
 * background (the website's signature layout); `variant="dark"` is a deep-blue panel; `interactive` adds the .min-card hover.
 */
function Card({
  variant = "outline",
  interactive = false,
  padding = 32,
  eyebrow,
  number,
  title,
  description,
  footer,
  arrow = false,
  href,
  onClick,
  children,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const isLink = !!(href || onClick || interactive);
  const dark = variant === "dark";
  const v = {
    outline: {
      background: "var(--bg)",
      border: `1px solid ${hover && isLink ? "var(--color-outline)" : "var(--border)"}`
    },
    tile: {
      background: hover && isLink ? "var(--bg-container-low)" : "var(--bg)",
      border: "1px solid transparent"
    },
    dark: {
      background: "var(--bg-inverse-soft)",
      border: "1px solid var(--border-on-dark)",
      color: "var(--text-on-inverse)"
    },
    dashed: {
      background: "var(--bg)",
      border: "1px dashed var(--color-outline)"
    },
    surface: {
      background: "var(--bg-container-low)",
      border: "1px solid transparent"
    }
  }[variant] || {};
  const Comp = href ? "a" : "div";
  const muted = dark ? "var(--text-on-inverse-muted)" : "var(--text-muted)";
  return /*#__PURE__*/React.createElement(Comp, _extends({
    href: href,
    onClick: onClick,
    role: onClick && !href ? "button" : undefined,
    tabIndex: onClick && !href ? 0 : undefined,
    onKeyDown: onClick && !href ? e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick(e);
      }
    } : undefined,
    onFocus: e => setHover(e.currentTarget.matches(":focus-visible")),
    onBlur: () => setHover(false),
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: "flex",
      flexDirection: "column",
      boxSizing: "border-box",
      padding,
      borderRadius: "var(--radius-card)",
      color: "var(--text)",
      textDecoration: "none",
      position: "relative",
      cursor: isLink ? "pointer" : "default",
      transform: hover && isLink && variant !== "tile" ? "translateY(-2px)" : "none",
      transition: "transform var(--dur-slow) var(--ease-standard), background var(--dur-slow) var(--ease-standard), border-color var(--dur-slow) var(--ease-standard)",
      fontFamily: "var(--font-sans)",
      ...v,
      ...style
    }
  }, rest), number || arrow ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 32
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      letterSpacing: "var(--ls-track-xl)",
      color: muted
    }
  }, number), arrow ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "arrow-up-right",
    size: 16,
    style: {
      color: dark ? "var(--accent-on-dark)" : "var(--text)",
      opacity: hover ? 1 : 0,
      transform: hover ? "translateY(0)" : "translateY(4px)",
      transition: "all var(--dur-fast) var(--ease-standard)"
    }
  }) : null) : null, eyebrow ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "0 0 16px",
      fontSize: 12,
      letterSpacing: "var(--ls-track-lg)",
      textTransform: "uppercase",
      color: muted
    }
  }, eyebrow) : null, title ? /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: "0 0 16px",
      fontSize: 20,
      fontWeight: 400,
      letterSpacing: "-0.02em",
      lineHeight: 1.3,
      color: "inherit"
    }
  }, title) : null, description ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      lineHeight: 1.6,
      color: muted
    }
  }, description) : null, children, footer ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "auto",
      paddingTop: 24,
      borderTop: `1px solid ${dark ? "var(--border-on-dark)" : "var(--border)"}`,
      fontSize: 12,
      letterSpacing: "var(--ls-track-md)",
      textTransform: "uppercase",
      color: hover ? dark ? "var(--text-on-inverse)" : "var(--text)" : muted,
      transition: "color var(--dur-fast)"
    }
  }, footer) : null);
}

/** Wrap Card variant="tile" children in a hairline grid: 1px gaps painted by the border colour. */
function TileGrid({
  columns = 3,
  minWidth,
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: minWidth ? `repeat(auto-fit, minmax(${minWidth}px, 1fr))` : `repeat(${columns}, minmax(0, 1fr))`,
      gap: 1,
      background: "var(--border)",
      border: "1px solid var(--border)",
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Card, TileGrid });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Card.jsx", error: String((e && e.message) || e) }); }

// components/display/Tag.jsx
try { (() => {
/** Selectable / removable chip (filters, suggested prompts, partner categories). Selected = gold border + gold wash. */
function Tag({
  children,
  selected = false,
  onClick,
  onRemove,
  icon,
  disabled = false,
  size = "md",
  style
}) {
  const [hover, setHover] = React.useState(false);
  const h = size === "sm" ? 28 : 36;
  const clickable = !!onClick && !disabled;
  return /*#__PURE__*/React.createElement("span", {
    onClick: clickable ? onClick : undefined,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    role: onClick ? "button" : undefined,
    "aria-pressed": onClick ? selected : undefined,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      height: h,
      padding: size === "sm" ? "0 10px" : "0 14px",
      boxSizing: "border-box",
      borderRadius: "var(--radius-control)",
      fontFamily: "var(--font-sans)",
      fontSize: size === "sm" ? 12 : 13,
      lineHeight: 1,
      whiteSpace: "nowrap",
      border: `1px solid ${selected ? "var(--accent)" : hover && clickable ? "var(--color-outline)" : "var(--border)"}`,
      background: selected ? "var(--accent-wash)" : "var(--bg)",
      color: selected ? "var(--accent-text)" : "var(--text)",
      cursor: clickable ? "pointer" : "default",
      opacity: disabled ? 0.5 : 1,
      transition: "all var(--dur-fast) var(--ease-standard)",
      ...style
    }
  }, icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 12
  }) : null, children, onRemove ? /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": "Remove",
    onClick: e => {
      e.stopPropagation();
      onRemove();
    },
    style: {
      display: "inline-flex",
      border: 0,
      background: "transparent",
      padding: 0,
      margin: "0 -4px 0 0",
      cursor: "pointer",
      color: "var(--text-muted)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 12
  })) : null);
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Tag.jsx", error: String((e && e.message) || e) }); }

// components/a2a/ChatComposer.jsx
try { (() => {
/**
 * Message input for the chat box: auto-growing textarea + deep-blue send button, hairline top rule.
 * Enter sends, Shift+Enter breaks a line. `suggestions` render as Tag chips above the field (empty-state prompts).
 */
function ChatComposer({
  onSend,
  placeholder = "Type your message...",
  disabled = false,
  loading = false,
  suggestions = [],
  value: controlled,
  onChange,
  style
}) {
  const [inner, setInner] = React.useState("");
  const value = controlled ?? inner;
  const set = v => {
    onChange ? onChange(v) : setInner(v);
  };
  const send = text => {
    const t = (text ?? value).trim();
    if (!t || disabled || loading) return;
    onSend && onSend(t);
    set("");
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: "1px solid var(--border)",
      background: "rgba(255,255,255,0.5)",
      padding: 16,
      display: "flex",
      flexDirection: "column",
      gap: 12,
      fontFamily: "var(--font-sans)",
      boxSizing: "border-box",
      ...style
    }
  }, suggestions.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 8
    }
  }, suggestions.map(s => /*#__PURE__*/React.createElement(__ds_scope.Tag, {
    key: s,
    size: "sm",
    onClick: () => send(s),
    disabled: disabled || loading
  }, s))) : null, /*#__PURE__*/React.createElement("form", {
    onSubmit: e => {
      e.preventDefault();
      send();
    },
    style: {
      display: "flex",
      gap: 8,
      alignItems: "flex-end"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Textarea, {
    rows: 1,
    autoGrow: true,
    maxHeight: 128,
    value: value,
    onChange: e => set(e.target.value),
    placeholder: placeholder,
    disabled: disabled,
    containerStyle: {
      flex: 1
    },
    onKeyDown: e => {
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        send();
      }
    }
  }), /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "send",
    label: "Send",
    variant: "primary",
    loading: loading,
    disabled: !value.trim() || disabled,
    onClick: () => send(),
    style: {
      height: 38,
      width: 38
    }
  })));
}
Object.assign(__ds_scope, { ChatComposer });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/a2a/ChatComposer.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Dialog.jsx
try { (() => {
/** Modal: deep-blue scrim, white panel, 4px radius, hairline border. Escape and scrim click close. */
function Dialog({
  open = false,
  onClose,
  title,
  eyebrow,
  description,
  children,
  actions,
  width = 480,
  closeButton = true,
  style
}) {
  const panel = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    const focusables = () => panel.current ? [...panel.current.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled) : [];
    const first = focusables()[0];
    (first || panel.current) && (first || panel.current).focus();
    const onKey = e => {
      if (e.key === "Escape" && onClose) onClose();
      if (e.key !== "Tab") return;
      const f = focusables();
      if (!f.length) return;
      const a = f[0],
        z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev && prev.focus && prev.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    role: "presentation",
    onClick: onClose,
    style: {
      position: "fixed",
      inset: 0,
      zIndex: 100,
      background: "rgba(10,22,38,0.45)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      animation: "ta-reveal-up var(--dur-fast) var(--ease-standard) both",
      "--reveal-offset": "0px",
      "--reveal-blur": "0px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    ref: panel,
    tabIndex: -1,
    role: "dialog",
    "aria-modal": "true",
    "aria-label": typeof title === "string" ? title : undefined,
    onClick: e => e.stopPropagation(),
    style: {
      width: "100%",
      maxWidth: width,
      background: "var(--bg)",
      color: "var(--text)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-dialog)",
      padding: 32,
      boxSizing: "border-box",
      fontFamily: "var(--font-sans)",
      position: "relative",
      animation: "ta-reveal-up var(--dur-base) var(--ease-standard) both",
      "--reveal-offset": "16px",
      "--reveal-blur": "4px",
      ...style
    }
  }, closeButton ? /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": "Close",
    onClick: onClose,
    style: {
      position: "absolute",
      top: 16,
      right: 16,
      background: "transparent",
      border: 0,
      padding: 6,
      cursor: "pointer",
      color: "var(--text-muted)",
      display: "inline-flex"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 16
  })) : null, eyebrow ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "0 0 12px",
      fontSize: 12,
      letterSpacing: "var(--ls-track-xl)",
      textTransform: "uppercase",
      color: "var(--text-muted)"
    }
  }, eyebrow) : null, title ? /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontSize: 24,
      fontWeight: 500,
      letterSpacing: "-0.02em",
      lineHeight: 1.3
    }
  }, title) : null, description ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "12px 0 0",
      fontSize: 14,
      lineHeight: 1.6,
      color: "var(--text-muted)"
    }
  }, description) : null, children ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 24
    }
  }, children) : null, actions ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "flex-end",
      gap: 8,
      marginTop: 32
    }
  }, actions) : null));
}

/** Two-button confirm built on Dialog. */
function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = "Are you sure?",
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  loading = false
}) {
  return /*#__PURE__*/React.createElement(Dialog, {
    open: open,
    onClose: onClose,
    title: title,
    description: description,
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(__ds_scope.Button, {
      variant: "ghost",
      onClick: onClose
    }, cancelLabel), /*#__PURE__*/React.createElement(__ds_scope.Button, {
      variant: danger ? "danger" : "primary",
      loading: loading,
      onClick: onConfirm
    }, confirmLabel))
  });
}
Object.assign(__ds_scope, { Dialog, ConfirmDialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Dialog.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
const ICONS = {
  info: "info",
  success: "circle-check",
  warning: "circle-alert",
  error: "circle-alert",
  loading: "loader-circle"
};

/** Transient notice: white panel, hairline border, 4px radius, leading glyph (tinted by tone). No coloured side bar. */
function Toast({
  variant = "info",
  title,
  description,
  action,
  onDismiss,
  style
}) {
  const iconColor = {
    info: "var(--text-muted)",
    success: "var(--success)",
    warning: "var(--warning)",
    error: "var(--danger)",
    loading: "var(--text-muted)"
  }[variant];
  return /*#__PURE__*/React.createElement("div", {
    role: "status",
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: 12,
      width: 360,
      maxWidth: "100%",
      padding: "14px 16px",
      boxSizing: "border-box",
      background: "var(--bg)",
      color: "var(--text)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-dialog)",
      boxShadow: "var(--shadow-lift)",
      fontFamily: "var(--font-sans)",
      animation: "ta-reveal-up var(--dur-base) var(--ease-standard) both",
      "--reveal-offset": "12px",
      "--reveal-blur": "2px",
      ...style
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: ICONS[variant] || "info",
    size: 16,
    style: {
      color: iconColor,
      marginTop: 1,
      animation: variant === "loading" ? "ta-spin 1s linear infinite" : "none"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, title ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 500,
      lineHeight: 1.4
    }
  }, title) : null, description ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      lineHeight: 1.5,
      color: "var(--text-muted)",
      marginTop: title ? 2 : 0
    }
  }, description) : null, action ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, action) : null), onDismiss ? /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": "Dismiss",
    onClick: onDismiss,
    style: {
      background: "transparent",
      border: 0,
      padding: 2,
      cursor: "pointer",
      color: "var(--text-subtle)",
      display: "inline-flex"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 14
  })) : null);
}

/** Fixed stack for toasts (bottom-right by default). */
function ToastStack({
  children,
  position = "bottom-right",
  style
}) {
  const pos = {
    "bottom-right": {
      bottom: 24,
      right: 24
    },
    "bottom-left": {
      bottom: 24,
      left: 24
    },
    "top-right": {
      top: 24,
      right: 24
    },
    "top-center": {
      top: 24,
      left: "50%",
      transform: "translateX(-50%)"
    }
  }[position];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      zIndex: 110,
      display: "flex",
      flexDirection: "column",
      gap: 8,
      ...pos,
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Toast, ToastStack });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/navigation/NavBar.jsx
try { (() => {
/**
 * Website header (client/src/components/Navbar.tsx): A2A mark + spaced wordmark, 13px tracked links with a hairline
 * active indicator, and the bordered 11px language toggle. `glass` = scrolled state (white 70% + 20px blur + hairline).
 */
function NavBar({
  logoSrc,
  brand = "TABLE AI",
  items = [],
  activeHref,
  onNavigate,
  lang = "en",
  onToggleLang,
  glass = false,
  fixed = false,
  height = 64,
  maxWidth = 1152,
  right,
  style
}) {
  const [hoverHref, setHoverHref] = React.useState(null);
  const [langHover, setLangHover] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const go = (e, href) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate(href);
    }
    setMenuOpen(false);
  };
  return /*#__PURE__*/React.createElement("header", {
    style: {
      position: fixed ? "fixed" : "sticky",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 50,
      fontFamily: "var(--font-sans)",
      color: "var(--text)",
      background: glass ? "rgba(255,255,255,0.7)" : "transparent",
      backdropFilter: glass ? "blur(20px) saturate(180%)" : "none",
      WebkitBackdropFilter: glass ? "blur(20px) saturate(180%)" : "none",
      borderBottom: `1px solid ${glass ? "var(--border-line)" : "transparent"}`,
      transition: "all var(--dur-slow) var(--ease-standard)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth,
      margin: "0 auto",
      padding: "0 16px",
      height,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "/",
    onClick: e => go(e, "/"),
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      textDecoration: "none",
      color: "inherit"
    }
  }, logoSrc ? /*#__PURE__*/React.createElement("img", {
    src: logoSrc,
    alt: brand,
    style: {
      height: 22,
      width: "auto"
    }
  }) : null, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 500,
      letterSpacing: "0.1em"
    }
  }, brand)), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 4
    },
    className: "ta-nav-links"
  }, items.map(it => {
    const active = it.href === activeHref;
    const hover = hoverHref === it.href;
    return /*#__PURE__*/React.createElement("a", {
      key: it.href,
      href: it.href,
      onClick: e => go(e, it.href),
      onMouseEnter: () => setHoverHref(it.href),
      onMouseLeave: () => setHoverHref(null),
      style: {
        position: "relative",
        padding: "8px 16px",
        fontSize: 13,
        letterSpacing: "0.025em",
        color: active || hover ? "var(--text)" : "var(--text-muted)",
        textDecoration: "none",
        transform: hover ? "translateY(-1px)" : "none",
        transition: "all var(--dur-fast) var(--ease-standard)"
      }
    }, it.label, active ? /*#__PURE__*/React.createElement("span", {
      style: {
        position: "absolute",
        bottom: 0,
        left: 16,
        right: 16,
        height: 1,
        background: "var(--text)"
      }
    }) : null);
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, right, onToggleLang ? /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onToggleLang,
    onMouseEnter: () => setLangHover(true),
    onMouseLeave: () => setLangHover(false),
    "aria-label": "Toggle language",
    style: {
      padding: "6px 12px",
      fontFamily: "inherit",
      fontSize: 11,
      letterSpacing: "var(--ls-track-md)",
      textTransform: "uppercase",
      background: "transparent",
      cursor: "pointer",
      color: langHover ? "var(--text)" : "var(--text-muted)",
      border: `1px solid ${langHover ? "rgba(10,22,38,0.3)" : "rgba(197,198,205,0.6)"}`,
      borderRadius: "var(--radius-control)",
      transition: "all var(--dur-fast) var(--ease-standard)",
      transform: langHover ? "scale(1.05)" : "none"
    }
  }, lang === "zh" ? "EN" : "中") : null, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "ta-nav-menu",
    "aria-label": "Menu",
    onClick: () => setMenuOpen(o => !o),
    style: {
      display: "none",
      background: "transparent",
      border: 0,
      padding: 6,
      cursor: "pointer",
      color: "var(--text)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: menuOpen ? "x" : "menu",
    size: 20
  })))), menuOpen ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      top: height,
      background: "rgba(255,255,255,0.98)",
      backdropFilter: "blur(24px)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 32,
      zIndex: 40
    }
  }, items.map(it => /*#__PURE__*/React.createElement("a", {
    key: it.href,
    href: it.href,
    onClick: e => go(e, it.href),
    style: {
      fontSize: 24,
      fontWeight: 300,
      letterSpacing: "0.025em",
      color: it.href === activeHref ? "var(--text)" : "var(--text-muted)",
      textDecoration: "none"
    }
  }, it.label))) : null, /*#__PURE__*/React.createElement("style", null, `@media (max-width: 767px){ .ta-nav-links{display:none !important} .ta-nav-menu{display:inline-flex !important} }`));
}
Object.assign(__ds_scope, { NavBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/NavBar.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
/** Underline tabs. Inactive = muted 13px tracked text; active = deep-blue text with a 1px Sundial Gold rule. */
function Tabs({
  items = [],
  value,
  onChange,
  size = "md",
  stretch = false,
  style
}) {
  const [hoverKey, setHoverKey] = React.useState(null);
  const refs = React.useRef([]);
  const enabled = items.map((it, i) => it.disabled ? -1 : i).filter(i => i >= 0);
  const onKey = (e, i) => {
    const pos = enabled.indexOf(i);
    let next = null;
    if (e.key === "ArrowRight") next = enabled[(pos + 1) % enabled.length];else if (e.key === "ArrowLeft") next = enabled[(pos - 1 + enabled.length) % enabled.length];else if (e.key === "Home") next = enabled[0];else if (e.key === "End") next = enabled[enabled.length - 1];
    if (next == null) return;
    e.preventDefault();
    const it = items[next];
    refs.current[next] && refs.current[next].focus();
    onChange && onChange(it.value ?? it.label);
  };
  return /*#__PURE__*/React.createElement("div", {
    role: "tablist",
    style: {
      display: "flex",
      gap: stretch ? 0 : 4,
      borderBottom: "1px solid var(--border)",
      fontFamily: "var(--font-sans)",
      ...style
    }
  }, items.map((it, i) => {
    const key = it.value ?? it.label;
    const active = key === value;
    const hover = hoverKey === key;
    return /*#__PURE__*/React.createElement("button", {
      key: key,
      ref: el => refs.current[i] = el,
      role: "tab",
      type: "button",
      "aria-selected": active,
      tabIndex: active ? 0 : -1,
      "aria-controls": it.panelId,
      id: it.tabId,
      onKeyDown: e => onKey(e, i),
      disabled: it.disabled,
      onClick: () => onChange && onChange(key),
      onMouseEnter: () => setHoverKey(key),
      onMouseLeave: () => setHoverKey(null),
      style: {
        flex: stretch ? 1 : undefined,
        position: "relative",
        background: "transparent",
        border: 0,
        padding: size === "sm" ? "10px 12px" : "14px 16px",
        marginBottom: -1,
        cursor: it.disabled ? "not-allowed" : "pointer",
        opacity: it.disabled ? 0.4 : 1,
        fontFamily: "inherit",
        fontSize: size === "sm" ? 12 : 13,
        letterSpacing: "0.05em",
        color: active || hover ? "var(--text)" : "var(--text-muted)",
        borderBottom: `1px solid ${active ? "var(--accent)" : "transparent"}`,
        transition: "color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        whiteSpace: "nowrap"
      }
    }, it.label, it.count != null ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        color: active ? "var(--accent-text)" : "var(--text-subtle)"
      }
    }, it.count) : null);
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// ui_kits/admin/admin.jsx
try { (() => {
const DS = window.TableAIDesignSystem_f48f27;
const {
  Button,
  IconButton,
  Input,
  Select,
  Switch,
  Card,
  Badge,
  Tag,
  Eyebrow,
  Tabs,
  Dialog,
  ConfirmDialog,
  Toast,
  ToastStack,
  Tooltip,
  Icon,
  Skeleton,
  Divider
} = DS;

/* ── Data: cms_content / locations / partners rows (drizzle schema, seeded from server/seed.ts) ── */
const CONTENT = [["hero", "TABLE AI", "TABLE AI", 0, true], ["hero_vision", "核心洞察與企業使命", "Our Vision & Mission", 1, true], ["hero_mission", "我們的使命", "Our Mission", 2, true], ["home_stats", "首頁統計", "Home Stats", 3, true], ["aha_architecture", "底層協作架構：AHA 體系", "The AHA Architecture", 5, true], ["business_overview", "商業部署矩陣", "Business Deployment Matrix", 10, true], ["protocol", "第一個「1」：跨越「信任」臨界點", "The First '1': Crossing the Trust Threshold", 20, true], ["protocol_aha_visual", "AHA 體系 —— 智能體-人-資產", "AHA Architecture — Agent-Human-Assets", 21, true], ["network", "第二個「1」：跨越「體驗」臨界點", "The Second '1': Crossing the Experience Threshold", 30, true], ["network_hubs", "全球布局", "Global Presence", 31, true], ["showroom_overview", "乘數「X」：引領範式轉移", "The Multiplier 'X': Leading Paradigm Shift", 40, true], ["showroom_x1", "合規商旅與供應鏈管家", "Compliant Business Travel & Supply Chain Steward", 41, true], ["showroom_x2", "空間資產智能化調度平台", "Intelligent Space Asset Scheduling Platform", 42, true], ["showroom_x3", "高端服務與科研成果轉化系統", "Premium Services & Research Commercialization System", 43, false], ["about", "關於 TABLE AI", "About TABLE AI", 50, true], ["footer", "TABLE AI", "TABLE AI", 100, true]].map(([key, zh, en, sort, pub]) => ({
  key,
  zh,
  en,
  sort,
  pub
}));
const LOCATIONS = [["TABLE AI HQ", "Hong Kong", "Greater China", 22.3193, 114.1694], ["London Node", "London", "Europe", 51.5074, -0.1278], ["Basel Node", "Basel", "Europe", 47.5596, 7.5886], ["North America Node", "New York", "North America", 40.7128, -74.006], ["Beijing Node", "Beijing", "Greater China", 39.9042, 116.4074], ["Shanghai Node", "Shanghai", "Greater China", 31.2304, 121.4737], ["Shenzhen Node", "Shenzhen", "Greater China", 22.5431, 114.0579]].map(([name, city, region, lat, lng]) => ({
  name,
  city,
  region,
  lat,
  lng
}));
const PARTNERS = [["Boyuai Education", "education"], ["Lanma Technology", "technology"], ["Beijing Chaoyang Hospital", "medical"], ["OPC Global", "alliance"], ["Nibiru (RealMax)", "technology"], ["World Canal Cities Canal Walk", "culture"], ["CIT Group", "tourism"], ["Asian Institute of Art Therapy", "research"]].map(([name, cat], i) => ({
  name,
  cat,
  active: i !== 6,
  url: "https://"
}));
const NAV = [["layout-dashboard", "Dashboard", "dashboard"], ["file-text", "Content", "content"], ["map-pin", "Locations", "locations"], ["handshake", "Partners", "partners"], ["users", "Users", "users"], ["settings", "Settings", "settings"]];

/* ── Layout (AdminLayout.tsx): 256px sidebar, hairline right border, surface tint ── */
function Sidebar({
  page,
  go
}) {
  return /*#__PURE__*/React.createElement("aside", {
    className: "sb"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sb-head"
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      go("dashboard");
    },
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      textDecoration: "none",
      color: "inherit"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "sb-mark"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "shield",
    size: 18
  })), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      fontSize: 14,
      fontWeight: 600,
      letterSpacing: ".1em"
    }
  }, "TABLE AI"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      fontSize: 10,
      color: "var(--text-muted)",
      letterSpacing: ".1em",
      textTransform: "uppercase"
    }
  }, "Admin Panel")))), /*#__PURE__*/React.createElement("nav", {
    className: "sb-nav"
  }, NAV.map(([icon, label, key]) => /*#__PURE__*/React.createElement("a", {
    key: key,
    href: "#",
    onClick: e => {
      e.preventDefault();
      go(key);
    },
    className: "sb-item" + (page === key ? " on" : "")
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 16
  }), label))), /*#__PURE__*/React.createElement("div", {
    className: "sb-foot"
  }, /*#__PURE__*/React.createElement("a", {
    href: "../website/index.html",
    className: "sb-item",
    style: {
      padding: "8px 12px"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "external-link",
    size: 16
  }), "View Website"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "8px 12px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "avatar"
  }, "A"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      fontSize: 14,
      fontWeight: 500
    }
  }, "Admin"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      fontSize: 12,
      color: "var(--text-muted)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, "admin@tableai.ai")), /*#__PURE__*/React.createElement(Tooltip, {
    content: "Sign out",
    side: "left"
  }, /*#__PURE__*/React.createElement(IconButton, {
    icon: "log-out",
    label: "Sign out",
    size: "sm",
    onClick: () => go("login")
  })))));
}
function PageTitle({
  title,
  sub,
  right
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: 16,
      flexWrap: "wrap",
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontSize: 24,
      fontWeight: 600,
      letterSpacing: "-.02em"
    }
  }, title), sub ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "4px 0 0",
      fontSize: 14,
      color: "var(--text-muted)"
    }
  }, sub) : null), right);
}

/* ── Dashboard (AdminDashboard.tsx) ── */
function Dashboard({
  go,
  toast
}) {
  const [seeding, setSeeding] = React.useState(false);
  const tiles = [["Content Management", "CMS", "Manage bilingual website content", "file-text", "content"], ["User Management", "Users", "Manage users and roles", "users", "users"], ["Settings", "Account", "Password and preferences", "settings", "settings"]];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageTitle, {
    title: "Dashboard",
    sub: "Welcome back, Admin"
  }), /*#__PURE__*/React.createElement("div", {
    className: "grid-3"
  }, tiles.map(([label, big, desc, icon, key]) => /*#__PURE__*/React.createElement(Card, {
    key: key,
    interactive: true,
    padding: 24,
    onClick: () => go(key)
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 500,
      color: "var(--text-muted)"
    }
  }, label), /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 600
    }
  }, big), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--text-muted)",
      marginTop: 4
    }
  }, desc)))), /*#__PURE__*/React.createElement(Card, {
    variant: "dashed",
    padding: 24,
    style: {
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "database",
    size: 20,
    style: {
      color: "var(--text-muted)"
    }
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 500
    }
  }, "Initialize Content"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: "var(--text-muted)"
    }
  }, "Seed the database with default TABLE AI content"))), /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    size: "sm",
    loading: seeding,
    onClick: () => {
      setSeeding(true);
      setTimeout(() => {
        setSeeding(false);
        toast("success", "Content seeded", `${CONTENT.length} sections · 7 locations · 8 partners`);
      }, 1400);
    }
  }, "Seed Content"))), /*#__PURE__*/React.createElement("div", {
    className: "grid-3",
    style: {
      marginTop: 16
    }
  }, [["Sections", CONTENT.length, `${CONTENT.filter(c => c.pub).length} published`], ["Locations", LOCATIONS.length, "7 nodes on the map"], ["Partners", PARTNERS.length, `${PARTNERS.filter(p => p.active).length} active`]].map(([l, n, d]) => /*#__PURE__*/React.createElement("div", {
    key: l,
    style: {
      padding: "16px 0",
      borderTop: "1px solid var(--border)"
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, {
    style: {
      letterSpacing: "var(--ls-track-md)"
    }
  }, l), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 32,
      fontWeight: 300,
      letterSpacing: "-.03em",
      margin: "8px 0 4px"
    }
  }, n), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--text-muted)"
    }
  }, d)))));
}

/* ── Content (cms_content): bilingual rows, publish toggle, edit dialog ── */
function ContentPage({
  toast
}) {
  const [rows, setRows] = React.useState(CONTENT);
  const [q, setQ] = React.useState("");
  const [tab, setTab] = React.useState("all");
  const [edit, setEdit] = React.useState(null);
  const [del, setDel] = React.useState(null);
  const [lang, setLang] = React.useState("zh");
  const shown = rows.filter(r => (tab === "all" || (tab === "pub" ? r.pub : !r.pub)) && (r.key + r.zh + r.en).toLowerCase().includes(q.toLowerCase()));
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageTitle, {
    title: "Content",
    sub: "Bilingual sections rendered by the public website",
    right: /*#__PURE__*/React.createElement(Button, {
      icon: "plus",
      onClick: () => setEdit({
        key: "",
        zh: "",
        en: "",
        sort: rows.length,
        pub: false,
        isNew: true
      })
    }, "New section")
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 16,
      alignItems: "flex-end",
      justifyContent: "space-between",
      flexWrap: "wrap",
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement(Tabs, {
    items: [{
      label: "All",
      value: "all",
      count: rows.length
    }, {
      label: "Published",
      value: "pub",
      count: rows.filter(r => r.pub).length
    }, {
      label: "Drafts",
      value: "draft",
      count: rows.filter(r => !r.pub).length
    }],
    value: tab,
    onChange: setTab,
    size: "sm",
    style: {
      borderBottom: 0
    }
  }), /*#__PURE__*/React.createElement(Input, {
    icon: "search",
    placeholder: "Search sections",
    size: "sm",
    value: q,
    onChange: e => setQ(e.target.value),
    containerStyle: {
      width: 240
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "table"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tr th"
  }, /*#__PURE__*/React.createElement("span", null, "Section key"), /*#__PURE__*/React.createElement("span", null, "Title \u4E2D\u6587"), /*#__PURE__*/React.createElement("span", null, "Title EN"), /*#__PURE__*/React.createElement("span", null, "Order"), /*#__PURE__*/React.createElement("span", null, "Published"), /*#__PURE__*/React.createElement("span", null)), shown.map(r => /*#__PURE__*/React.createElement("div", {
    key: r.key,
    className: "tr"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(Badge, {
    variant: "strong",
    style: {
      fontFamily: "var(--font-mono)",
      textTransform: "none",
      letterSpacing: 0
    }
  }, r.key)), /*#__PURE__*/React.createElement("span", {
    className: "cell"
  }, r.zh), /*#__PURE__*/React.createElement("span", {
    className: "cell"
  }, r.en), /*#__PURE__*/React.createElement("span", {
    style: {
      fontVariantNumeric: "tabular-nums",
      color: "var(--text-muted)"
    }
  }, r.sort), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(Switch, {
    size: "sm",
    checked: r.pub,
    onChange: v => {
      setRows(rs => rs.map(x => x.key === r.key ? {
        ...x,
        pub: v
      } : x));
      toast("success", v ? "Published" : "Unpublished", r.key);
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      gap: 4,
      justifyContent: "flex-end"
    }
  }, /*#__PURE__*/React.createElement(IconButton, {
    icon: "pencil",
    label: "Edit",
    size: "sm",
    onClick: () => setEdit({
      ...r
    })
  }), /*#__PURE__*/React.createElement(IconButton, {
    icon: "trash",
    label: "Delete",
    size: "sm",
    onClick: () => setDel(r)
  })))), !shown.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 40,
      textAlign: "center",
      fontSize: 14,
      color: "var(--text-muted)"
    }
  }, "No sections match.") : null), /*#__PURE__*/React.createElement(Dialog, {
    open: !!edit,
    onClose: () => setEdit(null),
    eyebrow: edit?.isNew ? "New section" : edit?.key,
    title: edit?.isNew ? "Create section" : "Edit section",
    width: 560,
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      onClick: () => setEdit(null)
    }, "Cancel"), /*#__PURE__*/React.createElement(Button, {
      onClick: () => {
        setRows(rs => edit.isNew ? [...rs, edit] : rs.map(x => x.key === edit.key ? edit : x));
        toast("success", "Saved", edit.key || "section");
        setEdit(null);
      }
    }, "Save"))
  }, edit ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "Section key",
    value: edit.key,
    disabled: !edit.isNew,
    onChange: e => setEdit({
      ...edit,
      key: e.target.value
    }),
    placeholder: "e.g. home_cta",
    hint: "Referenced by the website as c(key, field)"
  }), /*#__PURE__*/React.createElement(Tabs, {
    items: [{
      label: "中文",
      value: "zh"
    }, {
      label: "English",
      value: "en"
    }],
    value: lang,
    onChange: setLang,
    size: "sm"
  }), /*#__PURE__*/React.createElement(Input, {
    label: `Title (${lang.toUpperCase()})`,
    value: edit[lang],
    onChange: e => setEdit({
      ...edit,
      [lang]: e.target.value
    })
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 16,
      alignItems: "end"
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "Sort order",
    type: "number",
    value: edit.sort,
    onChange: e => setEdit({
      ...edit,
      sort: Number(e.target.value)
    })
  }), /*#__PURE__*/React.createElement(Switch, {
    checked: edit.pub,
    onChange: v => setEdit({
      ...edit,
      pub: v
    }),
    label: "Published"
  }))) : null), /*#__PURE__*/React.createElement(ConfirmDialog, {
    open: !!del,
    danger: true,
    title: "Delete section?",
    description: del ? `「${del.key}」 will disappear from the website immediately.` : "",
    confirmLabel: "Delete",
    onClose: () => setDel(null),
    onConfirm: () => {
      setRows(rs => rs.filter(x => x.key !== del.key));
      toast("info", "Deleted", del.key);
      setDel(null);
    }
  }));
}

/* ── Locations & Partners (AdminLocations / AdminPartners): list + status ── */
function LocationsPage({
  toast
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageTitle, {
    title: "Locations",
    sub: "Nodes plotted on the Global Partner Network map",
    right: /*#__PURE__*/React.createElement(Button, {
      icon: "plus",
      variant: "outline"
    }, "Add node")
  }), /*#__PURE__*/React.createElement("div", {
    className: "table"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tr th loc"
  }, /*#__PURE__*/React.createElement("span", null, "Name"), /*#__PURE__*/React.createElement("span", null, "City"), /*#__PURE__*/React.createElement("span", null, "Region"), /*#__PURE__*/React.createElement("span", null, "Latitude"), /*#__PURE__*/React.createElement("span", null, "Longitude"), /*#__PURE__*/React.createElement("span", null)), LOCATIONS.map(l => /*#__PURE__*/React.createElement("div", {
    key: l.name,
    className: "tr loc"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 500
    }
  }, l.name), /*#__PURE__*/React.createElement("span", null, l.city), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(Badge, null, l.region)), /*#__PURE__*/React.createElement("span", {
    className: "num"
  }, l.lat.toFixed(4)), /*#__PURE__*/React.createElement("span", {
    className: "num"
  }, l.lng.toFixed(4)), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      gap: 4,
      justifyContent: "flex-end"
    }
  }, /*#__PURE__*/React.createElement(IconButton, {
    icon: "pencil",
    label: "Edit",
    size: "sm"
  }), /*#__PURE__*/React.createElement(IconButton, {
    icon: "trash",
    label: "Delete",
    size: "sm",
    onClick: () => toast("error", "Cannot delete HQ", "Hong Kong is the primary node.")
  }))))));
}
function PartnersPage({
  toast
}) {
  const [rows, setRows] = React.useState(PARTNERS);
  const [filter, setFilter] = React.useState(null);
  const cats = [...new Set(PARTNERS.map(p => p.cat))];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageTitle, {
    title: "Partners",
    sub: "Shown on the homepage grid and the About page list",
    right: /*#__PURE__*/React.createElement(Button, {
      icon: "plus",
      variant: "outline"
    }, "Add partner")
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
      marginBottom: 16
    }
  }, cats.map(c => /*#__PURE__*/React.createElement(Tag, {
    key: c,
    size: "sm",
    selected: filter === c,
    onClick: () => setFilter(filter === c ? null : c)
  }, c))), /*#__PURE__*/React.createElement("div", {
    className: "table"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tr th par"
  }, /*#__PURE__*/React.createElement("span", null, "#"), /*#__PURE__*/React.createElement("span", null, "Partner"), /*#__PURE__*/React.createElement("span", null, "Category"), /*#__PURE__*/React.createElement("span", null, "Website"), /*#__PURE__*/React.createElement("span", null, "Active"), /*#__PURE__*/React.createElement("span", null)), rows.filter(p => !filter || p.cat === filter).map((p, i) => /*#__PURE__*/React.createElement("div", {
    key: p.name,
    className: "tr par"
  }, /*#__PURE__*/React.createElement("span", {
    className: "num"
  }, String(i + 1).padStart(2, "0")), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "initial"
  }, p.name[0]), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 500
    }
  }, p.name)), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(Badge, null, p.cat)), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-muted)",
      fontSize: 13
    }
  }, p.url, "\u2026"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(Switch, {
    size: "sm",
    checked: p.active,
    onChange: v => {
      setRows(rs => rs.map(x => x.name === p.name ? {
        ...x,
        active: v
      } : x));
      toast("success", v ? "Partner activated" : "Partner hidden", p.name);
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      gap: 4,
      justifyContent: "flex-end"
    }
  }, /*#__PURE__*/React.createElement(IconButton, {
    icon: "pencil",
    label: "Edit",
    size: "sm"
  }), /*#__PURE__*/React.createElement(IconButton, {
    icon: "external-link",
    label: "Open site",
    size: "sm"
  }))))));
}
function Placeholder({
  title
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageTitle, {
    title: title
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12,
      maxWidth: 560
    }
  }, /*#__PURE__*/React.createElement(Skeleton, {
    width: 220,
    height: 28
  }), /*#__PURE__*/React.createElement(Skeleton, {
    lines: 3
  }), /*#__PURE__*/React.createElement(Divider, {
    spacing: 8
  }), /*#__PURE__*/React.createElement(Skeleton, {
    lines: 2
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: "var(--text-subtle)",
      marginTop: 24
    }
  }, "Not recreated \u2014 Admin", title, ".tsx was not read from the source repository. Deep-blue skeleton per design.md \xA74."));
}
window.PageTitle = PageTitle;
function AdminApp() {
  const [page, setPage] = React.useState(() => location.hash.replace("#", "") || "dashboard");
  const [toasts, setToasts] = React.useState([]);
  const go = p => {
    setPage(p);
    location.hash = p;
  };
  const toast = (variant, title, description) => {
    const id = Date.now();
    setToasts(t => [...t, {
      id,
      variant,
      title,
      description
    }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
  };
  const Page = {
    dashboard: Dashboard,
    content: ContentPage,
    locations: LocationsPage,
    partners: PartnersPage,
    users: window.UsersPage,
    settings: window.SettingsPage
  }[page];
  if (page === "login") return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(window.LoginPage, {
    go: go,
    toast: toast
  }), /*#__PURE__*/React.createElement(ToastStack, null, toasts.map(t => /*#__PURE__*/React.createElement(Toast, {
    key: t.id,
    variant: t.variant,
    title: t.title,
    onDismiss: () => setToasts(ts => ts.filter(x => x.id !== t.id))
  }))));
  return /*#__PURE__*/React.createElement("div", {
    className: "admin"
  }, /*#__PURE__*/React.createElement(Sidebar, {
    page: page,
    go: go
  }), /*#__PURE__*/React.createElement("main", {
    className: "main"
  }, /*#__PURE__*/React.createElement("div", {
    className: "main-inner"
  }, Page ? /*#__PURE__*/React.createElement(Page, {
    go: go,
    toast: toast
  }) : /*#__PURE__*/React.createElement(Placeholder, {
    title: page[0].toUpperCase() + page.slice(1)
  }))), /*#__PURE__*/React.createElement(ToastStack, null, toasts.map(t => /*#__PURE__*/React.createElement(Toast, {
    key: t.id,
    variant: t.variant,
    title: t.title,
    description: t.description,
    onDismiss: () => setToasts(ts => ts.filter(x => x.id !== t.id))
  }))));
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(AdminApp, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/admin/admin.jsx", error: String((e && e.message) || e) }); }

// ui_kits/admin/screens.jsx
try { (() => {
const {
  Button: AButton,
  Input: AInput,
  Card: ACard,
  Badge: ABadge,
  Icon: AIcon,
  DataTable: ADataTable,
  IconButton: AIconButton
} = window.TableAIDesignSystem_f48f27;

/* Users (AdminUsers.tsx) — columns, provider badges, role, status, row actions */
const USERS = [{
  id: 1,
  name: "Admin",
  email: "admin@tableai.ai",
  provider: "local",
  role: "admin",
  disabled: false,
  last: "2026-10-05",
  me: true
}, {
  id: 2,
  name: "Editor",
  email: "editor@tableai.ai",
  provider: "logto",
  role: "user",
  disabled: false,
  last: "2026-10-03"
}, {
  id: 3,
  name: "Reviewer",
  email: "review@tableai.ai",
  provider: "manus",
  role: "user",
  disabled: true,
  last: "2026-09-21"
}];
const PROVIDER = {
  logto: ["globe", "Logto SSO"],
  local: ["lock", "Local"],
  manus: ["shield", "Manus OAuth"]
};
function UsersPage({
  toast
}) {
  const [rows, setRows] = React.useState(USERS);
  const [menu, setMenu] = React.useState(null);
  const act = (u, kind) => {
    setMenu(null);
    if (kind === "role") {
      setRows(rs => rs.map(r => r.id === u.id ? {
        ...r,
        role: r.role === "admin" ? "user" : "admin"
      } : r));
      toast("success", "Role updated");
    }
    if (kind === "disable") {
      setRows(rs => rs.map(r => r.id === u.id ? {
        ...r,
        disabled: !r.disabled
      } : r));
      toast("success", "User status updated");
    }
    if (kind === "delete") {
      setRows(rs => rs.filter(r => r.id !== u.id));
      toast("info", "User scheduled for deletion (7 days)");
    }
  };
  const cols = [{
    key: "id",
    label: "#",
    muted: true,
    width: 40
  }, {
    key: "name",
    label: "Name",
    render: u => /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 28,
        height: 28,
        borderRadius: "50%",
        border: "1px solid var(--border)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        color: "var(--text-muted)"
      }
    }, u.name[0]), /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 500
      }
    }, u.name), u.me ? /*#__PURE__*/React.createElement(ABadge, null, "You") : null)
  }, {
    key: "email",
    label: "Email",
    muted: true
  }, {
    key: "provider",
    label: "Auth Source",
    render: u => /*#__PURE__*/React.createElement(ABadge, {
      icon: PROVIDER[u.provider][0]
    }, PROVIDER[u.provider][1])
  }, {
    key: "role",
    label: "Role",
    render: u => /*#__PURE__*/React.createElement(ABadge, {
      variant: u.role === "admin" ? "inverse" : "neutral"
    }, u.role)
  }, {
    key: "status",
    label: "Status",
    render: u => u.disabled ? /*#__PURE__*/React.createElement(ABadge, {
      variant: "error"
    }, "Disabled") : /*#__PURE__*/React.createElement(ABadge, {
      variant: "success",
      dot: true
    }, "Active")
  }, {
    key: "last",
    label: "Last Sign In",
    muted: true,
    numeric: true
  }, {
    key: "act",
    label: "",
    width: 40,
    render: u => u.me ? null : /*#__PURE__*/React.createElement("span", {
      style: {
        position: "relative",
        display: "inline-block"
      }
    }, /*#__PURE__*/React.createElement(AIconButton, {
      icon: "settings",
      label: "Actions",
      size: "sm",
      onClick: () => setMenu(menu === u.id ? null : u.id)
    }), menu === u.id ? /*#__PURE__*/React.createElement("span", {
      role: "menu",
      style: {
        position: "absolute",
        right: 0,
        top: "calc(100% + 4px)",
        zIndex: 5,
        minWidth: 200,
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        boxShadow: "var(--shadow-lift)",
        padding: 4,
        display: "flex",
        flexDirection: "column"
      }
    }, /*#__PURE__*/React.createElement(AButton, {
      variant: "ghost",
      size: "sm",
      icon: "user",
      style: {
        justifyContent: "flex-start"
      },
      onClick: () => act(u, "role")
    }, u.role === "admin" ? "Demote to User" : "Promote to Admin"), /*#__PURE__*/React.createElement(AButton, {
      variant: "ghost",
      size: "sm",
      icon: u.disabled ? "circle-check" : "x",
      style: {
        justifyContent: "flex-start"
      },
      onClick: () => act(u, "disable")
    }, u.disabled ? "Enable Account" : "Disable Account"), /*#__PURE__*/React.createElement(AButton, {
      variant: "ghost",
      size: "sm",
      icon: "trash",
      style: {
        justifyContent: "flex-start",
        color: "var(--danger)"
      },
      onClick: () => act(u, "delete")
    }, "Delete (7-day retention)")) : null)
  }];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageTitle, {
    title: "User Management",
    sub: "Manage users, roles, and authentication sources"
  }), /*#__PURE__*/React.createElement(ADataTable, {
    variant: "compact",
    columns: cols,
    rows: rows,
    emptyText: "No users found"
  }));
}

/* Settings (AdminSettings.tsx) — profile facts + change password */
function SettingsPage({
  toast
}) {
  const [pw, setPw] = React.useState({
    cur: "",
    next: "",
    conf: ""
  });
  const [busy, setBusy] = React.useState(false);
  const submit = e => {
    e.preventDefault();
    if (pw.next !== pw.conf) return toast("error", "Passwords do not match");
    if (pw.next.length < 6) return toast("error", "Password must be at least 6 characters");
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      setPw({
        cur: "",
        next: "",
        conf: ""
      });
      toast("success", "Password changed successfully");
    }, 700);
  };
  const fact = (k, v) => /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      letterSpacing: "var(--ls-track-md)",
      textTransform: "uppercase",
      color: "var(--text-muted)",
      marginBottom: 6
    }
  }, k), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 500
    }
  }, v));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 672
    }
  }, /*#__PURE__*/React.createElement(PageTitle, {
    title: "Settings",
    sub: "Account settings and preferences"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(ACard, {
    padding: 24
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: "0 0 20px",
      fontSize: 16,
      fontWeight: 600,
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(AIcon, {
    name: "user",
    size: 16,
    style: {
      color: "var(--text-muted)"
    }
  }), "Profile"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 20
    }
  }, fact("Name", "Admin"), fact("Email", "admin@tableai.ai"), fact("Role", /*#__PURE__*/React.createElement(ABadge, {
    variant: "inverse"
  }, "admin")), fact("Auth Provider", /*#__PURE__*/React.createElement(ABadge, {
    icon: "lock"
  }, "Local")))), /*#__PURE__*/React.createElement(ACard, {
    padding: 24
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: "0 0 4px",
      fontSize: 16,
      fontWeight: 600,
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(AIcon, {
    name: "lock",
    size: 16,
    style: {
      color: "var(--text-muted)"
    }
  }), "Change Password"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "0 0 20px",
      fontSize: 13,
      color: "var(--text-muted)"
    }
  }, "Update your local account password"), /*#__PURE__*/React.createElement("form", {
    onSubmit: submit,
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(AInput, {
    label: "Current Password",
    type: "password",
    value: pw.cur,
    onChange: e => setPw({
      ...pw,
      cur: e.target.value
    }),
    placeholder: "Enter current password (leave empty if none)"
  }), /*#__PURE__*/React.createElement(AInput, {
    label: "New Password",
    type: "password",
    required: true,
    value: pw.next,
    onChange: e => setPw({
      ...pw,
      next: e.target.value
    })
  }), /*#__PURE__*/React.createElement(AInput, {
    label: "Confirm New Password",
    type: "password",
    required: true,
    value: pw.conf,
    onChange: e => setPw({
      ...pw,
      conf: e.target.value
    })
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(AButton, {
    type: "submit",
    size: "sm",
    icon: "lock",
    loading: busy
  }, "Update Password"))))));
}

/* Login (AdminLogin.tsx) — SSO first, collapsible local admin login */
function LoginPage({
  go,
  toast
}) {
  const [local, setLocal] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const signIn = e => {
    e.preventDefault();
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      toast("success", "Login successful");
      go("dashboard");
    }, 700);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
      background: "var(--bg-surface)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: "100%",
      maxWidth: 448,
      display: "flex",
      flexDirection: "column",
      gap: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo/tableai-a2a-mark.svg",
    alt: "",
    style: {
      height: 48,
      marginBottom: 8
    }
  }), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontSize: 20,
      fontWeight: 500,
      letterSpacing: "var(--ls-wordmark)"
    }
  }, "TABLE AI"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 13,
      color: "var(--text-muted)"
    }
  }, "Admin Dashboard")), /*#__PURE__*/React.createElement(ACard, {
    padding: 24
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: "0 0 4px",
      fontSize: 18,
      fontWeight: 600
    }
  }, "Enterprise Sign In"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "0 0 20px",
      fontSize: 13,
      color: "var(--text-muted)"
    }
  }, "Sign in with your enterprise account via SSO"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(AButton, {
    block: true,
    size: "lg",
    icon: "log-out",
    style: {
      height: 48
    },
    onClick: () => go("dashboard")
  }, "Continue with Manus SSO"), /*#__PURE__*/React.createElement(AButton, {
    block: true,
    size: "lg",
    variant: "outline",
    icon: "globe",
    style: {
      height: 48
    },
    onClick: () => go("dashboard")
  }, "Continue with Logto SSO"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setLocal(!local),
    "aria-expanded": local,
    style: {
      all: "unset",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      padding: "8px 0",
      fontSize: 13,
      color: "var(--text-muted)"
    }
  }, /*#__PURE__*/React.createElement(AIcon, {
    name: "chevron-down",
    size: 16,
    style: {
      transform: local ? "rotate(180deg)" : "none",
      transition: "transform var(--dur-fast) var(--ease-standard)"
    }
  }), "Admin Login (Local Account)"), local ? /*#__PURE__*/React.createElement(ACard, {
    padding: 24
  }, /*#__PURE__*/React.createElement("form", {
    onSubmit: signIn,
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(AInput, {
    label: "Email",
    type: "email",
    placeholder: "admin@tableai.ai",
    required: true
  }), /*#__PURE__*/React.createElement(AInput, {
    label: "Password",
    type: "password",
    placeholder: "Enter password",
    required: true
  }), /*#__PURE__*/React.createElement(AButton, {
    type: "submit",
    block: true,
    variant: "outline",
    icon: "shield",
    loading: busy
  }, "Sign In as Admin"))) : null), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      textAlign: "center",
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "../website/index.html",
    style: {
      color: "var(--text-muted)"
    }
  }, "\u2190 Back to website"))));
}
Object.assign(window, {
  UsersPage,
  SettingsPage,
  LoginPage
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/admin/screens.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/app.jsx
try { (() => {
const {
  NavBar
} = window.TableAIDesignSystem_f48f27;
const PAGES = {
  "/": HomePage,
  "/studio": StudioPage,
  "/protocol": ProtocolPage,
  "/network": NetworkPage,
  "/business": LabsPage,
  "/about": AboutPage
};
function App() {
  const [path, setPath] = React.useState(() => {
    const h = location.hash.replace(/^#/, "");
    return PAGES[h] ? h : "/";
  });
  const [lang, setLang] = React.useState(() => localStorage.getItem("tableai-kit-lang") === "zh" ? "zh" : "en");
  const [scrolled, setScrolled] = React.useState(false);
  const go = React.useCallback(p => {
    const next = PAGES[p] ? p : "/";
    setPath(next);
    location.hash = next === "/" ? "" : next;
    window.scrollTo({
      top: 0
    });
  }, []);
  React.useEffect(() => {
    const onHash = () => {
      const h = location.hash.replace(/^#/, "") || "/";
      if (PAGES[h]) setPath(h);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener("scroll", onScroll, {
      passive: true
    });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  React.useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-Hant-HK" : "en";
    localStorage.setItem("tableai-kit-lang", lang);
  }, [lang]);
  const Page = PAGES[path] || HomePage;
  const items = SITE.nav.map(n => ({
    href: n.href,
    label: lang === "zh" ? n.label.zh : n.label.en
  }));
  return /*#__PURE__*/React.createElement(LangProvider, {
    lang: lang
  }, /*#__PURE__*/React.createElement(RouteContext.Provider, {
    value: {
      path,
      go
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "progress",
    style: {
      transform: `scaleX(${useProgress()})`
    },
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement(NavBar, {
    fixed: true,
    glass: scrolled,
    height: 80,
    logoSrc: "../../assets/logo/tableai-a2a-mark.svg",
    items: items,
    activeHref: path,
    onNavigate: go,
    lang: lang,
    onToggleLang: () => setLang(l => l === "zh" ? "en" : "zh")
  }), /*#__PURE__*/React.createElement("main", {
    key: path,
    className: "page"
  }, /*#__PURE__*/React.createElement(Page, null))));
}
function useProgress() {
  const [p, setP] = React.useState(0);
  React.useEffect(() => {
    const f = () => {
      const h = document.documentElement.scrollHeight - innerHeight;
      setP(h > 0 ? scrollY / h : 0);
    };
    f();
    addEventListener("scroll", f, {
      passive: true
    });
    addEventListener("resize", f);
    return () => {
      removeEventListener("scroll", f);
      removeEventListener("resize", f);
    };
  }, []);
  return p;
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/app.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/content.jsx
try { (() => {
// TABLE AI website copy — verbatim from server/seed.ts (ksamint/table-ai-website). Every string is {zh, en}.
const B = (zh, en) => ({
  zh,
  en
});
const SITE = {
  nav: [{
    href: "/studio",
    label: B("工作室", "Studio")
  }, {
    href: "/protocol",
    label: B("協議", "Protocol")
  }, {
    href: "/network",
    label: B("網絡", "Network")
  }, {
    href: "/business",
    label: B("AI實驗室", "AI Labs")
  }, {
    href: "/about",
    label: B("關於", "About")
  }],
  hero: {
    eyebrow: B("全球協同基礎設施", "Global Collaborative Infrastructure"),
    title: B("TABLE AI", "TABLE AI"),
    subtitle: B("跨越智能與實體經濟邊界的全球協同基礎設施", "Global Collaborative Infrastructure Bridging Intelligence and the Real Economy"),
    tagline: B("跨越信任與體驗的鴻溝", "Bridging the Trust and Experience Divide"),
    insight: B("在全球企業加速擁抱大模型技術的當下，TABLE AI 洞察到：AI 智能體向核心業務線滲透的最大瓶頸，已不再是算力或模型參數，而是「人與數據」的交匯摩擦。", "As global enterprises accelerate their adoption of large model technologies, TABLE AI has identified a critical insight: the greatest bottleneck for AI agents penetrating core business lines is no longer computing power or model parameters, but the friction at the intersection of people and data."),
    cta1: B("探索 AHA 架構", "Explore AHA Architecture"),
    cta2: B("了解更多", "Learn More")
  },
  stats: [{
    value: 3,
    suffix: "",
    label: B("專家 AI 產品", "Expert-AI Products")
  }, {
    value: 8,
    suffix: "+",
    label: B("侍天簽約餐飲品牌", "Tiansight Signed Restaurant Brands"),
    accent: true
  }, {
    value: 7,
    suffix: "",
    label: B("天交付經營診斷報告", "Days to a Diagnostic Report")
  }, {
    value: 7,
    suffix: "+",
    label: B("全球樞紐節點", "Global Hub Nodes")
  }],
  insight: {
    eyebrow: B("核心洞察與企業使命", "Our Vision & Mission")
  },
  thresholds: [{
    label: B("臨界點 01", "Threshold 01"),
    title: B("信任臨界點", "Trust Threshold"),
    desc: B("缺乏零信任的數據流轉與財務清算機制，企業不敢開放核心場景，多方協作的利益分配無法達成共識。", "Without zero-trust data circulation and financial settlement mechanisms, enterprises dare not open core scenarios, and consensus on multi-party interest distribution remains elusive.")
  }, {
    label: B("臨界點 02", "Threshold 02"),
    title: B("體驗臨界點", "Experience Threshold"),
    desc: B("在極高複雜度和零容錯率的商業博弈中，純粹的算法存在物理盲區，無法獨立交付具備專業深度與責任兜底的極致體驗。", "In high-complexity, zero-tolerance business dynamics, pure algorithms have physical blind spots and cannot independently deliver the ultimate experience with professional depth and accountability.")
  }],
  aha: {
    eyebrow: B("底層協作架構：AHA 體系", "The AHA Architecture"),
    title: B("AHA 體系", "The AHA Architecture"),
    subtitle: B("Agent-Human-Assets 智能體-人-資產 混合協作底層架構", "Agent-Human-Assets Hybrid Collaboration Architecture"),
    content: B("為解決產業痛點，TABLE AI 自主研發了 AHA（Agent-Human-Assets，智能體-人-資產）混合協作底層架構。作為智能經濟的「協議層」，AHA 架構原生打通了機器算力、人類智力與物理資產的交互鏈路。它將複雜的現實商業系統轉化為可計算、可追溯、絕對可信的代碼逻輯，為 AI 在真實世界的大規模部署提供了不可或缺的技術基石。", "To solve industry pain points, TABLE AI has independently developed the AHA (Agent-Human-Assets) hybrid collaboration architecture. As the 'protocol layer' of the intelligent economy, the AHA architecture natively connects the interaction chains of machine computing power, human intelligence, and physical assets. It transforms complex real-world business systems into computable, traceable, and absolutely trustworthy code logic, providing an indispensable technological cornerstone for the large-scale deployment of AI in the real world."),
    items: [{
      letter: "A",
      label: B("Agent 智能體", "Agent"),
      desc: B("機器算力", "Machine Computing"),
      desc2: B("機器算力與自動化執行", "Machine computing power and automated execution"),
      detail: B("將複雜的現實商業系統轉化為可計算、可追溯的代碼逻輯", "Transforming complex real-world business systems into computable, traceable code logic")
    }, {
      letter: "H",
      label: B("Human 人", "Human"),
      desc: B("人類智力", "Human Intelligence"),
      desc2: B("人類智力與專業背書", "Human intelligence and professional endorsement"),
      detail: B("保留人類不可替代的專業背書與極限糾偏能力", "Preserving irreplaceable human professional endorsement and ultimate error-correction capabilities")
    }, {
      letter: "A",
      label: B("Assets 資產", "Assets"),
      desc: B("物理資產", "Physical Assets"),
      desc2: B("物理資產與實體經濟", "Physical assets and real economy"),
      detail: B("原生打通機器算力、人類智力與物理資產的交互鏈路", "Natively connecting the interaction chains of machine computing, human intelligence, and physical assets")
    }],
    visualEyebrow: B("底層架構", "Foundation Architecture"),
    visualTitle: B("AHA 體系 —— 智能體-人-資產", "AHA Architecture — Agent-Human-Assets")
  },
  business: {
    eyebrow: B("商業部署矩陣", "Business Deployment Matrix"),
    title: "1+1+X",
    subtitle: B("戰略飛輪", "Strategic Flywheel"),
    content: B("基於 AHA 底層架構，TABLE AI 構建了極具延展性的「1+1+X」商業落地矩陣。這不僅是一套技術部署方案，更是系統性破解行業痛點的結構化解法。", "Built upon the AHA architecture, TABLE AI has constructed a highly extensible '1+1+X' business deployment matrix. This is not merely a technology deployment plan, but a structured solution for systematically solving industry pain points."),
    learnMore: B("深入了解", "Learn More")
  },
  protocol: {
    num: "01",
    pillar: B("跨越信任臨界點", "Crossing the Trust Threshold"),
    title: B("第一個「1」：跨越「信任」臨界點", "The First '1': Crossing the Trust Threshold"),
    subtitle: B("一套零信任、自迭代的合規清算系統", "A Zero-Trust, Self-Iterating Compliance Settlement System"),
    content: B("基於「零信任（Zero-Trust）」架構打造的企業級智能協同與全球分帳系統。它在確保數據「可用不可見」的前提下，精準量化多方協作貢獻，實現交易即秒級自動清算。系統內置自迭代機制，深度契合國家信通院可信算力標準及全球多邊稅務合規要求，用系統級的確定性徹底消除跨組織協作的摩擦成本。", "An enterprise-grade intelligent collaboration and global settlement system built on Zero-Trust architecture. While ensuring data remains 'usable but invisible,' it precisely quantifies multi-party collaboration contributions and achieves instant automatic settlement at the moment of transaction. With built-in self-iterating mechanisms, the system deeply aligns with CAICT trusted computing standards and global multilateral tax compliance requirements, using system-level certainty to completely eliminate the friction costs of cross-organizational collaboration."),
    overview: B("協議概述", "Protocol Overview"),
    mechanismsEyebrow: B("核心機制", "Core Mechanisms"),
    mechanismsTitle: B("零信任清算系統如何運轉", "How the Zero-Trust Settlement System Works"),
    features: [{
      title: B("零信任數據流轉", "Zero-Trust Data Circulation"),
      content: B("確保數據「可用不可見」，在保護商業機密的前提下實現多方協作的精準貢獻量化與利益分配。", "Ensures data remains 'usable but invisible,' enabling precise contribution quantification and interest distribution in multi-party collaboration while protecting commercial secrets.")
    }, {
      title: B("秒級自動清算", "Instant Automatic Settlement"),
      content: B("交易達成的瞬間，系統觸發零摩擦、零爭議的秒級自動清算，徹底消除跨組織協作的結算延遲。", "The moment a transaction is completed, the system triggers zero-friction, zero-dispute instant automatic settlement, completely eliminating settlement delays in cross-organizational collaboration.")
    }, {
      title: B("全球合規自迭代", "Global Compliance Self-Iteration"),
      content: B("系統內置自迭代機制，深度契合國家信通院可信算力標準及全球多邊稅務合規要求，確保絕對合規。", "Built-in self-iterating mechanisms deeply align with CAICT trusted computing standards and global multilateral tax compliance requirements, ensuring absolute compliance.")
    }],
    highlightsEyebrow: B("技術亮點", "Technical Highlights"),
    highlights: [{
      title: B("零信任架構", "Zero-Trust Architecture"),
      desc: B("確保數據可用不可見，在保護商業機密的前提下實現多方協作的精準貢獻量化", "Ensures data remains usable but invisible, enabling precise contribution quantification in multi-party collaboration while protecting commercial secrets")
    }, {
      title: B("秒級自動清算", "Instant Automatic Settlement"),
      desc: B("交易達成的瞬間觸發零摩擦、零爭議的秒級自動清算，徹底消除結算延遲", "Instant zero-friction, zero-dispute automatic settlement triggered at the moment of transaction, completely eliminating settlement delays")
    }, {
      title: B("可信算力標準", "Trusted Computing Standards"),
      desc: B("深度契合國家信通院可信算力標準，確保計算過程透明可審計", "Deeply aligned with CAICT trusted computing standards, ensuring transparent and auditable computation processes")
    }, {
      title: B("全球多邊合規", "Global Multilateral Compliance"),
      desc: B("系統內置自迭代機制，深度契合全球多邊稅務合規要求，用系統級確定性消除摩擦成本", "Built-in self-iterating mechanisms aligned with global multilateral tax compliance requirements, using system-level certainty to eliminate friction costs")
    }],
    ctaTitle: B("探索 OPC Global 專業級協作網絡", "Explore the OPC Global Professional Network"),
    ctaLabel: B("了解網絡", "Discover the Network")
  },
  network: {
    num: "02",
    pillar: B("跨越體驗臨界點", "Crossing the Experience Threshold"),
    title: B("第二個「1」：跨越「體驗」臨界點", "The Second '1': Crossing the Experience Threshold"),
    subtitle: B("OPC Global — 全球化專業級協作網絡", "OPC Global — A Global Professional Collaboration Network"),
    content: B("單純的代碼無法獨立應對真實商業的複雜性，高風險場景依然需要人在回路以明確權責、控制風險。依託遍布倫敦、巴塞爾、北美及大中華區核心樞紐的算力與人才節點，我們構建了基於「人在回路 (Human-in-the-loop)」理念的 OPC Global 超級專家網絡。我們將頂尖專家的隱性經驗轉化為 AI 模型，同時保留人類不可替代的專業背書與極限糾偏能力，為 AI 的真實商業交付提供最高標準的體驗兜底。", "Code alone cannot independently handle the complexity of real-world business. High-risk scenarios still require humans in the loop to clarify responsibilities and control risks. Leveraging computing power and talent nodes across core hubs in London, Basel, North America, and Greater China, we have built the OPC Global super expert network based on the 'Human-in-the-loop' philosophy. We transform the tacit experience of top experts into AI models while preserving the irreplaceable human professional endorsement and ultimate error-correction capabilities, providing the highest standard of experience assurance for AI's real-world business delivery."),
    overview: B("網絡概述", "Network Overview"),
    pillarsEyebrow: B("核心支柱", "Core Pillars"),
    pillarsTitle: B("OPC Global 網絡架構", "OPC Global Network Architecture"),
    features: [{
      title: B("人在回路 (Human-in-the-loop)", "Human-in-the-Loop"),
      content: B("高風險場景依然需要人在回路以明確權責、控制風險，保留人類不可替代的專業背書與極限糾偏能力。", "High-risk scenarios still require humans in the loop to clarify responsibilities and control risks, preserving the irreplaceable human professional endorsement and ultimate error-correction capabilities.")
    }, {
      title: B("隱性經驗 AI 化", "Tacit Experience to AI"),
      content: B("將遍布頂尖高校、醫療機構及商業領域的專家隱性經驗轉化為可規模化的 AI 專家模型。", "Transforming tacit expert experience across top universities, medical institutions, and business domains into scalable AI expert models.")
    }, {
      title: B("全球樞紐網絡", "Global Hub Network"),
      content: B("依託遍布倫敦、巴塞爾、北美及大中華區核心樞紐的算力與人才節點，構建全球化專業級協作網絡。", "Leveraging computing power and talent nodes across core hubs in London, Basel, North America, and Greater China to build a global professional collaboration network.")
    }],
    hubsEyebrow: B("全球布局", "Global Presence"),
    hubsTitle: B("樞紐城市網絡", "Hub City Network"),
    hubs: [{
      city: B("中國香港", "Hong Kong"),
      region: B("大中華區", "Greater China")
    }, {
      city: B("倫敦", "London"),
      region: B("歐洲", "Europe")
    }, {
      city: B("巴塞爾", "Basel"),
      region: B("歐洲", "Europe")
    }, {
      city: B("北美", "North America"),
      region: B("美洲", "Americas")
    }, {
      city: B("北京", "Beijing"),
      region: B("大中華區", "Greater China")
    }, {
      city: B("上海", "Shanghai"),
      region: B("大中華區", "Greater China")
    }, {
      city: B("深圳", "Shenzhen"),
      region: B("大中華區", "Greater China")
    }, {
      city: B("澳門", "Macau"),
      region: B("大中華區", "Greater China")
    }],
    metrics: [{
      icon: "users",
      num: B("Human-in-the-Loop", "Human-in-the-Loop"),
      label: B("人在回路", "Human-in-the-Loop"),
      desc: B("高風險場景依然需要人在回路以明確權責、控制風險，保留人類不可替代的專業背書與極限糾偏能力", "High-risk scenarios still require humans in the loop to clarify responsibilities and control risks, preserving irreplaceable human professional endorsement and ultimate error-correction capabilities")
    }, {
      icon: "cpu",
      num: B("AI + Expert", "AI + Expert"),
      label: B("隱性經驗 AI 化", "Tacit Experience to AI"),
      desc: B("將頂尖專家的隱性經驗轉化為 AI 模型，實現專業知識的規模化複制與持續進化", "Transforming tacit experience of top experts into AI models, enabling scalable replication and continuous evolution of professional knowledge")
    }, {
      icon: "zap",
      num: B("最高標準", "Highest Standard"),
      label: B("體驗兜底", "Experience Assurance"),
      desc: B("為 AI 的真實商業交付提供最高標準的體驗兜底，確保專業深度與責任擔當", "Providing the highest standard of experience assurance for AI's real-world business delivery, ensuring professional depth and accountability")
    }],
    ctaTitle: B("探索 AI 實驗室", "Explore AI Labs"),
    ctaLabel: B("了解實驗室", "Discover AI Labs")
  },
  labs: {
    num: "03",
    pillar: B("引領範式轉移", "Leading Paradigm Shift"),
    title: B("乘數「X」：引領範式轉移", "The Multiplier 'X': Leading Paradigm Shift"),
    subtitle: B("X 個具備行業領先範例的 AI 轉型場景", "X Industry-Leading AI Transformation Scenarios"),
    content: B("TABLE AI 正將 1+1 的基礎設施能力，注入亟待 AI 轉型的高淨值、重資產場景，打造標桿級範例。", "TABLE AI is injecting its 1+1 infrastructure capabilities into high-value, heavy-asset scenarios urgently awaiting AI transformation, creating benchmark-level exemplars."),
    overview: B("實驗室概述", "Labs Overview"),
    homeEyebrow: B("乘數「X」", "Multiplier X"),
    homeTitle: B("X 個 AI 轉型場景", "X AI Transformation Scenarios"),
    viewAll: B("查看全部", "View All"),
    details: B("了解詳情", "Details"),
    items: [{
      num: "X1",
      title: B("合規商旅與供應鏈管家", "Compliant Business Travel & Supply Chain Steward"),
      subtitle: B("重塑大型政企內部協作信任", "Reshaping Internal Collaboration Trust in Large Government and Enterprise Organizations"),
      content: B("緊貼宏觀「降本增效」剛需，通過算法驅動，為大型國資與私企提供徹底透明、消除一切灰色地帶的差旅管家系統，重塑大型政企內部協作信任。", "Closely aligned with the macro demand for cost reduction and efficiency improvement, providing large state-owned and private enterprises with completely transparent business travel management systems through algorithm-driven solutions, eliminating all gray areas and reshaping internal collaboration trust."),
      details: [{
        label: B("核心策略", "Core Strategy"),
        value: B("緊貼宏觀降本增效剛需，通過算法驅動，為大型國資與私企提供徹底透明、消除一切灰色地帶的差旅管家系統，重塑大型政企內部協作信任", "Closely aligned with macro cost reduction demands, providing completely transparent business travel management through algorithm-driven solutions, reshaping internal collaboration trust in large government and enterprise organizations")
      }, {
        label: B("核心能力", "Core Capability"),
        value: B("基於零信任架構實現數據可用不可見，精準量化多方協作貢獻，交易即秒級自動清算", "Based on zero-trust architecture ensuring data is usable but invisible, precisely quantifying multi-party collaboration contributions with instant automatic settlement")
      }, {
        label: B("目標客戶", "Target Clients"),
        value: B("大型國資企業、私營企業集團", "Large state-owned enterprises, private enterprise groups")
      }]
    }, {
      num: "X2",
      title: B("空間資產智能化調度平台", "Intelligent Space Asset Scheduling Platform"),
      subtitle: B("多方利益實時動態清算", "Real-Time Dynamic Settlement of Multi-Party Interests"),
      content: B("利用 AI 智能體直接接管線下物理空間，實現無人化運營調度與多方資產持有者的秒級利潤清算，實現多方利益實時動態清算。", "Using AI agents to directly manage offline physical spaces, achieving unmanned operational scheduling and instant profit settlement for multi-party asset holders, enabling real-time dynamic settlement of multi-party interests."),
      details: [{
        label: B("核心策略", "Core Strategy"),
        value: B("利用 AI 智能體直接接管線下物理空間，實現無人化運營調度與多方資產持有者的秒級利潤清算", "Using AI agents to directly manage offline physical spaces, achieving unmanned operational scheduling and instant profit settlement for multi-party asset holders")
      }, {
        label: B("技術亮點", "Technical Highlights"),
        value: B("實現多方利益實時動態清算，基於 AHA 架構打通智能體、人類運營者與物理資產的協同鏈路", "Achieving real-time dynamic settlement of multi-party interests, connecting AI agents, human operators, and physical assets through the AHA architecture")
      }, {
        label: B("應用場景", "Application Scenarios"),
        value: B("酒店、聯合辦公、商業地產等重資產空間的智能化運營與收益分配", "Intelligent operation and revenue distribution for heavy-asset spaces including hotels, co-working spaces, and commercial real estate")
      }]
    }, {
      num: "X3",
      title: B("高端服務與科研成果轉化系統", "Premium Services & Research Commercialization System"),
      subtitle: B("連接全球頂尖學府", "Connecting World-Class Academic Institutions"),
      content: B("連接全球頂尖學府，在極高端的體驗經濟與科研成果轉化中，全面跑通高客單價的跨界分潤模型。", "Connecting world-class academic institutions, fully validating high-ticket cross-border profit-sharing models in premium experience economy and research commercialization."),
      details: [{
        label: B("核心策略", "Core Strategy"),
        value: B("連接全球頂尖學府，在極高端的體驗經濟與科研成果轉化中，全面跑通高客單價的跨界分潤模型", "Connecting world-class academic institutions, fully validating high-ticket cross-border profit-sharing models in premium experience economy and research commercialization")
      }, {
        label: B("核心能力", "Core Capability"),
        value: B("基於 OPC Global 超級專家網絡，將頂尖學術資源與商業場景深度融合，實現知識變現與體驗升級", "Based on the OPC Global super expert network, deeply integrating top academic resources with business scenarios for knowledge monetization and experience enhancement")
      }, {
        label: B("目標人群", "Target Audience"),
        value: B("高淨值人群、學術機構、科研院所", "High-net-worth individuals, academic institutions, research institutes")
      }]
    }],
    philosophy: {
      eyebrow: B("商業逻輯", "Business Logic"),
      title: B("將 1+1 的基礎設施能力注入高淨值、重資產場景", "Injecting 1+1 Infrastructure into High-Value, Heavy-Asset Scenarios"),
      content: B("每一個 AI 轉型場景都是 AHA 底層架構與 OPC Global 專家網絡交匯產生的標桿級範例，引領行業範式轉移", "Each AI transformation scenario is a benchmark exemplar generated at the intersection of the AHA architecture and OPC Global expert network, leading industry paradigm shifts"),
      cta: B("關於我們", "About Us")
    }
  },
  partners: {
    eyebrow: B("合作夥伴", "Partners"),
    title: B("與全球領先機構共建生態", "Building Ecosystems with Global Leaders"),
    viewAll: B("查看全部合作夥伴", "View All Partners"),
    aboutEyebrow: B("合作夥伴", "Strategic Partners"),
    aboutIntro: B("TABLE AI 與教育、科技、醫療、文化等領域的頂尖機構建立深度合作，共同推動智能經濟基礎設施的落地與發展。", "TABLE AI establishes deep partnerships with leading institutions across education, technology, healthcare, and culture to jointly advance intelligent economy infrastructure."),
    visit: B("訪問官網", "Visit Website"),
    categories: {
      education: B("教育", "Education"),
      technology: B("科技", "Technology"),
      medical: B("醫療", "Healthcare"),
      alliance: B("聯盟", "Alliance"),
      culture: B("文化", "Culture"),
      tourism: B("旅遊", "Tourism"),
      research: B("研究", "Research")
    },
    list: [{
      name: B("伯禹教育", "Boyuai Education"),
      url: "https://www.boyuai.com",
      category: "education",
      desc: B("伯禹教育是一家專注於人工智能（AI）教育的機構，致力於培養卓越的人工智能算法工程師和研究員。其課程體系基於上海交通大學ACM班的人工智能專業課程進行創新，涵蓋數學基礎、編程能力、機器學習、深度學習及應用實踐。", "Boyuai Education is an institution focused on artificial intelligence education, dedicated to cultivating outstanding AI algorithm engineers and researchers. Its curriculum is innovated based on the AI professional courses of Shanghai Jiao Tong University's ACM Class.")
    }, {
      name: B("瀾碼科技", "Lanma Technology"),
      url: "https://www.xbotspace.com",
      category: "technology",
      desc: B("瀾碼科技是一家基於大語言模型（LLM）的企業級AI Agent（智能體）平台公司。其核心理念是「專家知識賦能基層業務單元」。核心產品AskXBOT平台能夠將大語言模型的能力抽象為文檔檢索、AI調用、數據查詢等功能。", "Lanma Technology is an enterprise-grade AI Agent platform company based on Large Language Models (LLM). Its core philosophy is 'Expert Knowledge Empowering Frontline Business Units'. The core product AskXBOT platform abstracts LLM capabilities into document retrieval, AI invocation, and data querying.")
    }, {
      name: B("首都醫科大學附屬北京朝陽醫院", "Beijing Chaoyang Hospital, Capital Medical University"),
      url: "https://www.bjcyh.com.cn",
      category: "medical",
      desc: B("首都醫科大學附屬北京朝陽醫院建於1958年，是一所集醫療、教學、科研、預防為一體的三級甲等綜合醫院。醫院是北京市呼吸疾病研究所所在地，呼吸病學是國家重點學科。", "Beijing Chaoyang Hospital, affiliated with Capital Medical University, was established in 1958. It is a Grade-A tertiary comprehensive hospital integrating medical treatment, teaching, research, and prevention. The hospital houses the Beijing Institute of Respiratory Medicine.")
    }, {
      name: B("OPC Global（一人公司全球聯盟）", "OPC Global (One Person Company Alliance)"),
      url: "https://opcglobal.ai",
      category: "alliance",
      desc: B("OPC Global 是一個致力於在AI時代賦能個體和微型團隊的全球聯盟。其願景是幫助個人通過AI工具和自動化工作流實現超級個體的價值閉環。平台提供從L1（操作員）到L3（泰坦）的認證體系。", "OPC Global is a worldwide alliance dedicated to empowering individuals and micro-teams in the AI era. Its vision is to help individuals achieve the value loop of super-individuals through AI tools and automated workflows, providing certification from L1 (Operator) to L3 (Titan) levels.")
    }, {
      name: B("Nibiru 睿悅科技", "Nibiru (RealMax Technology)"),
      url: "https://www.inibiru.com",
      category: "technology",
      desc: B("睿悅信息（Nibiru）是全球領先的AR/VR系統、三維數字引擎及互動式內容工具供應商。公司主營業務包括為全球XR設備制造商提供Nibiru OS操作系統，以及Nibiru Studio、Nibiru Creator等。", "Nibiru (RealMax Technology) is a globally leading AR/VR system, 3D digital engine, and interactive content tool provider. Its core offerings include Nibiru OS for global XR device manufacturers, Nibiru Studio and Nibiru Creator.")
    }, {
      name: B("世界運河城市 Canal Walk", "World Canal Cities Canal Walk"),
      url: "https://www.xinhuanet.com",
      category: "culture",
      desc: B("世界運河城市 Canal Walk 行動是由「世界運河城市Canal Walk行動組委會」（成立於2024年9月）發起的一項國際文化交流倡議。該行動以運河文化為紐帶，倡導「運河漫步」的生活方式，推動全球運河城市間的互聯互通。", "World Canal Cities Canal Walk is an international cultural exchange initiative launched by the Canal Walk Action Committee (established September 2024). The initiative uses canal culture as a bond, advocating the 'Canal Walk' lifestyle and promoting interconnection among global canal cities.")
    }, {
      name: B("中智遊集團", "CIT Group (Smart Tourism)"),
      url: "https://www.citgroup.cn",
      category: "tourism",
      desc: B("中智遊集團是一家專注於智慧旅遊的信息化技術服務商。主要業務涵蓋旅遊目的地的智慧營銷、規劃顧問、軟件研發與建設、以及旅遊項目的投資與運營。", "CIT Group is an information technology service provider focused on smart tourism. Its core business covers intelligent marketing, planning consulting, software development, and tourism project investment and operations.")
    }, {
      name: B("亞洲藝術療癒研究院", "Asian Institute of Art Therapy"),
      url: "https://www.krirk.ac.th",
      category: "research",
      desc: B("亞洲藝術療癒研究院於2024年底在泰國格樂大學正式成立。該研究院旨在深化亞洲國家在精神健康與藝術療癒領域的合作，探索獨特的「東方療癒範式」。", "The Asian Institute of Art Therapy was officially established at Krirk University, Thailand in late 2024. The institute aims to deepen cooperation among Asian countries in mental health and art therapy, exploring a unique 'Eastern Healing Paradigm'.")
    }]
  },
  cta: {
    eyebrow: B("加入我們", "Join Us"),
    title: B("共建智能經濟的未來", "Build the Future of Intelligent Economy"),
    content: B("讓全球範圍內的機器智能、人類專家與實體資產實現無摩擦的高效協同", "Enabling frictionless, high-efficiency collaboration among machine intelligence, human experts, and physical assets worldwide"),
    label: B("了解 TABLE AI", "Discover TABLE AI")
  },
  about: {
    eyebrow: B("關於我們", "About Us"),
    title: B("關於 TABLE AI", "About TABLE AI"),
    mission: B("使命", "Mission"),
    content: B("TABLE AI 致力於構建下一代智能經濟的基礎設施。我們通過重構底層的協作協議，徹底跨越信任與體驗的鴻溝，讓全球範圍內的機器智能、人類專家與實體資產實現無摩擦的高效協同。", "TABLE AI is committed to building the infrastructure for the next-generation intelligent economy. By reconstructing the underlying collaboration protocols, we fundamentally bridge the trust and experience divide, enabling frictionless, high-efficiency collaboration among machine intelligence, human experts, and physical assets worldwide."),
    stats: [{
      value: 2026,
      label: B("成立年份", "Founded")
    }, {
      value: 8,
      suffix: "+",
      label: B("全球節點", "Global Nodes")
    }, {
      value: 3,
      label: B("業務板塊", "Business Lines")
    }, {
      value: 100,
      suffix: "%",
      label: B("自動清算", "Auto Settlement")
    }],
    profileEyebrow: B("企業概況", "Company Profile"),
    profileTitle: B("TABLE AI 集團", "TABLE AI Group"),
    profile: [{
      label: B("全稱", "Full Name"),
      value: B("香港泰博樂科技有限公司（TABLE AI）", "TABLE AI (香港泰博樂科技有限公司)")
    }, {
      label: B("業務", "Business"),
      value: B("專家 AI 工作室：專家智能體、專家數據與評分標準、專家評測集", "Expert-AI Studio: Expert Agents, Expert Data & Rubrics, Expert Evals")
    }, {
      label: B("定位", "Positioning"),
      value: B("跨越智能與實體經濟邊界的全球協同基礎設施", "Global Collaborative Infrastructure Bridging Intelligence and the Real Economy")
    }, {
      label: B("總部", "Headquarters"),
      value: B("中國香港", "Hong Kong, China")
    }, {
      label: B("全球節點", "Global Nodes"),
      value: B("港澳、倫敦、巴塞爾、北美及國內核心城市", "Hong Kong/Macau, London, Basel, North America, and core domestic cities")
    }, {
      label: B("核心技術", "Core Technology"),
      value: B("AHA（Agent-Human-Assets）混合協作底層架構、零信任合規清算系統、OPC Global 專業級協作網絡", "AHA (Agent-Human-Assets) Hybrid Collaboration Architecture, Zero-Trust Compliance Settlement System, OPC Global Professional Collaboration Network")
    }, {
      label: B("合規框架", "Compliance"),
      value: B("深度契合國家信通院可信算力標準及全球多邊稅務合規要求", "Deeply aligned with CAICT trusted computing standards and global multilateral tax compliance requirements")
    }],
    networkEyebrow: B("全球網絡", "Global Network"),
    networkTitle: B("全球合夥人網絡", "Global Partner Network"),
    nodes: B("個節點", " Nodes"),
    locations: [{
      name: B("TABLE AI 總部", "TABLE AI HQ"),
      city: B("香港", "Hong Kong"),
      region: B("大中華區", "Greater China"),
      lat: 22.3193,
      lng: 114.1694
    }, {
      name: B("倫敦節點", "London Node"),
      city: B("倫敦", "London"),
      region: B("歐洲", "Europe"),
      lat: 51.5074,
      lng: -0.1278
    }, {
      name: B("巴塞爾節點", "Basel Node"),
      city: B("巴塞爾", "Basel"),
      region: B("歐洲", "Europe"),
      lat: 47.5596,
      lng: 7.5886
    }, {
      name: B("北美節點", "North America Node"),
      city: B("紐約", "New York"),
      region: B("北美", "North America"),
      lat: 40.7128,
      lng: -74.006
    }, {
      name: B("北京節點", "Beijing Node"),
      city: B("北京", "Beijing"),
      region: B("大中華區", "Greater China"),
      lat: 39.9042,
      lng: 116.4074
    }, {
      name: B("上海節點", "Shanghai Node"),
      city: B("上海", "Shanghai"),
      region: B("大中華區", "Greater China"),
      lat: 31.2304,
      lng: 121.4737
    }, {
      name: B("深圳節點", "Shenzhen Node"),
      city: B("深圳", "Shenzhen"),
      region: B("大中華區", "Greater China"),
      lat: 22.5431,
      lng: 114.0579
    }],
    ctaTitle: B("加入我們，共建智能經濟的未來", "Join us in building the future of intelligent economy"),
    email: "hi@tableai.ai"
  },
  footer: {
    tagline: B("構築 AI 時代的全球智能協同與價值清算基礎設施", "Architecting the Global Infrastructure for AI-Era Collaboration and Value Settlement"),
    cities: B("中國香港 | 倫敦 | 巴塞爾 | 北美 | 北京 | 上海 | 深圳", "Hong Kong | London | Basel | North America | Beijing | Shanghai | Shenzhen"),
    columns: [{
      title: B("產品", "Products"),
      links: [{
        label: B("專家 AI 工作室", "Expert-AI Studio"),
        href: "/studio"
      }, {
        label: B("智能協作協議", "Smart Protocol"),
        href: "/protocol"
      }, {
        label: B("OPC 全球網絡", "OPC Network"),
        href: "/network"
      }, {
        label: B("AI 實驗室", "AI Labs"),
        href: "/business"
      }]
    }, {
      title: B("公司", "Company"),
      links: [{
        label: B("關於我們", "About"),
        href: "/about"
      }, {
        label: B("合作夥伴", "Partners"),
        href: "/about"
      }, {
        label: B("聯繫我們", "Contact"),
        href: "/about"
      }]
    }],
    copyright: B("© 2026 TABLE AI. 保留所有權利。", "© 2026 TABLE AI. All rights reserved."),
    privacy: B("隱私政策", "Privacy"),
    terms: B("服務條款", "Terms")
  },
  common: {
    back: B("返回首頁", "Back to Home"),
    scroll: "Scroll",
    loading: "Loading"
  }
};
Object.assign(window, {
  SITE
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/content.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/home.jsx
try { (() => {
const {
  Eyebrow,
  Button,
  Card,
  TileGrid,
  Stat,
  Divider,
  Icon
} = window.TableAIDesignSystem_f48f27;
function Hero() {
  const {
    t
  } = useLang();
  const H = SITE.hero;
  return /*#__PURE__*/React.createElement("section", {
    className: "hero"
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid-bg",
    style: {
      opacity: .4
    },
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("div", {
    className: "ring",
    style: {
      top: "15%",
      right: "8%",
      width: 300,
      height: 300,
      opacity: .2
    },
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("div", {
    className: "ring square",
    style: {
      bottom: "20%",
      left: "5%",
      width: 200,
      height: 200,
      opacity: .15
    },
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("div", {
    className: "dot",
    style: {
      top: "40%",
      right: "25%"
    },
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement(Container, {
    style: {
      position: "relative",
      zIndex: 1,
      paddingTop: 96
    }
  }, /*#__PURE__*/React.createElement(Reveal, null, /*#__PURE__*/React.createElement(Eyebrow, {
    line: true,
    style: {
      marginBottom: 32
    }
  }, t(SITE.studio.eyebrow))), /*#__PURE__*/React.createElement(Reveal, {
    delay: .1
  }, /*#__PURE__*/React.createElement("h1", {
    className: "h1-hero"
  }, t(H.title))), /*#__PURE__*/React.createElement(Reveal, {
    delay: .2
  }, /*#__PURE__*/React.createElement("p", {
    className: "lead hero-lead"
  }, t(SITE.studio.tagline))), /*#__PURE__*/React.createElement(Reveal, {
    delay: .3
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Button, {
    as: A,
    href: "/studio",
    size: "lg",
    iconRight: "arrow-right"
  }, t(SITE.studio.cta1)), /*#__PURE__*/React.createElement(Button, {
    as: A,
    href: "/about",
    variant: "outline",
    size: "lg"
  }, t(H.cta2))))), /*#__PURE__*/React.createElement("div", {
    className: "scroll-hint",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("span", null, SITE.common.scroll), /*#__PURE__*/React.createElement("i", null)));
}
function StatsStrip({
  stats
}) {
  const {
    t
  } = useLang();
  return /*#__PURE__*/React.createElement("section", {
    className: "stats"
  }, /*#__PURE__*/React.createElement(Container, null, /*#__PURE__*/React.createElement("div", {
    className: "stats-grid"
  }, stats.map((s, i) => /*#__PURE__*/React.createElement(Reveal, {
    key: i,
    delay: i * .1,
    className: "stat-cell"
  }, /*#__PURE__*/React.createElement(Stat, {
    value: s.value,
    suffix: s.suffix || "",
    label: t(s.label),
    accent: !!s.accent,
    countUp: true,
    size: "md"
  }))))));
}
function HomePage() {
  const {
    t
  } = useLang();
  const {
    go
  } = useRoute();
  const S = SITE;
  const pillars = [{
    num: "01",
    label: S.protocol.pillar,
    title: S.protocol.title,
    desc: S.protocol.subtitle,
    href: "/protocol"
  }, {
    num: "02",
    label: S.network.pillar,
    title: S.network.title,
    desc: S.network.subtitle,
    href: "/network"
  }, {
    num: "03",
    label: S.labs.pillar,
    title: S.labs.title,
    desc: S.labs.subtitle,
    href: "/business"
  }];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Hero, null), /*#__PURE__*/React.createElement(StatsStrip, {
    stats: S.stats
  }), /*#__PURE__*/React.createElement(StudioProblem, null), /*#__PURE__*/React.createElement(StudioProducts, null), /*#__PURE__*/React.createElement(StudioTiansight, null), /*#__PURE__*/React.createElement(Section, {
    size: "narrow",
    pad: "xl"
  }, /*#__PURE__*/React.createElement(Reveal, null, /*#__PURE__*/React.createElement(Eyebrow, {
    style: {
      marginBottom: 40
    }
  }, t(S.insight.eyebrow))), /*#__PURE__*/React.createElement(Reveal, {
    delay: .2
  }, /*#__PURE__*/React.createElement("blockquote", {
    className: "quote"
  }, t(S.hero.insight))), /*#__PURE__*/React.createElement(TileGrid, {
    columns: 2,
    minWidth: 280
  }, S.thresholds.map((th, i) => /*#__PURE__*/React.createElement(Card, {
    key: i,
    variant: "tile",
    padding: 40,
    eyebrow: t(th.label),
    title: /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 500
      }
    }, t(th.title)),
    description: t(th.desc)
  }))), /*#__PURE__*/React.createElement(Reveal, {
    delay: .5
  }, /*#__PURE__*/React.createElement(Divider, {
    variant: "accent",
    width: 96,
    style: {
      marginTop: 48,
      opacity: .3
    }
  }))), /*#__PURE__*/React.createElement(Section, {
    tinted: true,
    size: "narrow"
  }, /*#__PURE__*/React.createElement(Reveal, null, /*#__PURE__*/React.createElement(Eyebrow, {
    style: {
      marginBottom: 24
    }
  }, t(S.aha.eyebrow)), /*#__PURE__*/React.createElement("h2", {
    className: "h2 big",
    style: {
      marginBottom: 32
    }
  }, t(S.aha.title))), /*#__PURE__*/React.createElement(Reveal, {
    delay: .15
  }, /*#__PURE__*/React.createElement("p", {
    className: "lead",
    style: {
      maxWidth: 768,
      marginBottom: 32
    }
  }, t(S.aha.subtitle))), /*#__PURE__*/React.createElement(Reveal, {
    delay: .25
  }, /*#__PURE__*/React.createElement("p", {
    className: "body",
    style: {
      maxWidth: 896
    }
  }, t(S.aha.content))), /*#__PURE__*/React.createElement(Reveal, {
    delay: .35
  }, /*#__PURE__*/React.createElement(TileGrid, {
    columns: 3,
    style: {
      marginTop: 64
    }
  }, S.aha.items.map((it, i) => /*#__PURE__*/React.createElement(Card, {
    key: i,
    variant: "tile",
    interactive: true,
    padding: 40,
    style: {
      textAlign: "center",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "letter"
  }, it.letter), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 500,
      marginBottom: 8
    }
  }, t(it.label)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--text-muted)"
    }
  }, t(it.desc))))))), /*#__PURE__*/React.createElement(Section, {
    pad: "xl"
  }, /*#__PURE__*/React.createElement(Reveal, {
    style: {
      marginBottom: 80
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "split-7-5"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Eyebrow, {
    style: {
      marginBottom: 24
    }
  }, t(S.business.eyebrow)), /*#__PURE__*/React.createElement("h2", {
    className: "h2 big"
  }, S.business.title, /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-muted)"
    }
  }, t(S.business.subtitle)))), /*#__PURE__*/React.createElement("p", {
    className: "body muted",
    style: {
      alignSelf: "end"
    }
  }, t(S.business.content)))), /*#__PURE__*/React.createElement(TileGrid, {
    columns: 3,
    minWidth: 260
  }, pillars.map((p, i) => /*#__PURE__*/React.createElement(Reveal, {
    key: i,
    delay: i * .15,
    style: {
      display: "flex"
    }
  }, /*#__PURE__*/React.createElement(Card, {
    variant: "tile",
    interactive: true,
    padding: 40,
    number: p.num,
    arrow: true,
    eyebrow: t(p.label),
    title: t(p.title),
    description: t(p.desc),
    onClick: () => go(p.href),
    footer: /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 8
      }
    }, t(S.business.learnMore), /*#__PURE__*/React.createElement(Icon, {
      name: "arrow-right",
      size: 12
    })),
    style: {
      minHeight: 320,
      flex: 1
    }
  }))))), /*#__PURE__*/React.createElement(Section, {
    tinted: true,
    pad: "xl"
  }, /*#__PURE__*/React.createElement(SectionHead, {
    eyebrow: t(S.labs.homeEyebrow),
    title: t(S.labs.homeTitle),
    right: /*#__PURE__*/React.createElement(A, {
      href: "/business",
      className: "inline-link"
    }, t(S.labs.viewAll), /*#__PURE__*/React.createElement(Icon, {
      name: "arrow-right",
      size: 14
    }))
  }), /*#__PURE__*/React.createElement("div", {
    className: "cards-3"
  }, S.labs.items.map((room, i) => /*#__PURE__*/React.createElement(Reveal, {
    key: room.num,
    delay: i * .12,
    style: {
      display: "flex"
    }
  }, /*#__PURE__*/React.createElement(Card, {
    interactive: true,
    padding: 40,
    style: {
      minHeight: 280,
      flex: 1
    },
    onClick: () => go("/business"),
    footer: /*#__PURE__*/React.createElement("span", null, t(S.labs.details), " \u2192")
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "room-num"
  }, room.num), /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-up-right",
    size: 16,
    style: {
      opacity: .4
    }
  })), /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: "0 0 12px",
      fontSize: 18,
      fontWeight: 500,
      letterSpacing: "-.02em"
    }
  }, t(room.title)), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      lineHeight: 1.6,
      color: "var(--text-muted)"
    }
  }, t(room.subtitle))))))), /*#__PURE__*/React.createElement(Section, null, /*#__PURE__*/React.createElement(Reveal, {
    style: {
      textAlign: "center",
      marginBottom: 64
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, {
    align: "center",
    style: {
      marginBottom: 24
    }
  }, t(S.partners.eyebrow)), /*#__PURE__*/React.createElement("h2", {
    className: "h2"
  }, t(S.partners.title))), /*#__PURE__*/React.createElement(TileGrid, {
    columns: 4,
    minWidth: 200
  }, S.partners.list.map((p, i) => /*#__PURE__*/React.createElement(Card, {
    key: i,
    variant: "tile",
    interactive: true,
    padding: 32,
    href: p.url,
    target: "_blank",
    rel: "noopener noreferrer",
    style: {
      alignItems: "center",
      textAlign: "center",
      minHeight: 160,
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "initial"
  }, p.name.en[0]), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 500,
      letterSpacing: ".025em",
      color: "var(--text-muted)"
    }
  }, t(p.name))))), /*#__PURE__*/React.createElement(Reveal, {
    delay: .3,
    style: {
      textAlign: "center",
      marginTop: 40
    }
  }, /*#__PURE__*/React.createElement(A, {
    href: "/about",
    className: "inline-link"
  }, t(S.partners.viewAll), /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-right",
    size: 14
  })))), /*#__PURE__*/React.createElement(CtaSection, {
    eyebrow: S.cta.eyebrow,
    title: S.cta.title,
    content: S.cta.content,
    label: S.cta.label,
    href: "/about",
    gold: true
  }), /*#__PURE__*/React.createElement(Footer, null));
}
Object.assign(window, {
  HomePage,
  StatsStrip
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/home.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/pages.jsx
try { (() => {
const {
  Eyebrow,
  Button,
  Card,
  TileGrid,
  Stat,
  Divider,
  Icon,
  Badge
} = window.TableAIDesignSystem_f48f27;
function ProtocolPage() {
  const {
    t
  } = useLang();
  const P = SITE.protocol,
    S = SITE;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHero, {
    num: P.num,
    pillar: P.pillar,
    title: P.title,
    subtitle: P.subtitle,
    rings: [{
      top: "20%",
      right: "10%",
      width: 250,
      height: 250,
      opacity: .15
    }]
  }), /*#__PURE__*/React.createElement(Overview, {
    eyebrow: P.overview,
    text: P.content
  }), /*#__PURE__*/React.createElement(Section, null, /*#__PURE__*/React.createElement(SectionHead, {
    eyebrow: t(S.aha.visualEyebrow),
    title: t(S.aha.visualTitle)
  }), /*#__PURE__*/React.createElement(Reveal, {
    delay: .1
  }, /*#__PURE__*/React.createElement("p", {
    className: "body",
    style: {
      maxWidth: 896,
      marginBottom: 48
    }
  }, t(S.aha.content))), /*#__PURE__*/React.createElement(TileGrid, {
    columns: 3,
    minWidth: 240
  }, S.aha.items.map((it, i) => /*#__PURE__*/React.createElement(Reveal, {
    key: i,
    delay: i * .12,
    style: {
      display: "flex"
    }
  }, /*#__PURE__*/React.createElement(Card, {
    variant: "tile",
    interactive: true,
    padding: 40,
    style: {
      minHeight: 280,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "letter left"
  }, it.letter), /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: "0 0 8px",
      fontSize: 18,
      fontWeight: 500,
      letterSpacing: "-.02em"
    }
  }, t(it.label)), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "0 0 16px",
      fontSize: 14,
      color: "var(--text-muted)"
    }
  }, t(it.desc2)), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "auto 0 0",
      fontSize: 12,
      lineHeight: 1.6,
      color: "var(--text-subtle)"
    }
  }, t(it.detail))))))), /*#__PURE__*/React.createElement(Section, null, /*#__PURE__*/React.createElement(SectionHead, {
    eyebrow: t(P.mechanismsEyebrow),
    title: t(P.mechanismsTitle)
  }), /*#__PURE__*/React.createElement(FeatureRows, {
    items: P.features
  })), /*#__PURE__*/React.createElement(Section, {
    tinted: true
  }, /*#__PURE__*/React.createElement(Reveal, {
    style: {
      marginBottom: 64
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, null, t(P.highlightsEyebrow))), /*#__PURE__*/React.createElement(TileGrid, {
    columns: 2,
    minWidth: 280
  }, P.highlights.map((h, i) => /*#__PURE__*/React.createElement(Reveal, {
    key: i,
    delay: i * .08,
    style: {
      display: "flex"
    }
  }, /*#__PURE__*/React.createElement(Card, {
    variant: "tile",
    interactive: true,
    padding: 40,
    style: {
      flex: 1
    },
    title: /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 16,
        fontWeight: 500
      }
    }, t(h.title)),
    description: t(h.desc)
  }))))), /*#__PURE__*/React.createElement(CtaSection, {
    title: P.ctaTitle,
    label: P.ctaLabel,
    href: "/network"
  }), /*#__PURE__*/React.createElement(Footer, null));
}
function NetworkPage() {
  const {
    t
  } = useLang();
  const N = SITE.network;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHero, {
    num: N.num,
    pillar: N.pillar,
    title: N.title,
    subtitle: N.subtitle,
    rings: [{
      top: "15%",
      left: "5%",
      width: 180,
      height: 180,
      opacity: .15
    }, {
      top: "25%",
      right: "8%",
      width: 300,
      height: 300,
      opacity: .1
    }]
  }), /*#__PURE__*/React.createElement(Overview, {
    eyebrow: N.overview,
    text: N.content
  }), /*#__PURE__*/React.createElement(Section, null, /*#__PURE__*/React.createElement(SectionHead, {
    eyebrow: t(N.pillarsEyebrow),
    title: t(N.pillarsTitle)
  }), /*#__PURE__*/React.createElement(FeatureRows, {
    items: N.features
  })), /*#__PURE__*/React.createElement(Section, {
    tinted: true
  }, /*#__PURE__*/React.createElement(SectionHead, {
    eyebrow: t(N.hubsEyebrow),
    title: t(N.hubsTitle)
  }), /*#__PURE__*/React.createElement(TileGrid, {
    columns: 4,
    minWidth: 150
  }, N.hubs.map((h, i) => /*#__PURE__*/React.createElement(Reveal, {
    key: i,
    delay: i * .05,
    style: {
      display: "flex"
    }
  }, /*#__PURE__*/React.createElement(Card, {
    variant: "tile",
    interactive: true,
    padding: 32,
    style: {
      flex: 1,
      alignItems: "center",
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "globe",
    size: 16,
    style: {
      color: "var(--text-muted)",
      marginBottom: 12
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      fontWeight: 500
    }
  }, t(h.city)), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "4px 0 0",
      fontSize: 12,
      color: "var(--text-muted)"
    }
  }, t(h.region))))))), /*#__PURE__*/React.createElement(Section, null, /*#__PURE__*/React.createElement(TileGrid, {
    columns: 3,
    minWidth: 240
  }, N.metrics.map((m, i) => /*#__PURE__*/React.createElement(Reveal, {
    key: i,
    delay: i * .1,
    style: {
      display: "flex"
    }
  }, /*#__PURE__*/React.createElement(Card, {
    variant: "tile",
    interactive: true,
    padding: 48,
    style: {
      flex: 1,
      alignItems: "center",
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: m.icon,
    size: 20,
    style: {
      color: "var(--text-muted)",
      marginBottom: 20
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 28,
      fontWeight: 300,
      letterSpacing: "-.02em",
      marginBottom: 8
    }
  }, t(m.num)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 500,
      marginBottom: 16
    }
  }, t(m.label)), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 12,
      lineHeight: 1.6,
      color: "var(--text-muted)"
    }
  }, t(m.desc))))))), /*#__PURE__*/React.createElement(CtaSection, {
    title: N.ctaTitle,
    label: N.ctaLabel,
    href: "/business"
  }), /*#__PURE__*/React.createElement(Footer, null));
}
function Accordion({
  items
}) {
  const {
    t
  } = useLang();
  const [open, setOpen] = React.useState(null);
  return /*#__PURE__*/React.createElement("div", {
    className: "rows"
  }, items.map((d, i) => {
    const on = open === i;
    return /*#__PURE__*/React.createElement(Reveal, {
      key: i,
      delay: i * .08
    }, /*#__PURE__*/React.createElement("div", {
      className: "acc",
      onClick: () => setOpen(on ? null : i),
      role: "button",
      "aria-expanded": on
    }, /*#__PURE__*/React.createElement("div", {
      className: "acc-head"
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 14,
        fontWeight: 500
      }
    }, t(d.label)), /*#__PURE__*/React.createElement("span", {
      className: "acc-plus",
      style: {
        transform: on ? "rotate(45deg)" : "none"
      }
    }, "+")), /*#__PURE__*/React.createElement("div", {
      className: "acc-body",
      style: {
        maxHeight: on ? 400 : 0,
        opacity: on ? 1 : 0
      }
    }, /*#__PURE__*/React.createElement("p", {
      style: {
        margin: 0,
        paddingBottom: 24,
        fontSize: 14,
        lineHeight: 1.6,
        color: "var(--text-muted)"
      }
    }, t(d.value)))));
  }));
}
function LabsPage() {
  const {
    t
  } = useLang();
  const L = SITE.labs;
  const icons = ["database", "map-pin", "users"];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHero, {
    num: L.num,
    pillar: L.pillar,
    title: L.title,
    subtitle: L.subtitle,
    rings: [{
      top: "18%",
      right: "12%",
      width: 200,
      height: 200,
      opacity: .15
    }, {
      bottom: "20%",
      left: "5%",
      width: 120,
      height: 120,
      opacity: .1
    }]
  }), /*#__PURE__*/React.createElement(Overview, {
    eyebrow: L.overview,
    text: L.content
  }), L.items.map((lab, idx) => /*#__PURE__*/React.createElement(Section, {
    key: lab.num
  }, /*#__PURE__*/React.createElement("div", {
    className: "split-5-7"
  }, /*#__PURE__*/React.createElement(Reveal, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 16,
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "room-num big"
  }, lab.num), /*#__PURE__*/React.createElement(Icon, {
    name: icons[idx],
    size: 20,
    style: {
      color: "var(--text-muted)"
    }
  })), /*#__PURE__*/React.createElement("h2", {
    className: "h2",
    style: {
      marginBottom: 16
    }
  }, t(lab.title)), /*#__PURE__*/React.createElement("p", {
    className: "lead",
    style: {
      marginBottom: 24,
      fontSize: 16
    }
  }, t(lab.subtitle)), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      lineHeight: 1.6,
      color: "var(--text-body)",
      opacity: .8
    }
  }, t(lab.content))), /*#__PURE__*/React.createElement(Accordion, {
    items: lab.details
  })))), /*#__PURE__*/React.createElement(CtaSection, {
    eyebrow: L.philosophy.eyebrow,
    title: L.philosophy.title,
    content: L.philosophy.content,
    label: L.philosophy.cta,
    href: "/about"
  }), /*#__PURE__*/React.createElement(Footer, null));
}
function AboutPage() {
  const {
    t,
    lang
  } = useLang();
  const Ab = SITE.about,
    Pt = SITE.partners;
  const [open, setOpen] = React.useState(null);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHero, {
    pillar: Ab.eyebrow,
    title: Ab.title
  }), /*#__PURE__*/React.createElement(Overview, {
    eyebrow: Ab.mission,
    text: Ab.content
  }), /*#__PURE__*/React.createElement(StatsStrip, {
    stats: Ab.stats
  }), /*#__PURE__*/React.createElement(Section, {
    size: "narrow",
    borderTop: false
  }, /*#__PURE__*/React.createElement(SectionHead, {
    eyebrow: t(Ab.profileEyebrow),
    title: t(Ab.profileTitle)
  }), /*#__PURE__*/React.createElement("div", {
    className: "rows"
  }, Ab.profile.map((it, i) => /*#__PURE__*/React.createElement(Reveal, {
    key: i,
    delay: i * .05
  }, /*#__PURE__*/React.createElement("div", {
    className: "row-12 profile-row"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 500
    }
  }, t(it.label)), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      lineHeight: 1.6,
      color: "var(--text-muted)"
    }
  }, t(it.value))))))), /*#__PURE__*/React.createElement(Section, null, /*#__PURE__*/React.createElement(SectionHead, {
    eyebrow: t(Ab.networkEyebrow),
    title: t(Ab.networkTitle),
    right: /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 12,
        letterSpacing: "var(--ls-track-md)",
        textTransform: "uppercase",
        color: "var(--text-muted)"
      }
    }, Ab.locations.length, lang === "zh" ? " " : "", t(Ab.nodes))
  }), /*#__PURE__*/React.createElement(Reveal, {
    delay: .2
  }, /*#__PURE__*/React.createElement("div", {
    className: "map-slot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "map-note"
  }, lang === "zh" ? "世界地圖（WorldMap.tsx）— 在此處放置地圖；節點見下方" : "World map (WorldMap.tsx) — place the map here; nodes listed below"), Ab.locations.map((l, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    className: "map-dot",
    style: {
      left: `${(l.lng + 180) / 360 * 100}%`,
      top: `${(90 - l.lat) / 180 * 100}%`
    },
    title: t(l.city)
  })))), /*#__PURE__*/React.createElement(TileGrid, {
    minWidth: 120,
    style: {
      borderTop: 0
    }
  }, Ab.locations.map((l, i) => /*#__PURE__*/React.createElement(Card, {
    key: i,
    variant: "tile",
    padding: 20,
    style: {
      alignItems: "center",
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot static"
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 12,
      fontWeight: 500
    }
  }, t(l.city)), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "4px 0 0",
      fontSize: 10,
      color: "var(--text-muted)"
    }
  }, t(l.region)))))), /*#__PURE__*/React.createElement(Section, null, /*#__PURE__*/React.createElement(Reveal, {
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, {
    style: {
      marginBottom: 24
    }
  }, t(Pt.aboutEyebrow)), /*#__PURE__*/React.createElement("h2", {
    className: "h2",
    style: {
      marginBottom: 24
    }
  }, t(Pt.title)), /*#__PURE__*/React.createElement("p", {
    className: "body muted",
    style: {
      maxWidth: 672
    }
  }, t(Pt.aboutIntro))), /*#__PURE__*/React.createElement("div", {
    className: "rows",
    style: {
      marginTop: 64
    }
  }, Pt.list.map((p, i) => {
    const on = open === i;
    return /*#__PURE__*/React.createElement(Reveal, {
      key: i,
      delay: i * .04
    }, /*#__PURE__*/React.createElement("div", {
      className: "partner",
      onClick: () => setOpen(on ? null : i),
      role: "button",
      "aria-expanded": on
    }, /*#__PURE__*/React.createElement("div", {
      className: "partner-row"
    }, /*#__PURE__*/React.createElement("span", {
      className: "row-num"
    }, String(i + 1).padStart(2, "0")), /*#__PURE__*/React.createElement("div", {
      className: "initial small"
    }, p.name.en[0]), /*#__PURE__*/React.createElement("h3", {
      style: {
        margin: 0,
        fontSize: 18,
        fontWeight: 500,
        letterSpacing: "-.02em"
      }
    }, t(p.name)), /*#__PURE__*/React.createElement(Badge, null, t(Pt.categories[p.category] || p.category)), /*#__PURE__*/React.createElement(Icon, {
      name: "chevron-down",
      size: 14,
      style: {
        color: "var(--text-muted)",
        justifySelf: "end",
        transform: on ? "rotate(180deg)" : "none",
        transition: "transform .3s"
      }
    })), /*#__PURE__*/React.createElement("div", {
      className: "acc-body",
      style: {
        maxHeight: on ? 400 : 0,
        opacity: on ? 1 : 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "partner-detail"
    }, /*#__PURE__*/React.createElement("p", {
      style: {
        margin: "0 0 24px",
        fontSize: 14,
        lineHeight: 1.8,
        color: "var(--text-muted)"
      }
    }, t(p.desc)), /*#__PURE__*/React.createElement("a", {
      href: p.url,
      target: "_blank",
      rel: "noopener noreferrer",
      onClick: e => e.stopPropagation(),
      className: "inline-link strong"
    }, t(Pt.visit), /*#__PURE__*/React.createElement(Icon, {
      name: "external-link",
      size: 12
    }))))));
  }))), /*#__PURE__*/React.createElement(CtaSection, {
    title: Ab.ctaTitle,
    email: Ab.email
  }), /*#__PURE__*/React.createElement(Footer, null));
}
Object.assign(window, {
  ProtocolPage,
  NetworkPage,
  LabsPage,
  AboutPage
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/pages.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/shell.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const DS = window.TableAIDesignSystem_f48f27;
const {
  Eyebrow,
  Button,
  Icon,
  Divider
} = DS;

/* ── Language context: t(B) picks {zh,en} by current lang (falls back like LanguageContext.tsx) ── */
const LangContext = React.createContext({
  lang: "en",
  t: b => typeof b === "string" ? b : b.en
});
function useLang() {
  return React.useContext(LangContext);
}
function LangProvider({
  lang,
  children
}) {
  const t = React.useCallback(b => b == null ? "" : typeof b === "string" ? b : (lang === "en" ? b.en || b.zh : b.zh || b.en) || "", [lang]);
  return /*#__PURE__*/React.createElement(LangContext.Provider, {
    value: {
      lang,
      t
    }
  }, children);
}

/* ── Router context (hash based) ── */
const RouteContext = React.createContext({
  path: "/",
  go: () => {}
});
function useRoute() {
  return React.useContext(RouteContext);
}
function A({
  href,
  children,
  className,
  style,
  ...rest
}) {
  const {
    go
  } = useRoute();
  return /*#__PURE__*/React.createElement("a", _extends({
    href: "#" + href,
    className: className,
    style: style,
    onClick: e => {
      e.preventDefault();
      go(href);
    }
  }, rest), children);
}

/* ── Scroll reveal (framer-motion useInView → IntersectionObserver, once) ── */
function Reveal({
  children,
  delay = 0,
  className = "",
  style
}) {
  const ref = React.useRef(null);
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      setOn(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setOn(true);
        io.disconnect();
      }
    }, {
      rootMargin: "-60px 0px"
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    className: className,
    style: {
      opacity: on ? 1 : 0,
      transform: on ? "none" : "translateY(50px)",
      filter: on ? "none" : "blur(6px)",
      transition: `opacity .8s var(--ease-standard) ${delay}s, transform .8s var(--ease-standard) ${delay}s, filter .8s var(--ease-standard) ${delay}s`,
      ...style
    }
  }, children);
}
function Container({
  size = "default",
  children,
  className = "",
  style
}) {
  const w = {
    wide: 1152,
    default: 1152,
    narrow: 1024,
    text: 896,
    cta: 896
  }[size] || 1152;
  return /*#__PURE__*/React.createElement("div", {
    className: "container " + className,
    style: {
      maxWidth: w,
      ...style
    }
  }, children);
}
function Section({
  children,
  tinted = false,
  gridBg = false,
  borderTop = true,
  size = "default",
  className = "",
  style,
  pad = "lg"
}) {
  return /*#__PURE__*/React.createElement("section", {
    className: `section section-${pad} ${tinted ? "tinted" : ""} ${borderTop ? "bt" : ""} ${className}`,
    style: style
  }, gridBg ? /*#__PURE__*/React.createElement("div", {
    className: "grid-bg",
    "aria-hidden": "true"
  }) : null, /*#__PURE__*/React.createElement(Container, {
    size: size,
    style: {
      position: "relative",
      zIndex: 1
    }
  }, children));
}

/* Section header: eyebrow + light h2 (+ optional right slot) */
function SectionHead({
  eyebrow,
  title,
  right,
  children,
  mb = 64
}) {
  return /*#__PURE__*/React.createElement(Reveal, {
    style: {
      marginBottom: mb
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: 24,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("div", null, eyebrow ? /*#__PURE__*/React.createElement(Eyebrow, {
    style: {
      marginBottom: 24
    }
  }, eyebrow) : null, title ? /*#__PURE__*/React.createElement("h2", {
    className: "h2"
  }, title) : null, children), right));
}

/* Sub-page hero (Protocol/Network/Labs/About): back link, "01 — pillar", light h1, subtitle */
function PageHero({
  num,
  pillar,
  title,
  subtitle,
  rings = []
}) {
  const {
    t
  } = useLang();
  return /*#__PURE__*/React.createElement("section", {
    className: "page-hero"
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid-bg",
    style: {
      opacity: .3
    },
    "aria-hidden": "true"
  }), rings.map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "ring",
    style: r,
    "aria-hidden": "true"
  })), /*#__PURE__*/React.createElement(Container, {
    style: {
      position: "relative",
      zIndex: 1
    }
  }, /*#__PURE__*/React.createElement(Reveal, null, /*#__PURE__*/React.createElement(A, {
    href: "/",
    className: "back"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-left",
    size: 16
  }), t(SITE.common.back))), /*#__PURE__*/React.createElement(Reveal, {
    delay: .1
  }, /*#__PURE__*/React.createElement(Eyebrow, {
    number: num,
    style: {
      marginBottom: 24
    }
  }, t(pillar))), /*#__PURE__*/React.createElement(Reveal, {
    delay: .2
  }, /*#__PURE__*/React.createElement("h1", {
    className: "h1-sub"
  }, t(title))), subtitle ? /*#__PURE__*/React.createElement(Reveal, {
    delay: .3
  }, /*#__PURE__*/React.createElement("p", {
    className: "lead",
    style: {
      marginTop: 32
    }
  }, t(subtitle))) : null));
}

/* Sticky eyebrow + large light paragraph (4/8 split) */
function Overview({
  eyebrow,
  text
}) {
  const {
    t
  } = useLang();
  return /*#__PURE__*/React.createElement(Section, {
    size: "narrow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "split-4-8"
  }, /*#__PURE__*/React.createElement(Reveal, null, /*#__PURE__*/React.createElement(Eyebrow, {
    style: {
      position: "sticky",
      top: 128
    }
  }, t(eyebrow))), /*#__PURE__*/React.createElement(Reveal, {
    delay: .15
  }, /*#__PURE__*/React.createElement("p", {
    className: "overview"
  }, t(text)))));
}

/* Numbered rows: 01 / title / description, hairline divided */
function FeatureRows({
  items
}) {
  const {
    t
  } = useLang();
  return /*#__PURE__*/React.createElement("div", {
    className: "rows"
  }, items.map((f, i) => /*#__PURE__*/React.createElement(Reveal, {
    key: i,
    delay: i * .08
  }, /*#__PURE__*/React.createElement("div", {
    className: "row-12 feature-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "row-num"
  }, String(i + 1).padStart(2, "0")), /*#__PURE__*/React.createElement("h3", {
    className: "row-title"
  }, t(f.title)), /*#__PURE__*/React.createElement("p", {
    className: "row-desc"
  }, t(f.content ?? f.desc))))));
}

/* Closing CTA. `gold` marks the page's single conversion action (Sundial Gold). */
function CtaSection({
  eyebrow,
  title,
  content,
  label,
  href,
  gold = false,
  email
}) {
  const {
    t
  } = useLang();
  return /*#__PURE__*/React.createElement(Section, {
    gridBg: true,
    size: "cta",
    pad: "xl",
    style: {
      textAlign: "center"
    }
  }, eyebrow ? /*#__PURE__*/React.createElement(Reveal, null, /*#__PURE__*/React.createElement(Eyebrow, {
    align: "center",
    style: {
      marginBottom: 40
    }
  }, t(eyebrow))) : null, /*#__PURE__*/React.createElement(Reveal, {
    delay: .15
  }, /*#__PURE__*/React.createElement("h2", {
    className: "h2-cta"
  }, t(title))), /*#__PURE__*/React.createElement(Reveal, {
    delay: .3
  }, /*#__PURE__*/React.createElement(Divider, {
    variant: gold ? "gold" : "accent",
    width: gold ? 64 : 48,
    align: "center",
    style: {
      margin: "32px auto",
      opacity: gold ? 1 : .3
    }
  })), content ? /*#__PURE__*/React.createElement(Reveal, {
    delay: .4
  }, /*#__PURE__*/React.createElement("p", {
    className: "lead",
    style: {
      margin: "0 auto 40px",
      maxWidth: 640
    }
  }, t(content))) : null, email ? /*#__PURE__*/React.createElement(Reveal, {
    delay: .25
  }, /*#__PURE__*/React.createElement("p", {
    className: "lead",
    style: {
      margin: 0
    }
  }, email)) : null, label ? /*#__PURE__*/React.createElement(Reveal, {
    delay: .5
  }, /*#__PURE__*/React.createElement(Button, {
    as: A,
    href: href,
    variant: gold ? "cta" : "primary",
    size: "lg",
    iconRight: "arrow-right",
    style: {
      height: 56,
      padding: "0 40px"
    }
  }, t(label))) : null);
}
function Footer() {
  const {
    t
  } = useLang();
  const F = SITE.footer;
  return /*#__PURE__*/React.createElement("footer", {
    className: "footer"
  }, /*#__PURE__*/React.createElement(Container, null, /*#__PURE__*/React.createElement("div", {
    className: "footer-grid"
  }, /*#__PURE__*/React.createElement(Reveal, {
    className: "footer-brand"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo/tableai-a2a-mark.svg",
    alt: "TABLE AI",
    style: {
      height: 22,
      width: "auto"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 500,
      letterSpacing: ".1em"
    }
  }, "TABLE AI")), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      lineHeight: 1.6,
      color: "var(--text-muted)",
      maxWidth: 384
    }
  }, t(F.tagline)), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "16px 0 0",
      fontSize: 12,
      color: "var(--text-subtle)"
    }
  }, t(F.cities))), F.columns.map((col, ci) => /*#__PURE__*/React.createElement(Reveal, {
    key: ci,
    delay: (ci + 1) * .1,
    className: "footer-col"
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "0 0 20px",
      fontSize: 12,
      letterSpacing: "var(--ls-track-lg)",
      textTransform: "uppercase",
      color: "var(--text-muted)"
    }
  }, t(col.title)), /*#__PURE__*/React.createElement("ul", {
    style: {
      listStyle: "none",
      margin: 0,
      padding: 0,
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, col.links.map((l, li) => /*#__PURE__*/React.createElement("li", {
    key: li
  }, /*#__PURE__*/React.createElement(A, {
    href: l.href,
    className: "footer-link"
  }, t(l.label)))))))), /*#__PURE__*/React.createElement("div", {
    className: "footer-bottom"
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 12,
      color: "var(--text-subtle)"
    }
  }, t(F.copyright)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 24
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    className: "footer-link small"
  }, t(F.privacy)), /*#__PURE__*/React.createElement("a", {
    href: "#",
    className: "footer-link small"
  }, t(F.terms))))));
}
Object.assign(window, {
  LangProvider,
  useLang,
  RouteContext,
  useRoute,
  A,
  Reveal,
  Container,
  Section,
  SectionHead,
  PageHero,
  Overview,
  FeatureRows,
  CtaSection,
  Footer
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/shell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/studio-content.jsx
try { (() => {
// Expert-AI Studio copy — from the Table AI seed business plan (Oct 2026). 中文 in 繁體 (Hong Kong usage). Every string is {zh, en}.
SITE.studio = {
  num: "00",
  eyebrow: B("專家 AI 工作室", "Expert-AI Studio"),
  tagline: B("把行業專家的判斷路徑，轉化為企業可部署的 AI 智能體、訓練與評測數據，以及可問責的決策基準", "Turning industry experts' decision paths into deployable enterprise AI agents, training and evaluation data, and accountable decision benchmarks"),
  cta1: B("了解專家 AI 產品", "Explore Expert-AI Products"),
  pageTitle: B("把專家判斷變成可部署、可問責的 AI", "Turning Expert Judgement into Deployable, Accountable AI"),
  overview: B("工作室概述", "Studio Overview"),
  overviewText: B("Table AI 是一家專家 AI 工作室：把行業專家的判斷路徑，轉化為企業可部署的 AI 智能體、訓練與評測數據，以及可問責的決策基準。模式已在餐飲行業的侍天跑通，正複制到金融 IT 等高價值行業。", "Table AI is an Expert-AI Studio: it turns industry experts' decision paths into deployable enterprise AI agents, training and evaluation data, and accountable decision benchmarks. The model has been proven in the restaurant industry through Tiansight and is being replicated in high-value sectors such as financial IT."),
  problem: {
    eyebrow: B("問題與時機", "Problem & Timing"),
    title: B("企業 AI 落地卡在三個環節", "Enterprise AI Adoption Stalls at Three Points"),
    items: [{
      label: B("環節 01", "Point 01"),
      title: B("模型不會做專業判斷", "Models Cannot Make Professional Judgements"),
      desc: B("通用大模型在專業場景會產生幻覺。", "General-purpose models hallucinate in professional scenarios.")
    }, {
      label: B("環節 02", "Point 02"),
      title: B("決策無法審計", "Decisions Cannot Be Audited"),
      desc: B("企業內部的專家經驗從未被結構化，無法變成訓練數據或評測標準。", "Expert experience inside the enterprise has never been structured, so it cannot become training data or evaluation standards.")
    }, {
      label: B("環節 03", "Point 03"),
      title: B("沒有人為結果負責", "No One Is Accountable for the Outcome"),
      desc: B("算法無法承擔專業責任。", "Algorithms cannot carry professional accountability.")
    }]
  },
  products: {
    eyebrow: B("產品與解決方案", "Products & Solutions"),
    title: B("一位專家的決策路徑，三種可重複銷售的產品", "One Expert's Decision Path, Three Repeatable Products"),
    intro: B("每一件產品都由具名專家簽核，解決「算法無法承擔專業責任」的問題。", "Every product is signed off by a named expert, addressing the problem that algorithms cannot carry professional accountability."),
    buyers: B("買家", "Buyers"),
    proto: B("已驗證的原型", "Validated Prototype"),
    viewAll: B("查看工作室", "View the Studio"),
    items: [{
      num: "01",
      title: B("專家智能體", "Expert Agent"),
      desc: B("以專家決策路徑構建的垂直智能體，專家在環中簽核（Human-in-the-loop）。", "Vertical agents built on expert decision paths, with expert sign-off in the loop (Human-in-the-loop)."),
      buyers: B("企業業務部門、連鎖品牌", "Enterprise business units, chain brands"),
      proto: B("侍天「第二大腦」經營分析系統", "Tiansight 'Second Brain' operations analytics system")
    }, {
      num: "02",
      title: B("專家數據與評分標準", "Expert Data & Rubrics"),
      desc: B("SFT / RL 數據、決策規則、繁簡中英三語語料。", "SFT / RL data, decision rules, and Traditional Chinese, Simplified Chinese and English corpora."),
      buyers: B("垂直模型團隊、實驗室", "Vertical model teams, labs"),
      proto: B("菜單與門店經營診斷規則庫", "Menu and store-operations diagnostic rule base")
    }, {
      num: "03",
      title: B("專家評測集", "Expert Evals"),
      desc: B("可審計的行業評測基準，用於智能體驗收與合規審查。", "Auditable industry benchmarks for agent acceptance and compliance review."),
      buyers: B("金融機構、監管合規部門", "Financial institutions, regulatory compliance departments"),
      proto: B("7 天經營診斷報告流程", "7-day operations diagnostic report process")
    }]
  },
  method: {
    eyebrow: B("方法論與技術路線", "Methodology & Technology"),
    title: B("從隱性經驗到機器可讀的規則", "From Tacit Experience to Machine-Readable Rules"),
    items: [{
      title: B("L.I.D. 引導式教練體系", "L.I.D. Guided Coaching System"),
      content: B("專家知識的提取採用創始人在 EHL 高管培訓中建立的 L.I.D. 引導式教練體系：用結構化訪談與案例復盤，把專家「為什麼這樣判斷」寫成機器可讀的規則與反例。", "Expert knowledge is extracted with the L.I.D. guided coaching system the founder built in EHL executive education: structured interviews and case reviews turn why an expert judges the way they do into machine-readable rules and counter-examples.")
    }, {
      title: B("規模化驗證", "Proven at Scale"),
      content: B("團隊此前完成過約 200 萬字的課程本地化，證明這套方法能規模化。", "The team previously localised around two million characters of course material, demonstrating that the method scales.")
    }, {
      title: B("不自研基礎模型", "No Proprietary Foundation Model"),
      content: B("在通用模型（DeepSeek、通義、Claude 等）之上搭建智能體編排、評測工具鏈與專家簽核工作流，對接客戶現有平台。", "Agent orchestration, evaluation tooling and expert sign-off workflows are built on general-purpose models (DeepSeek, Tongyi, Claude and others) and connected to customers' existing platforms.")
    }, {
      title: B("可追溯的問責回路", "Traceable Accountability Loop"),
      content: B("專家的決策路徑經知識提取後分流為三種產品，交付給企業客戶；客戶端的每份輸出都回到具名專家簽核。", "After knowledge extraction, an expert's decision path branches into three products delivered to enterprise customers; every output on the customer side returns to a named expert for sign-off.")
    }]
  },
  ladder: {
    eyebrow: B("商業模式", "Business Model"),
    title: B("收費階梯", "Pricing Ladder"),
    intro: B("先以診斷建立信任，再以月費陪跑鎖定續約，最後以智能體部署加成效分成放大單客價值。", "Diagnosis builds trust, monthly coaching secures renewal, and agent deployment with an outcome fee expands the value of each customer."),
    items: [{
      num: "01",
      title: B("診斷 / 評測", "Diagnosis / Evaluation"),
      term: B("一次性，4–8 週", "One-off, 4–8 weeks")
    }, {
      num: "02",
      title: B("陪跑 / 數據訂閱", "Coaching / Data Subscription"),
      term: B("年度訂閱", "Annual subscription")
    }, {
      num: "03",
      title: B("智能體部署 + 成效分成", "Agent Deployment + Outcome Fee"),
      term: B("多年框架協議", "Multi-year framework agreement")
    }]
  },
  tiansight: {
    eyebrow: B("早期驗證", "Early Validation"),
    title: B("侍天：已跑通的模式", "Tiansight: A Proven Model"),
    content: B("侍天是 Table AI 在餐飲行業的專家 AI 原型。入口是菜單設計與經營數據分析，客戶提交 6 個月經營數據後 7 天內取得診斷報告，再進入月度復盤陪跑或「第二大腦」系統。", "Tiansight is Table AI's Expert-AI prototype in the restaurant industry. The entry point is menu design and operations data analysis: customers submit six months of operating data and receive a diagnostic report within seven days, then move into monthly review coaching or the 'Second Brain' system."),
    brandsLabel: B("合作品牌", "Partner Brands"),
    brands: ["石頭先生的漢堡", "蘇幫袁", "潮發潮汕牛肉", "吳裕泰", "清水亭", "3699 河鮮小館", "遊園京夢", "韻 1980 新派淮揚菜"],
    url: "https://tiansight.apuch.cn",
    visit: B("訪問侍天", "Visit Tiansight")
  },
  ctaTitle: B("探索 OPC Global 專家網絡", "Explore the OPC Global Expert Network"),
  ctaLabel: B("了解網絡", "Discover the Network")
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/studio-content.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/studio.jsx
try { (() => {
const {
  Eyebrow: SEyebrow,
  Card: SCard,
  TileGrid: STileGrid,
  Icon: SIcon,
  Tag: STag
} = window.TableAIDesignSystem_f48f27;
function StudioProblem() {
  const {
    t
  } = useLang();
  const P = SITE.studio.problem;
  return /*#__PURE__*/React.createElement(Section, {
    pad: "xl",
    borderTop: false
  }, /*#__PURE__*/React.createElement(SectionHead, {
    eyebrow: t(P.eyebrow),
    title: t(P.title)
  }), /*#__PURE__*/React.createElement(STileGrid, {
    columns: 3,
    minWidth: 260
  }, P.items.map((it, i) => /*#__PURE__*/React.createElement(SCard, {
    key: i,
    variant: "tile",
    padding: 40,
    eyebrow: t(it.label),
    title: /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 500
      }
    }, t(it.title)),
    description: t(it.desc)
  }))));
}
function StudioProducts({
  link = true
}) {
  const {
    t
  } = useLang();
  const P = SITE.studio.products;
  return /*#__PURE__*/React.createElement(Section, {
    tinted: true,
    pad: "xl"
  }, /*#__PURE__*/React.createElement(SectionHead, {
    eyebrow: t(P.eyebrow),
    title: t(P.title),
    right: link ? /*#__PURE__*/React.createElement(A, {
      href: "/studio",
      className: "inline-link"
    }, t(P.viewAll), /*#__PURE__*/React.createElement(SIcon, {
      name: "arrow-right",
      size: 14
    })) : null
  }, /*#__PURE__*/React.createElement("p", {
    className: "lead",
    style: {
      maxWidth: 672,
      marginTop: 24
    }
  }, t(P.intro))), /*#__PURE__*/React.createElement("div", {
    className: "cards-3"
  }, P.items.map((it, i) => /*#__PURE__*/React.createElement(Reveal, {
    key: i,
    delay: i * .12,
    style: {
      display: "flex"
    }
  }, /*#__PURE__*/React.createElement(SCard, {
    interactive: true,
    padding: 40,
    style: {
      flex: 1,
      minHeight: 360
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "room-num",
    style: {
      marginBottom: 24,
      display: "block"
    }
  }, it.num), /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: "0 0 12px",
      fontSize: 20,
      fontWeight: 500,
      letterSpacing: "-.02em"
    }
  }, t(it.title)), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "0 0 32px",
      fontSize: 14,
      lineHeight: 1.6,
      color: "var(--text-muted)"
    }
  }, t(it.desc)), /*#__PURE__*/React.createElement("dl", {
    style: {
      margin: "auto 0 0",
      display: "grid",
      gap: 16,
      paddingTop: 24,
      borderTop: "1px solid var(--border)"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("dt", {
    className: "row-num",
    style: {
      textTransform: "uppercase",
      marginBottom: 6
    }
  }, t(P.buyers)), /*#__PURE__*/React.createElement("dd", {
    style: {
      margin: 0,
      fontSize: 13,
      lineHeight: 1.5
    }
  }, t(it.buyers))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("dt", {
    className: "row-num",
    style: {
      textTransform: "uppercase",
      marginBottom: 6
    }
  }, t(P.proto)), /*#__PURE__*/React.createElement("dd", {
    style: {
      margin: 0,
      fontSize: 13,
      lineHeight: 1.5
    }
  }, t(it.proto)))))))));
}
function StudioTiansight() {
  const {
    t
  } = useLang();
  const T = SITE.studio.tiansight;
  return /*#__PURE__*/React.createElement(Section, {
    pad: "xl"
  }, /*#__PURE__*/React.createElement("div", {
    className: "split-5-7"
  }, /*#__PURE__*/React.createElement(Reveal, null, /*#__PURE__*/React.createElement(SEyebrow, {
    style: {
      marginBottom: 24
    }
  }, t(T.eyebrow)), /*#__PURE__*/React.createElement("h2", {
    className: "h2 big",
    style: {
      marginBottom: 32
    }
  }, t(T.title)), /*#__PURE__*/React.createElement("a", {
    href: T.url,
    target: "_blank",
    rel: "noopener noreferrer",
    className: "inline-link strong"
  }, t(T.visit), /*#__PURE__*/React.createElement(SIcon, {
    name: "arrow-up-right",
    size: 14
  }))), /*#__PURE__*/React.createElement(Reveal, {
    delay: .15
  }, /*#__PURE__*/React.createElement("p", {
    className: "overview",
    style: {
      marginBottom: 48
    }
  }, t(T.content)), /*#__PURE__*/React.createElement(SEyebrow, {
    style: {
      marginBottom: 20
    }
  }, t(T.brandsLabel)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 8
    }
  }, T.brands.map(b => /*#__PURE__*/React.createElement(STag, {
    key: b,
    size: "sm"
  }, b))))));
}
function StudioPage() {
  const {
    t
  } = useLang();
  const S = SITE.studio;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHero, {
    num: S.num,
    pillar: S.eyebrow,
    title: S.pageTitle,
    subtitle: S.tagline,
    rings: [{
      top: "18%",
      right: "10%",
      width: 260,
      height: 260,
      opacity: .15
    }]
  }), /*#__PURE__*/React.createElement(Overview, {
    eyebrow: S.overview,
    text: S.overviewText
  }), /*#__PURE__*/React.createElement(StudioProblem, null), /*#__PURE__*/React.createElement(StudioProducts, {
    link: false
  }), /*#__PURE__*/React.createElement(Section, null, /*#__PURE__*/React.createElement(SectionHead, {
    eyebrow: t(S.method.eyebrow),
    title: t(S.method.title)
  }), /*#__PURE__*/React.createElement(FeatureRows, {
    items: S.method.items
  })), /*#__PURE__*/React.createElement(Section, {
    tinted: true
  }, /*#__PURE__*/React.createElement(SectionHead, {
    eyebrow: t(S.ladder.eyebrow),
    title: t(S.ladder.title)
  }, /*#__PURE__*/React.createElement("p", {
    className: "lead",
    style: {
      maxWidth: 672,
      marginTop: 24
    }
  }, t(S.ladder.intro))), /*#__PURE__*/React.createElement(STileGrid, {
    columns: 3,
    minWidth: 240
  }, S.ladder.items.map((it, i) => /*#__PURE__*/React.createElement(Reveal, {
    key: i,
    delay: i * .12,
    style: {
      display: "flex"
    }
  }, /*#__PURE__*/React.createElement(SCard, {
    variant: "tile",
    padding: 40,
    number: it.num,
    title: t(it.title),
    description: t(it.term),
    style: {
      flex: 1,
      minHeight: 220
    }
  }))))), /*#__PURE__*/React.createElement(StudioTiansight, null), /*#__PURE__*/React.createElement(CtaSection, {
    title: S.ctaTitle,
    label: S.ctaLabel,
    href: "/network"
  }), /*#__PURE__*/React.createElement(Footer, null));
}
Object.assign(window, {
  StudioProblem,
  StudioProducts,
  StudioTiansight,
  StudioPage
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/studio.jsx", error: String((e && e.message) || e) }); }

__ds_ns.ChatComposer = __ds_scope.ChatComposer;

__ds_ns.ChatMessage = __ds_scope.ChatMessage;

__ds_ns.Accordion = __ds_scope.Accordion;

__ds_ns.PersonCard = __ds_scope.PersonCard;

__ds_ns.Quote = __ds_scope.Quote;

__ds_ns.Steps = __ds_scope.Steps;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.FieldLabel = __ds_scope.FieldLabel;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Radio = __ds_scope.Radio;

__ds_ns.RadioGroup = __ds_scope.RadioGroup;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Textarea = __ds_scope.Textarea;

__ds_ns.BarChart = __ds_scope.BarChart;

__ds_ns.DataTable = __ds_scope.DataTable;

__ds_ns.DonutChart = __ds_scope.DonutChart;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.TileGrid = __ds_scope.TileGrid;

__ds_ns.Divider = __ds_scope.Divider;

__ds_ns.Eyebrow = __ds_scope.Eyebrow;

__ds_ns.Skeleton = __ds_scope.Skeleton;

__ds_ns.Stat = __ds_scope.Stat;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.Dialog = __ds_scope.Dialog;

__ds_ns.ConfirmDialog = __ds_scope.ConfirmDialog;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.ToastStack = __ds_scope.ToastStack;

__ds_ns.Tooltip = __ds_scope.Tooltip;

__ds_ns.ICON_PATHS = __ds_scope.ICON_PATHS;

__ds_ns.ICON_NAMES = __ds_scope.ICON_NAMES;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.NavBar = __ds_scope.NavBar;

__ds_ns.Tabs = __ds_scope.Tabs;

})();
