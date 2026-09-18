# 词族与近义词资料

2026-09-18：词族资料包含 160 组、670 个词条、29 个专题组。中文短释义为学习用概括。覆盖部分主词库单词，并加入词库外拓展词；并非整本词书的完整词源词典。

- `src/data/word-families.json`：明确列出的词族、词基/词根/词缀含义及构词说明。允许词干变化，不通过子串相似度生成词族。
- `src/data/reviewed-synonyms.json`：义项限定的近义关系，另保留原始 79 条候选关系的逐条审核决定；保留 33 条、剔除 46 条。新补的近义关系也须填写词性、中文含义、对应义项与使用区别。
- `src/wordFamilies.js` 和 `src/synonyms.js`：界面只使用这些明确关系；未知关系显示空状态。词根关联不等于派生关系，更不等于近义关系。
- 添加词条时保持收藏 ID 兼容；书内用原词条 ID，书外用 `family-` 加规范化单词。

## 核对参考

近义词按义项查阅 [Merriam-Webster Thesaurus](https://www.merriam-webster.com/thesaurus/endanger)，包括 [core](https://www.merriam-webster.com/thesaurus/core)、[mantle](https://www.merriam-webster.com/thesaurus/mantle)、[atmosphere](https://www.merriam-webster.com/thesaurus/atmosphere)、[catastrophic](https://www.merriam-webster.com/thesaurus/catastrophic)、[mishap](https://www.merriam-webster.com/thesaurus/mishap)、[disaster](https://www.merriam-webster.com/thesaurus/disaster)、[horizon](https://www.merriam-webster.com/thesaurus/horizon)、[altitude](https://www.merriam-webster.com/thesaurus/altitude)、[crust](https://www.merriam-webster.com/thesaurus/crust)、[latitude](https://www.merriam-webster.com/thesaurus/latitude)。词典列出的相关词不会全部自动收录。

地圈与岩石圈、经度与经线的区别参考 Cambridge 的 [geosphere](https://dictionary.cambridge.org/dictionary/english/geosphere)、[lithosphere](https://dictionary.cambridge.org/us/dictionary/english/lithosphere) 与 [longitude](https://dictionary.cambridge.org/us/dictionary/english/longitude) 条目。

重点词源参考 Etymonline 的 [atmosphere](https://www.etymonline.com/word/atmosphere)、[hydrogen](https://www.etymonline.com/word/hydrogen)、[oxygen](https://www.etymonline.com/word/oxygen)、[oxymoron](https://www.etymonline.com/word/oxymoron)、[disaster](https://www.etymonline.com/word/disaster)、[calamity](https://www.etymonline.com/word/calamity)、[transport](https://www.etymonline.com/word/transport)、[inspect](https://www.etymonline.com/word/inspect)、[construct](https://www.etymonline.com/word/construct)、[biology](https://www.etymonline.com/word/biology)、[tend](https://www.etymonline.com/word/tend)、[maritime](https://www.etymonline.com/word/maritime)、[spectacle](https://www.etymonline.com/word/spectacle)。历史词源和现代可分析的词基、词缀在资料中分开说明。

运行数据回归检查：`node --test src/wordFamilies.test.js src/synonyms.test.js src/spellingRecords.test.js`。

