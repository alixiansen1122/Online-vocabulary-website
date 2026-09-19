import test from 'node:test';
import assert from 'node:assert/strict';
import { containsTerm, mergeBilingualExamples, selectExamples } from './examples.js';
import { parseYoudao, parseIciba, parseTatoeba, collectExamples, plainText } from '../app/api/examples/providers.js';
import { GET } from '../app/api/examples/route.js';

test('combined local and remote examples never exceed ten; reject missing Chinese and duplicates',()=>{
 const examples=Array.from({length:14},(_,i)=>({en:`Example sentence number ${i}.`,zh:`第${i}条例句。`}));
 const result=mergeBilingualExamples([null,{en:'English only',zh:'English translation'},examples[0],{en:'EXAMPLE SENTENCE NUMBER 0!',zh:'重复'}], examples);
 assert.equal(result.length,10);assert.equal(result[1].en,examples[1].en);
 assert.equal(mergeBilingualExamples([{en:'Different sentence.',zh:'第0条例句!'}],[examples[0]]).length,1);
});
test('word and phrase boundaries exclude substring matches',()=>{
 assert.ok(containsTerm('We take   off tomorrow.','take off'));
 assert.ok(containsTerm('An art exhibition.','art'));
 assert.equal(containsTerm('This party is over.','art'),false);
});
test('selection excludes fragments, wrong words and near duplicates',()=>{
 const a={en:'We study art every day.',zh:'我们每天学习艺术。'};
 const result=selectExamples([a,{en:'We study art every day!',zh:'每天学艺术。'},
 {en:'We study art...',zh:'我们学习艺术。'},{en:'She enjoys the party.',zh:'她喜欢聚会。'},
 {en:'Modern art challenges traditional ideas.',zh:'现代艺术挑战传统观念。'}],'art');
 assert.equal(result.length,2);
});
test('Youdao keeps paired paragraphs and original attribution only',()=>{
 const html='<li><p><span id="src_0_0">We enjoy <b>art</b>.</span></p><p><span id="tran_0_0">我们喜欢艺术。</span></p><p class="example-via">示例来源</p></li><li><p><span id="src_1_0">No translation</span></p></li>';
 const result=parseYoudao(html,'art');assert.equal(result.length,1);assert.equal(result[0].en,'We enjoy art.');
 assert.match(result[0].sourceLabel,/示例来源/);assert.equal(result[0].sourceLicense,undefined);
 assert.equal(plainText('Tom&#39;s &amp; <b>art</b>'),'Tom\'s & art');
});
test('Iciba reads paired examples, never English-only exam quotations',()=>{
 const wordInfo={new_sentence:[{sentences:[{en:'We enjoy art.',cn:'我们喜欢艺术。',from:'词典'}]}],cetFour:[{sentence:'Exam without translation'}]};
 const data={props:{pageProps:{initialReduxState:{word:{wordInfo}}}}};
 const result=parseIciba(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`,'art');
 assert.equal(result.length,1);assert.equal(result[0].zh,'我们喜欢艺术。');assert.deepEqual(parseIciba('<html>changed markup</html>','art'),[]);
});
test('Tatoeba filters unapproved translations and attributes both authors',()=>{
 const result=parseTatoeba({data:[{id:1,text:'We enjoy art.',owner:'author',translations:[{lang:'cmn',text:'艺术',is_unapproved:true},{lang:'cmn',text:'我們喜歡藝術。',owner:'translator',is_direct:true,transcriptions:[{script:'Hans',type:'altscript',text:'我们喜欢艺术。'}]}]}]});
 assert.equal(result.length,1);assert.equal(result[0].zh,'我们喜欢艺术。');assert.match(result[0].sourceLabel,/author \/ translator/);
});
test('source failure and timeout preserve other source results',async()=>{
 const fetcher=async(url,{signal})=>{
  if(url.includes('tatoeba')) return Response.json({data:[{id:1,text:'We enjoy art.',translations:[{lang:'cmn',text:'我们喜欢艺术。'}]}]});
  if(url.includes('youdao')) return new Response('unavailable',{status:503});
  return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('timeout')),{once:true}));
 };
 const result=await collectExamples('art',{fetcher,timeoutMs:20});assert.equal(result.examples.length,1);assert.equal(result.partial,true);
});
test('all failed sources return an empty list; invalid queries reject before fetching',async()=>{
 assert.deepEqual(await collectExamples('art',{fetcher:async()=>{throw new Error('offline');}}),{examples:[],partial:true});
 assert.equal((await GET(new Request('https://example.com/api/examples?word=%3Cscript%3E'))).status,400);
});
