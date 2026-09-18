import { useId, useState } from "react";
import { ChevronDown, ChevronRight, Star, Volume2 } from "lucide-react";
import { highlightedSegments, termKey } from "./wordFamilies";
import "./wordFamily.css";

function Term({ item, roots }) {
  const text = roots ? item.display || item.term : item.term;
  return <span>{highlightedSegments(text, item.highlights || []).map((part, index) => <span key={index} className={part.highlight ? "family-highlight" : undefined}>{part.text}</span>)}</span>;
}

function FamilyRow({ item, current, roots, favorites, onFavorite, onSpeak }) {
  const [open, setOpen] = useState(current);
  const id = useId();
  const selected = favorites.has(item.id);
  const hasDetails = item.parts.length > 0 || item.memory || item.phrases?.length;
  return <li className={`family-row ${current ? "is-current" : ""}`}>
    <div className="family-heading">
      {hasDetails && <button type="button" className="family-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id} aria-label={`${open ? "收起" : "展开"} ${item.term} 构词详情`}>{open ? <ChevronDown /> : <ChevronRight />}</button>}
      <div className="family-heading-content">
        <button type="button" className="family-term-button" onClick={() => onSpeak(item.term)} aria-label={`朗读 ${item.term}`} title={`朗读 ${item.term}`}><strong><Term item={item} roots={roots} /></strong><Volume2 className="family-speaker" aria-hidden="true" /></button>
        <span className="family-inline-meaning">{item.pos && <span className="family-pos">{item.pos} </span>}{item.meaning}</span>
        {item.inBook && <span className="family-badge">{item.source || "词库"}</span>}
        {current && <span className="sr-only">当前单词</span>}
      </div>
      <button type="button" className={`family-star ${selected ? "is-saved" : ""}`} aria-label={`${selected ? "取消收藏" : "收藏"} ${item.term}`} aria-pressed={selected} onClick={() => onFavorite(item)}><Star aria-hidden="true" fill={selected ? "currentColor" : "none"} /></button>
    </div>
    {hasDetails && <div id={id} className="family-body" hidden={!open}>
      {item.parts.map((part, index) => <div className="family-explanation" key={`${part.part}-${index}`}><span className="family-label">{part.type}</span><p><strong>{part.part}</strong><span className="family-part-meaning">{part.meaning}</span></p></div>)}
      {item.memory && <div className="family-explanation"><span className="family-label">构词</span><p>{item.memory}</p></div>}
      {item.phrases?.map((phrase) => <div className="family-phrase" key={phrase.en}><button type="button" className="family-phrase-button" aria-label={`朗读 ${phrase.en}`} onClick={() => onSpeak(phrase.en)}>{phrase.en}<Volume2 aria-hidden="true" /></button><p>{phrase.zh}</p></div>)}
      {item.sourceUrl && <a className="family-source" href={item.sourceUrl} target="_blank" rel="noreferrer">词典 / 词源参考 ↗</a>}
    </div>}
  </li>;
}

export default function WordFamilyView({ mode, word, rows = [], groups = [], favorites, onFavorite, onSpeak }) {
  const renderRow = (item, groupId = "derivatives") => <FamilyRow key={`${word.id}-${groupId}-${item.id}`} item={item} current={termKey(item.term) === termKey(word.term)} roots={mode === "roots"} favorites={favorites} onFavorite={onFavorite} onSpeak={onSpeak} />;
  if (mode === "roots" && !groups.length) return <p className="family-empty">暂无可靠的词根词缀资料</p>;
  if (mode !== "roots" && !rows.length) return <p className="family-empty">暂无已收录的派生词</p>;
  return <div className="word-family-view">
    <p className="family-help">点击单词听发音 · 箭头展开构词含义</p>
    {mode === "roots" ? groups.map((group) => <section className="family-root-group" key={`${word.id}-${group.id}`} aria-label={group.title || "词根组"}>
      <h3 className="family-group-title">{group.title}</h3>
      {group.description && <p className="family-group-description">{group.description}</p>}
      <ul className="family-timeline">{group.words.map((item) => renderRow(item, group.id))}</ul>
    </section>) : <ul className="family-timeline">{rows.map((item) => renderRow(item))}</ul>}
  </div>;
}
