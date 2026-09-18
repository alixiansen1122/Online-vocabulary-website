import { useId, useState } from "react";
import { ChevronDown, ChevronRight, Star } from "lucide-react";
import { highlightedSegments, termKey } from "./wordFamilies";
import "./wordFamily.css";

function Term({ item, roots }) {
  const text = roots ? item.display || item.term : item.term;
  return <span aria-label={item.term}>{highlightedSegments(text, item.highlights || []).map((part, index) => <span key={index} className={part.highlight ? "family-highlight" : undefined}>{part.text}</span>)}</span>;
}

function Favorite({ item, favorites, onFavorite }) {
  const selected = favorites.has(item.id);
  return <button type="button" className={`family-star ${selected ? "is-saved" : ""}`} aria-label={`${selected ? "取消收藏" : "收藏"} ${item.term}`} aria-pressed={selected} onClick={() => onFavorite(item)}><Star aria-hidden="true" fill={selected ? "currentColor" : "none"} /></button>;
}

function Meaning({ item }) {
  return <p className="family-meaning">{item.pos && <span>{item.pos} </span>}{item.meaning}</p>;
}

function RootDetails({ item }) {
  return <>
    {item.parts.map((part, index) => <div className="family-explanation" key={`${part.part}-${index}`}><span className="family-label">{part.type}</span><p>{part.part} = {part.meaning}</p></div>)}
    {item.memory && <div className="family-explanation"><span className="family-label">记忆</span><p>{item.memory}</p></div>}
    {!item.parts.length && <Meaning item={item} />}
    {item.phrases?.map((phrase) => <div className="family-phrase" key={phrase.en}><p>{phrase.en}</p><p>{phrase.zh}</p></div>)}
    {item.sourceUrl && <a className="family-source" href={item.sourceUrl} target="_blank" rel="noreferrer">词源参考 ↗</a>}
  </>;
}

function DerivativeRow({ item, current, favorites, onFavorite }) {
  const [open, setOpen] = useState(true);
  const id = useId();
  return <li className={`family-row ${current ? "is-current" : ""}`}>
    <div className="family-heading">
      <button type="button" className="family-term-button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id} aria-label={`${open ? "收起" : "展开"} ${item.term} 派生释义`}>
        <span className="family-node">{current ? open ? <ChevronDown /> : <ChevronRight /> : <i />}</span>
        <strong><Term item={item} /></strong>
        {item.inBook && <span className="family-badge">{item.source || "词库"}</span>}
        {current && <span className="sr-only">当前单词</span>}
      </button>
      <Favorite item={item} favorites={favorites} onFavorite={onFavorite} />
    </div>
    <div id={id} className="family-body" hidden={!open}>
      <Meaning item={item} />
      {item.parts.filter((part) => part.type === "前缀" || part.type === "后缀").map((part) => <p className="family-affix-note" key={part.part}>{part.part} = {part.meaning}</p>)}
    </div>
  </li>;
}

function RootGroup({ group, word, favorites, onFavorite }) {
  const [open, setOpen] = useState(group.words.some((item) => termKey(item.term) === termKey(word.term)));
  const id = useId();
  return <section className="family-root-group" aria-label={`${group.words[0].term} 词根组`}>
    <ul className="family-timeline">
      {group.words.map((item, index) => <li key={item.id} className={`family-row ${termKey(item.term) === termKey(word.term) ? "is-current" : ""}`}>
        <div className="family-heading">
          <button type="button" className="family-term-button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={`${id}-${index}`} aria-label={`${open ? "收起" : "展开"} ${group.words[0].term} 词根组`}>
            <span className="family-node">{index === 0 ? open ? <ChevronDown /> : <ChevronRight /> : <i />}</span>
            <strong><Term item={item} roots /></strong>
            {item.inBook && <span className="family-badge">{item.source || "词库"}</span>}
            {termKey(item.term) === termKey(word.term) && <span className="sr-only">当前单词</span>}
          </button>
          <Favorite item={item} favorites={favorites} onFavorite={onFavorite} />
        </div>
        <div id={`${id}-${index}`} className="family-body" hidden={!open}><RootDetails item={item} /></div>
      </li>)}
    </ul>
  </section>;
}

export default function WordFamilyView({ mode, word, rows = [], groups = [], favorites, onFavorite }) {
  if (mode === "roots") {
    if (!groups.length) return <p className="family-empty">暂无可靠的词根词缀资料</p>;
    return <div className="word-family-view">{groups.map((group) => <RootGroup key={`${word.id}-${group.id}`} group={group} word={word} favorites={favorites} onFavorite={onFavorite} />)}</div>;
  }
  if (!rows.length) return <p className="family-empty">暂无已收录的派生词</p>;
  return <div className="word-family-view"><ul className="family-timeline">{rows.map((item) => <DerivativeRow key={`${word.id}-${item.id}`} item={item} current={termKey(item.term) === termKey(word.term)} favorites={favorites} onFavorite={onFavorite} />)}</ul></div>;
}
