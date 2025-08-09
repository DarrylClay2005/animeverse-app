// AnimeVerse v2.0.0 - Ultra-Optimized Production Version
'use strict';
!function(window,document){"undefined"!=typeof module&&module.exports;

// Optimized state management
const S={l:!1,a:[],w:JSON.parse(localStorage.getItem('animeverse_watchlist')||'[]'),e:{},c:new Map(),q:[]};
const A={u:'https://api.jikan.moe/v4',r:3,t:3e5,o:1e4};

// DOM Ready & Initialize
document.addEventListener('DOMContentLoaded',()=>{
const ids=['hero-search','search-btn','loading-overlay','search-results','search-grid','featured-section','featured-grid','results-count','clear-search','toast-container','detail-modal','detail-content','close-detail'];
ids.forEach(id=>S.e[id]=document.getElementById(id));

// Navigation
document.querySelectorAll('.nav-link').forEach(l=>l.addEventListener('click',e=>{e.preventDefault();switchSection(l.dataset.section)}));

// Search with debouncing
const debounce=(f,w)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>f.apply(this,a),w)}};
S.e['hero-search']?.addEventListener('input',debounce(()=>{const q=S.e['hero-search']?.value?.trim();q&&q.length>=2&&performSearch()},500));
S.e['hero-search']?.addEventListener('keypress',e=>e.key==='Enter'&&performSearch());
S.e['search-btn']?.addEventListener('click',performSearch);
S.e['clear-search']?.addEventListener('click',()=>{S.e['hero-search'].value='';S.e['search-results']?.classList.add('hidden');document.querySelector('.hero-section').style.display='block';S.e['search-grid']&&(S.e['search-grid'].innerHTML='')});

// Modals
S.e['close-detail']?.addEventListener('click',()=>document.getElementById('detail-modal')?.classList.add('hidden'));
document.getElementById('refresh-featured')?.addEventListener('click',loadFeaturedAnime);

// Click delegation
document.addEventListener('click',e=>{const c=e.target.closest('.anime-card');c?.dataset.animeData&&showAnimeDetails(JSON.parse(c.dataset.animeData))});

loadFeaturedAnime();
showToast('AnimeVerse ready!','success');
});

function switchSection(s){
document.querySelectorAll('.nav-link').forEach(l=>{l.classList.toggle('active',l.dataset.section===s);l.classList.toggle('text-anime-text',l.dataset.section===s);l.classList.toggle('text-anime-muted',l.dataset.section!==s)});
document.querySelectorAll('.content-section').forEach(el=>el.classList.add('hidden'));
const h=document.querySelector('.hero-section');h.style.display=s==='home'?'block':'none';
const m={'home':()=>S.e['featured-section']?.classList.remove('hidden'),'trending':()=>showSection('trending-section',loadTrendingAnime),'watchlist':()=>showSection('watchlist-section',displayWatchlist),'search':()=>{S.e['search-results']?.classList.remove('hidden');S.e['hero-search']?.focus()}};
m[s]?.();
}

function showSection(id,fn){const s=document.getElementById(id);if(s){s.classList.remove('hidden');fn?.()}}

async function performSearch(){
const q=S.e['hero-search']?.value?.trim();
if(!q||q.length<2){showToast('Enter at least 2 characters','warning');return}
try{showLoading('Searching...');const r=await searchAnime(q);displayResults(r,'search');showSearchSection();showToast(`Found ${r.length} results`,'success')}catch(e){showToast('Search failed','error')}finally{hideLoading()}
}

async function apiRequest(endpoint){
const url=`${A.u}${endpoint}`,cached=S.c.get(url);
if(cached&&Date.now()-cached.timestamp<A.t)return cached.data;
await rateLimitDelay();
try{
const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),A.o);
const resp=await fetch(url,{signal:ctrl.signal,headers:{'Accept':'application/json','User-Agent':'AnimeVerse/2.0'}});
clearTimeout(timeout);
if(!resp.ok)throw new Error(`HTTP ${resp.status}`);
const data=await resp.json();
S.c.set(url,{data,timestamp:Date.now()});
return data;
}catch(e){if(e.name==='AbortError')throw new Error('Timeout');throw e}
}

async function rateLimitDelay(){
const now=Date.now();
S.q=S.q.filter(t=>now-t<1000);
if(S.q.length>=A.r){const d=1000-(now-S.q[0]);await new Promise(r=>setTimeout(r,d))}
S.q.push(now);
}

async function searchAnime(q){
try{const d=await apiRequest(`/anime?q=${encodeURIComponent(q)}&limit=20&order_by=score&sort=desc`);return processAnimeData(d.data||[])}
catch(e){return getFallbackData(q)}
}

async function loadFeaturedAnime(){
try{showLoading('Loading...');const d=await apiRequest('/top/anime?limit=20');displayResults(processAnimeData(d.data||[]),'featured')}
catch(e){showToast('Failed to load','error')}finally{hideLoading()}
}

async function loadTrendingAnime(){
try{showLoading('Loading...');const d=await apiRequest('/seasons/now?limit=20');displayResults(processAnimeData(d.data||[]),'trending')}
catch(e){showToast('Failed to load','error')}finally{hideLoading()}
}

function processAnimeData(arr){
return arr.map(a=>({id:a.mal_id,title:a.title,englishTitle:a.title_english,type:a.type,episodes:a.episodes,year:a.aired?.from?new Date(a.aired.from).getFullYear():'Unknown',score:a.score||'N/A',synopsis:a.synopsis||'No synopsis available',genres:a.genres?.map(g=>g.name)||[],rating:a.rating,image:a.images?.jpg?.large_image_url||a.images?.jpg?.image_url||generatePlaceholderImage(a.title),url:a.url}))
}

function getFallbackData(q){return[{id:Date.now(),title:`"${q}" - Demo Result`,englishTitle:'Demo Result',type:'TV',episodes:12,year:2024,score:8.5,synopsis:'Demo result when API unavailable',genres:['Demo'],rating:'PG-13',image:generatePlaceholderImage(q),url:'#'}]}

function displayResults(results,type){
const gid=`${type==='search'?'search':type==='trending'?'trending':'featured'}-grid`,g=document.getElementById(gid);
if(!g)return;g.innerHTML='';S.a=results;
const frag=document.createDocumentFragment();
results.forEach((a,i)=>frag.appendChild(createAnimeCard(a,i)));
g.appendChild(frag);
if(type==='search'&&S.e['results-count'])S.e['results-count'].textContent=`${results.length} results`;
}

function createAnimeCard(a,i){
const c=document.createElement('div');
c.className='anime-card bg-anime-secondary rounded-lg overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 cursor-pointer';
c.dataset.animeData=JSON.stringify(a);c.style.animationDelay=`${i*50}ms`;
const g=a.genres.slice(0,3).map(genre=>`<span class="inline-block bg-anime-accent/20 text-anime-accent text-xs px-2 py-1 rounded-full">${genre}</span>`).join('');
c.innerHTML=`<div class="relative"><img src="${a.image}" alt="${a.title}" class="w-full h-64 object-cover" loading="lazy"><div class="absolute top-2 right-2 bg-black/70 text-white px-2 py-1 rounded-full text-xs">${a.year}</div></div><div class="p-4"><h3 class="font-bold text-anime-text mb-2 line-clamp-2 min-h-[3rem]">${a.title}</h3><div class="flex items-center justify-between mb-2"><span class="text-anime-muted text-sm">${a.type}</span>${a.score!=='N/A'?`<div class="flex items-center text-amber-400"><i class="fas fa-star mr-1"></i><span class="text-sm">${a.score}</span></div>`:''}</div><p class="text-anime-muted text-sm mb-3 line-clamp-3">${a.synopsis.substring(0,120)}...</p><div class="flex flex-wrap gap-1">${g}</div></div>`;
return c;
}

function displayWatchlist(){
const g=document.getElementById('watchlist-grid'),e=document.getElementById('watchlist-empty');
if(!g||!e)return;
if(S.w.length===0){e.classList.remove('hidden');g.classList.add('hidden')}else{e.classList.add('hidden');g.classList.remove('hidden');displayResults(S.w,'watchlist')}
}

function showAnimeDetails(a){
const g=a.genres.map(genre=>`<span class="inline-block bg-anime-accent/20 text-anime-accent px-3 py-1 rounded-full text-sm">${genre}</span>`).join('');
const content=`<div class="flex flex-col lg:flex-row gap-6"><img src="${a.image}" alt="${a.title}" class="w-full lg:w-80 h-auto object-cover rounded-lg"><div class="flex-1"><h2 class="text-3xl font-bold text-anime-text mb-4">${a.title}</h2><div class="grid grid-cols-2 gap-4 mb-4"><div><span class="text-anime-muted">Type:</span><span class="text-anime-text ml-2">${a.type}</span></div><div><span class="text-anime-muted">Year:</span><span class="text-anime-text ml-2">${a.year}</span></div><div><span class="text-anime-muted">Episodes:</span><span class="text-anime-text ml-2">${a.episodes||'Unknown'}</span></div>${a.score!=='N/A'?`<div><span class="text-anime-muted">Score:</span><span class="text-amber-400 ml-2"><i class="fas fa-star mr-1"></i>${a.score}</span></div>`:''}</div><div class="mb-4"><h3 class="text-anime-text font-semibold mb-2">Genres:</h3><div class="flex flex-wrap gap-2">${g}</div></div><div class="flex gap-3 mb-4"><button class="bg-anime-accent hover:bg-anime-accent-hover text-white px-6 py-3 rounded-lg transition-colors flex items-center" onclick="showStreamingOptions('${a.title}',1)"><i class="fas fa-play mr-2"></i>Watch Now</button><button class="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg transition-colors flex items-center" onclick="toggleWatchlist(${JSON.stringify(a).replace(/"/g,'&quot;')})"><i class="fas fa-bookmark mr-2"></i>${S.w.some(w=>w.id===a.id)?'Remove':'Add to Watchlist'}</button></div></div></div><div class="mt-6"><h3 class="text-anime-text font-semibold mb-3">Synopsis</h3><p class="text-anime-muted leading-relaxed">${a.synopsis}</p></div><div class="mt-6 text-center"><a href="${a.url}" target="_blank" class="inline-flex items-center text-anime-accent hover:text-anime-accent-hover"><i class="fas fa-external-link-alt mr-2"></i>View on MyAnimeList</a></div>`;
S.e['detail-content'].innerHTML=content;
document.getElementById('detail-modal')?.classList.remove('hidden');
}

function showStreamingOptions(title,ep=1){
const p=[{name:'Crunchyroll',url:`https://crunchyroll.com/search?q=${encodeURIComponent(title)}`,icon:'fab fa-chrome',official:true},{name:'Funimation',url:`https://funimation.com/search?q=${encodeURIComponent(title)}`,icon:'fas fa-tv',official:true},{name:'GogoAnime',url:`https://gogoanime.pe/search.html?keyword=${encodeURIComponent(title)}`,icon:'fas fa-play',official:false},{name:'AnimixPlay',url:`https://animixplay.to/?q=${encodeURIComponent(title)}`,icon:'fas fa-film',official:false}];
const op=p.filter(p=>p.official).map(p=>`<button class="flex items-center justify-center gap-3 w-full p-4 bg-green-600/20 border border-green-500 text-green-400 hover:bg-green-600/30 rounded-lg transition-colors" onclick="openPlatform('${p.url}')"><i class="${p.icon}"></i>${p.name}</button>`).join('');
const ap=p.filter(p=>!p.official).map(p=>`<button class="flex items-center justify-center gap-3 w-full p-4 bg-blue-600/20 border border-blue-500 text-blue-400 hover:bg-blue-600/30 rounded-lg transition-colors" onclick="openPlatform('${p.url}')"><i class="${p.icon}"></i>${p.name}</button>`).join('');
showCustomModal('Watch '+title,`<div class="space-y-6"><div><h4 class="text-anime-text font-semibold mb-3 flex items-center"><i class="fas fa-star text-amber-400 mr-2"></i>Official Platforms</h4><div class="grid gap-3">${op}</div></div><div><h4 class="text-anime-text font-semibold mb-3 flex items-center"><i class="fas fa-globe text-blue-400 mr-2"></i>Alternative Sources</h4><div class="grid gap-3">${ap}</div></div><div class="text-center text-sm text-anime-muted bg-anime-primary/50 p-3 rounded-lg"><i class="fas fa-info-circle mr-2"></i>Links will open platform search pages. Availability may vary by region.</div></div>`);
}

function openPlatform(url){window.open(url,'_blank');closeCustomModal();showToast('Opening platform...','info')}

function toggleWatchlist(a){
const i=S.w.findIndex(w=>w.id===a.id);
if(i>-1){S.w.splice(i,1);showToast('Removed from watchlist','success')}else{S.w.push(a);showToast('Added to watchlist','success')}
localStorage.setItem('animeverse_watchlist',JSON.stringify(S.w));
showAnimeDetails(a);
}

function showCustomModal(title,content){
const m=document.createElement('div');
m.className='fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50';
m.innerHTML=`<div class="bg-anime-secondary rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"><div class="p-6"><div class="flex justify-between items-center mb-6"><h3 class="text-xl font-bold text-anime-text">${title}</h3><button onclick="closeCustomModal()" class="text-anime-muted hover:text-anime-text p-2"><i class="fas fa-times text-xl"></i></button></div>${content}</div></div>`;
m.id='custom-modal';
document.body.appendChild(m);
}

function closeCustomModal(){document.getElementById('custom-modal')?.remove()}

function showSearchSection(){S.e['search-results']?.classList.remove('hidden');document.querySelector('.hero-section').style.display='none'}

function showLoading(msg='Loading...'){if(S.l)return;S.l=true;const o=S.e['loading-overlay'];if(o){o.classList.remove('hidden');const t=o.querySelector('.loading-text');if(t)t.textContent=msg}}

function hideLoading(){S.l=false;S.e['loading-overlay']?.classList.add('hidden')}

function generatePlaceholderImage(title){const colors=['ff6b6b','4ecdc4','45b7d1','96ceb4','ffeaa7','fd79a8','fdcb6e'];const hash=title.split('').reduce((a,b)=>((a<<5)-a)+b.charCodeAt(0),0);const color=colors[Math.abs(hash)%colors.length];return `https://via.placeholder.com/400x600/${color}/ffffff?text=${encodeURIComponent(title.substring(0,20))}`}

function showToast(msg,type='info'){
const cont=S.e['toast-container'];if(!cont)return;
const icons={success:'fa-check-circle text-green-400',error:'fa-exclamation-circle text-red-400',warning:'fa-exclamation-triangle text-yellow-400',info:'fa-info-circle text-blue-400'};
const colors={success:'bg-green-900/80 border-green-500',error:'bg-red-900/80 border-red-500',warning:'bg-yellow-900/80 border-yellow-500',info:'bg-blue-900/80 border-blue-500'};
const t=document.createElement('div');
t.className=`toast ${colors[type]} backdrop-blur-sm border rounded-lg px-4 py-3 shadow-lg flex items-center gap-3 transform translate-x-full transition-all duration-300`;
t.innerHTML=`<i class="fas ${icons[type]}"></i><span class="text-white font-medium">${msg}</span><button onclick="this.parentElement.remove()" class="text-white/70 hover:text-white ml-2"><i class="fas fa-times"></i></button>`;
cont.appendChild(t);
setTimeout(()=>t.classList.remove('translate-x-full'),100);
setTimeout(()=>{t.classList.add('translate-x-full','opacity-0');setTimeout(()=>t.remove(),300)},4000);
}

}(window,document);
