(() => {
  'use strict';

  const cfg = window.MSM_CONFIG;
  const app = document.getElementById('app');
  const modalBackdrop = document.getElementById('modalBackdrop');
  const toastRegion = document.getElementById('toastRegion');
  const navToggle = document.getElementById('navToggle');
  const mainNav = document.getElementById('mainNav');

  const state = {
    supabase: null,
    user: null,
    currentVariant: null,
    draft: null,
    currentQuestion: 1,
    timerId: null,
    submitting: false,
    history: [],
    unlockedVariants: [],
    backendError: null
  };

  const html = (s) => s;
  const esc = (v='') => String(v).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const qs = (sel, root=document) => root.querySelector(sel);
  const qsa = (sel, root=document) => [...root.querySelectorAll(sel)];
  const nowIso = () => new Date().toISOString();
  const backendReady = () => cfg.supabaseUrl && cfg.supabaseAnonKey && !cfg.supabaseUrl.startsWith('REPLACE_') && !cfg.supabaseAnonKey.startsWith('REPLACE_');
  const draftKey = (variant) => `msm:draft:v${variant}`;
  const localHistoryKey = 'msm:local_history';

  function toast(message, type='') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    toastRegion.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  function modal(content, actions=[]) {
    modalBackdrop.hidden = false;
    modalBackdrop.innerHTML = `<section class="modal" role="dialog" aria-modal="true">${content}<div class="modal-actions"></div></section>`;
    const area = qs('.modal-actions', modalBackdrop);
    actions.forEach(a => {
      const b = document.createElement('button');
      b.className = `btn ${a.className || 'btn-secondary'}`;
      b.textContent = a.label;
      b.addEventListener('click', () => { if (a.onClick) a.onClick(); if (a.close !== false) closeModal(); });
      area.appendChild(b);
    });
  }
  function closeModal(){ modalBackdrop.hidden = true; modalBackdrop.innerHTML = ''; }
  modalBackdrop.addEventListener('click', (e) => { if(e.target === modalBackdrop) closeModal(); });

  navToggle?.addEventListener('click', () => {
    const open = mainNav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(open));
  });
  mainNav?.addEventListener('click', () => mainNav.classList.remove('open'));

  async function initSupabase(){
    if (!backendReady()) throw new Error('Supabase konfiguratsiyasi topilmadi.');
    if (!window.supabase) throw new Error('Supabase JavaScript kutubxonasi yuklanmadi.');
    state.supabase = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    const current = await state.supabase.auth.getSession();
    if (current.error) throw current.error;
    let session = current.data.session;
    if (!session) {
      const { data, error } = await state.supabase.auth.signInAnonymously();
      if (error) throw error;
      session = data.session;
    }
    if (!session?.user) throw new Error('Anonim foydalanuvchi sessiyasi yaratilmadi.');
    state.user = session.user;
    state.backendError = null;
  }

  function routeInfo(){
    const raw = location.hash.replace(/^#/, '') || '/';
    const [path, query=''] = raw.split('?');
    return { path, params: new URLSearchParams(query) };
  }

  function setActiveNav(path){
    qsa('.main-nav a').forEach(a => {
      const href = a.getAttribute('href') || '';
      const active = href === `#${path}` || (path.startsWith('/test') && href === '#/variants');
      a.classList.toggle('active', active);
    });
  }

  function renderMath(latex){
    let src = String(latex ?? '').replace(/\$/g, '').trim();
    // Seed/SQL orqali ikki marta escape bo'lgan LaTeX buyruqlarini bitta backslashga qaytaramiz.
    while (src.includes('\\\\')) src = src.replaceAll('\\\\', '\\');
    if (!src) return '—';
    try { return window.katex ? window.katex.renderToString(src, {throwOnError:false, displayMode:false, strict:'ignore'}) : esc(src); }
    catch { return esc(src); }
  }

  function formatTime(seconds){
    seconds = Math.max(0, Math.floor(seconds));
    const h = Math.floor(seconds/3600), m = Math.floor((seconds%3600)/60), s = seconds%60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function variantTitle(v){ return `${v}-variant`; }
  function makeEmptyAnswers(){
    const a = {};
    for(let i=1;i<=35;i++) a[i] = '';
    for(let i=36;i<=45;i++) a[i] = {a:'', b:''};
    return a;
  }

  function createDraft(variant){
    const startedAt = nowIso();
    const endAt = new Date(Date.now() + cfg.testMinutes*60*1000).toISOString();
    return { version: 1, variant, startedAt, endAt, answers: makeEmptyAnswers(), flags: [], lastQuestion:1, updatedAt:startedAt };
  }

  function saveDraft(){
    if(!state.draft) return;
    state.draft.updatedAt = nowIso();
    localStorage.setItem(draftKey(state.draft.variant), JSON.stringify(state.draft));
  }
  function loadDraft(variant){
    try { return JSON.parse(localStorage.getItem(draftKey(variant)) || 'null'); } catch { return null; }
  }
  function clearDraft(variant){ localStorage.removeItem(draftKey(variant)); }

  function answeredCount(draft){
    let n=0;
    for(let i=1;i<=35;i++) if(draft.answers[i]) n++;
    for(let i=36;i<=45;i++) {
      const x=draft.answers[i]||{};
      if(x.a && x.b) n++;
    }
    return n;
  }
  function isQuestionDone(n){
    const a = state.draft?.answers?.[n];
    if(n<=35) return !!a;
    return !!(a?.a && a?.b);
  }

  async function apiFunction(name, body={}){
    if(!state.supabase) throw new Error('Backend hali ulanmagan. config.js faylida Supabase sozlamalarini kiriting.');
    const { data, error } = await state.supabase.functions.invoke(name, { body });
    if(error) throw error;
    if(data?.error) throw new Error(data.error);
    return data;
  }

  async function fetchHistory(){
    if(!state.supabase || !state.user) {
      throw new Error(state.backendError || 'Server bilan xavfsiz sessiya o‘rnatilmadi. Sahifani yangilang yoki keyinroq urinib ko‘ring.');
    }
    const { data, error } = await state.supabase.from('attempts')
      .select('id,variant,started_at,submitted_at,duration_seconds,parent_correct,item_correct,item_total,rasch_theta,ms_score,level,rasch_status')
      .eq('owner_id', state.user.id).eq('status','completed').order('submitted_at',{ascending:false});
    if(error) throw error;
    state.history = data || [];
    state.unlockedVariants = [...new Set(state.history.map(x=>x.variant))];
    return state.history;
  }

  function pageHome(){
    app.innerHTML = html`
      <section class="hero">
        <div class="hero-copy">
          <span class="eyebrow">Matematika • Milliy sertifikat</span>
          <h1>Testni ishlang. Natijani tushuning. O‘sishni kuzating.</h1>
          <p>20 ta variant, 45 ta topshiriq va 150 daqiqalik mashq rejimi. Ochiq savollarda matematik formulalarni to‘g‘ri kiritish, avtomatik saqlash, shaxsiy tarix va variant bo‘yicha tahlil bir joyda.</p>
          <div class="hero-actions">
            <a class="btn btn-primary" href="#/variants">Variant tanlash</a>
            <a class="btn btn-secondary" href="#/history">Mening tarixim</a>
          </div>
        </div>
        <aside class="hero-card">
          <div class="hero-stat"><div><span>Variantlar</span><strong>20</strong></div><span>alohida statistika</span></div>
          <div class="hero-stat"><div><span>Topshiriqlar</span><strong>45</strong></div><span>35 yopiq + 10 ochiq</span></div>
          <div class="hero-stat"><div><span>Vaqt</span><strong>150</strong></div><span>daqiqa</span></div>
        </aside>
      </section>

      <section class="section">
        <div class="section-head"><div><h2>Qanday ishlaydi?</h2><p>Jarayon sodda va tushunarli.</p></div></div>
        <div class="grid grid-3">
          <article class="card"><div class="mini-icon">1</div><h3>Variantni tanlang</h3><p>20 variantdan birini tanlab, 150 daqiqalik testni boshlang. Javoblar avtomatik saqlanadi.</p></article>
          <article class="card"><div class="mini-icon">2</div><h3>Javoblarni kiriting</h3><p>Yopiq savollarda variantni belgilang, ochiq savollarda formulani matematik klaviatura bilan yozing.</p></article>
          <article class="card"><div class="mini-icon">3</div><h3>Natija va tarix</h3><p>Tekshiruvdan keyin natija saqlanadi. Ishlangan variantning javob kaliti ochiladi va tarixda qoladi.</p></article>
        </div>
      </section>

      <section class="section">
        <div class="notice">
          <div>ⓘ</div><div><strong>Rasch haqida:</strong> natijalar variantlar kesimida alohida yig‘iladi. MS ball shkalasi faqat yetarli statistik baza shakllanganda hisoblanadi; platformadagi hisob rasmiy sertifikat natijasining o‘rnini bosmaydi.</div>
        </div>
      </section>`;
  }

  function pageVariants(){
    const cards = Array.from({length:cfg.totalVariants},(_,i)=>i+1).map(v => {
      const d = loadDraft(v); const has = !!d; const expired = d && Date.parse(d.endAt) <= Date.now();
      return `<button class="variant-card" data-variant="${v}"><strong>${v}-variant</strong><span>${has ? (expired?'Vaqti tugagan draft':'Davom ettirish mumkin') : '45 topshiriq • 150 daqiqa'}</span></button>`;
    }).join('');
    app.innerHTML = `<section><div class="section-head"><div><h1 style="font-size:2rem;margin:0">Variantlar</h1><p>Testni ko‘rish uchun shaxsiy ma’lumot talab qilinmaydi. Ma’lumotlar faqat natijani yuborishda so‘raladi.</p></div></div><div class="variant-grid">${cards}</div></section>`;
    qsa('[data-variant]').forEach(btn => btn.addEventListener('click', () => startVariant(Number(btn.dataset.variant))));
  }

  function startVariant(variant){
    let d = loadDraft(variant);
    if(d && Date.parse(d.endAt)<=Date.now()) {
      state.draft=d; state.currentVariant=variant;
      modal(`<h2>${variant}-variant vaqti tugagan</h2><p class="muted">Bu urinishning 150 daqiqalik vaqti yakunlangan. Mavjud javoblarni yuborish yoki yangi urinish boshlash mumkin.</p>`,[
        {label:'Yangi urinish',className:'btn-secondary',onClick:()=>{clearDraft(variant); beginNew(variant)}},
        {label:'Mavjudini yuborish',className:'btn-primary',onClick:()=>openSubmitModal(true)}
      ]); return;
    }
    if(d) {
      modal(`<h2>${variant}-variant davom ettirilsinmi?</h2><p class="muted">Oldingi javoblaringiz va qolgan vaqt saqlangan.</p>`,[
        {label:'Yangidan boshlash',className:'btn-secondary',onClick:()=>{clearDraft(variant); beginNew(variant)}},
        {label:'Davom ettirish',className:'btn-primary',onClick:()=>{state.draft=d;state.currentVariant=variant;state.currentQuestion=d.lastQuestion||1;location.hash=`#/test?variant=${variant}`}}
      ]);
    } else beginNew(variant);
  }
  function beginNew(variant){ state.currentVariant=variant; state.draft=createDraft(variant); saveDraft(); state.currentQuestion=1; location.hash=`#/test?variant=${variant}`; }

  function renderTest(){
    const { params } = routeInfo();
    const v=Number(params.get('variant'));
    if(!v || v<1 || v>cfg.totalVariants){ location.hash='#/variants';return; }
    if(!state.draft || state.draft.variant!==v) state.draft=loadDraft(v);
    if(!state.draft){ state.draft=createDraft(v); saveDraft(); }
    state.currentVariant=v; state.currentQuestion=Math.min(45,Math.max(1,state.draft.lastQuestion||1));
    app.innerHTML = `<section>
      <div class="toolbar"><div class="toolbar-left"><span class="chip"><strong>${v}-variant</strong></span><span class="chip">Bajarildi: <strong id="doneCount">0/45</strong></span></div><div class="toolbar-right"><span class="chip timer" id="timer">02:30:00</span><button class="btn btn-primary" id="finishBtn">Tekshirish</button></div></div>
      <div class="progress"><span id="progressBar" style="width:0%"></span></div>
      <div class="test-layout section">
        <aside class="card test-sidebar"><div class="section-head"><div><h3>Savollar</h3><p>Yashil — to‘ldirilgan</p></div></div><div class="question-nav" id="questionNav"></div></aside>
        <div id="questionArea"></div>
      </div></section>`;
    qs('#finishBtn').addEventListener('click',()=>openSubmitModal(false));
    renderQuestionNav(); renderQuestion(); updateProgress(); startTimer();
  }

  function renderQuestionNav(){
    const nav=qs('#questionNav'); if(!nav) return;
    nav.innerHTML=Array.from({length:45},(_,i)=>i+1).map(n=>`<button class="qnav ${isQuestionDone(n)?'done':''} ${n===state.currentQuestion?'current':''} ${(state.draft.flags||[]).includes(n)?'flagged':''}" data-q="${n}">${n}</button>`).join('');
    qsa('.qnav',nav).forEach(b=>b.addEventListener('click',()=>{state.currentQuestion=Number(b.dataset.q);state.draft.lastQuestion=state.currentQuestion;saveDraft();renderQuestionNav();renderQuestion();}));
  }

  function renderQuestion(){
    const n=state.currentQuestion; const area=qs('#questionArea'); if(!area) return;
    const type=n<=32?'Y-1':n<=35?'Y-2':'O';
    let body='';
    if(n<=35){
      const letters=n<=32?['A','B','C','D']:['A','B','C','D','E','F'];
      const current=state.draft.answers[n]||'';
      body=`<div class="notice"><div>✦</div><div>Kitobdagi <strong>${n}-savol</strong>ni yeching va javob variantini belgilang.</div></div><div class="choice-list section">${letters.map(l=>`<label class="choice"><input type="radio" name="q${n}" value="${l}" ${current===l?'checked':''}><span class="choice-letter">${l}</span><span>${l} javob</span></label>`).join('')}</div>`;
    } else {
      const current=state.draft.answers[n]||{a:'',b:''};
      body=`<div class="notice"><div>∑</div><div>Kitobdagi <strong>${n}-savol</strong>ning <strong>a</strong> va <strong>b</strong> bandlari javobini kiriting. Kasr, ildiz, daraja, π va boshqa belgilarni matematik maydonda yozish mumkin.</div></div><div class="open-grid section">
        <div class="field-group"><label>a) javob</label><div class="math-wrap"><math-field id="mathA" virtual-keyboard-mode="manual">${esc(current.a||'')}</math-field></div></div>
        <div class="field-group"><label>b) javob</label><div class="math-wrap"><math-field id="mathB" virtual-keyboard-mode="manual">${esc(current.b||'')}</math-field></div></div>
      </div>`;
    }
    area.innerHTML=`<article class="card question-card"><div class="question-title"><div><h2>${n}-savol</h2><div class="question-meta">${type} • ${n<=35?'yopiq':'ochiq, a/b band'}</div></div><button class="btn btn-secondary" id="flagBtn">${(state.draft.flags||[]).includes(n)?'Belgini olib tashlash':'Keyin ko‘rish'}</button></div>${body}<div class="q-actions"><button class="btn btn-secondary" id="prevBtn" ${n===1?'disabled':''}>← Oldingi</button><div class="right"><button class="btn btn-secondary" id="nextBtn" ${n===45?'disabled':''}>Keyingi →</button><button class="btn btn-primary" id="finishInline">Tekshirish</button></div></div></article>`;
    if(n<=35){ qsa(`input[name="q${n}"]`,area).forEach(r=>r.addEventListener('change',()=>{state.draft.answers[n]=r.value; saveDraft(); renderQuestionNav(); updateProgress();})); }
    else {
      const sync=()=>{ state.draft.answers[n]={a:qs('#mathA')?.value||'',b:qs('#mathB')?.value||''}; saveDraft();renderQuestionNav();updateProgress(); };
      ['#mathA','#mathB'].forEach(id=>qs(id)?.addEventListener('input',sync));
    }
    qs('#prevBtn')?.addEventListener('click',()=>goQuestion(n-1));
    qs('#nextBtn')?.addEventListener('click',()=>goQuestion(n+1));
    qs('#finishInline')?.addEventListener('click',()=>openSubmitModal(false));
    qs('#flagBtn')?.addEventListener('click',toggleFlag);
  }
  function goQuestion(n){ if(n<1||n>45)return; state.currentQuestion=n;state.draft.lastQuestion=n;saveDraft();renderQuestionNav();renderQuestion(); window.scrollTo({top:0,behavior:'smooth'}); }
  function toggleFlag(){ const n=state.currentQuestion; const s=new Set(state.draft.flags||[]); s.has(n)?s.delete(n):s.add(n); state.draft.flags=[...s].sort((a,b)=>a-b); saveDraft(); renderQuestionNav(); renderQuestion(); }
  function updateProgress(){ const c=answeredCount(state.draft); const dc=qs('#doneCount'); if(dc)dc.textContent=`${c}/45`; const pb=qs('#progressBar');if(pb)pb.style.width=`${(c/45)*100}%`; }

  function startTimer(){
    clearInterval(state.timerId);
    const tick=()=>{
      const left=Math.max(0,Math.floor((Date.parse(state.draft.endAt)-Date.now())/1000));
      const el=qs('#timer'); if(el){el.textContent=formatTime(left);el.classList.toggle('warn',left<=900&&left>300);el.classList.toggle('danger',left<=300);}
      if(left<=0){clearInterval(state.timerId); openSubmitModal(true);}
    }; tick(); state.timerId=setInterval(tick,1000);
  }

  function openSubmitModal(force){
    if(state.submitting) return;
    const done=answeredCount(state.draft); const missing=45-done;
    modal(`<h2>Testni yakunlash</h2>${missing?`<div class="notice warn"><div>!</div><div><strong>${missing} ta savol</strong> to‘liq javoblanmagan. Javobsiz bandlar noto‘g‘ri deb hisoblanadi.</div></div>`:''}
      <p class="muted">Natijani saqlash uchun ma’lumotlaringizni kiriting. Ular natijalar tarixini ajratish va statistika uchun ishlatiladi.</p>
      <div class="form-grid">
        <div class="form-group"><label>Familiya *</label><input class="input" id="surname" autocomplete="family-name" maxlength="80"></div>
        <div class="form-group"><label>Ism *</label><input class="input" id="firstName" autocomplete="given-name" maxlength="80"></div>
        <div class="form-group full"><label>Telefon raqami *</label><input class="input" id="phone" inputmode="tel" autocomplete="tel" placeholder="+998 90 123 45 67" maxlength="24"><div class="helper">SMS tasdiqlash talab qilinmaydi.</div></div>
      </div>`,[
      ...(force?[]:[{label:'Testga qaytish',className:'btn-secondary'}]),
      {label:'Natijani tekshirish',className:'btn-primary',close:false,onClick:submitAttempt}
    ]);
  }

  function normalizePhone(v){ return String(v||'').replace(/[^+\d]/g,''); }
  async function submitAttempt(){
    const surname=qs('#surname')?.value.trim()||'', firstName=qs('#firstName')?.value.trim()||'', phone=normalizePhone(qs('#phone')?.value);
    if(surname.length<2||firstName.length<2){toast('Ism va familiyani to‘liq kiriting.','error');return;}
    if(!/^\+?\d{9,15}$/.test(phone)){toast('Telefon raqamini to‘g‘ri kiriting.','error');return;}
    state.submitting=true;
    qsa('.modal-actions button').forEach(b=>b.disabled=true);
    try{
      const duration=Math.max(0,Math.min(cfg.testMinutes*60,Math.round((Date.now()-Date.parse(state.draft.startedAt))/1000)));
      const payload={variant:state.draft.variant,student:{surname,firstName,phone},startedAt:state.draft.startedAt,submittedAt:nowIso(),durationSeconds:duration,answers:state.draft.answers};
      if(!state.supabase || !state.user) throw new Error(state.backendError || 'Server bilan sessiya o‘rnatilmagan. Natija lokal saqlanmaydi.');
      const result=await apiFunction('submit-attempt',payload);
      clearDraft(state.draft.variant); closeModal(); await showResult(result);
    }catch(err){toast(err.message||'Natijani yuborishda xatolik yuz berdi.','error');}
    finally{state.submitting=false;qsa('.modal-actions button').forEach(b=>b.disabled=false);}
  }

  async function showResult(r){
    clearInterval(state.timerId);
    const raw = r.parentCorrect == null ? '—' : `${r.parentCorrect}/45`;
    const bands = r.itemCorrect == null ? '—' : `${r.itemCorrect}/${r.itemTotal||55}`;
    const ms = r.msScore == null ? '—' : Number(r.msScore).toFixed(1);
    const level = r.level || '—';
    const statusText = r.raschStatus==='stable'?'Rasch bazasi yetarli':r.raschStatus==='provisional'?'Dastlabki Rasch bahosi':'Rasch bazasi hali shakllanmoqda';
    app.innerHTML=`<section><div class="section-head"><div><span class="eyebrow">Natija</span><h1 style="font-size:2.4rem;margin:.4rem 0">${r.variant}-variant yakunlandi</h1><p>Natija tarixga saqlandi. Bu urinishni o‘zgartirish yoki o‘chirish mumkin emas.</p></div></div>
      <div class="result-hero">
        <div class="result-box"><span>To‘liq to‘g‘ri savollar</span><strong>${raw}</strong></div>
        <div class="result-box"><span>To‘g‘ri bandlar</span><strong>${bands}</strong></div>
        <div class="result-box"><span>MS ball / daraja</span><strong>${ms}</strong><strong class="level-badge">${esc(level)}</strong></div>
      </div>
      <div class="section notice"><div>ⓘ</div><div><strong>${statusText}.</strong> MS ko‘rsatkichi variant bo‘yicha yig‘ilgan javoblar asosida hisoblanadi. Platformadagi MS rasmiy sertifikat bali emas.</div></div>
      <div class="hero-actions section"><a class="btn btn-primary" href="#/answers?variant=${r.variant}">Javob kalitini ko‘rish</a><a class="btn btn-secondary" href="#/history">Mening tarixim</a><a class="btn btn-secondary" href="#/variants">Boshqa variant</a></div>
    </section>`;
    history.replaceState(null,'',`#/result?variant=${r.variant}`);
  }

  async function pageHistory(){
    app.innerHTML=`<section><div class="section-head"><div><h1 style="font-size:2rem;margin:0">Mening tarixim</h1><p>Yakunlangan testlar bu yerda ko‘rinadi. Natijalarni tahrirlash yoki o‘chirish mumkin emas.</p></div></div><div class="skeleton"></div></section>`;
    try{
      await fetchHistory();
      if(!state.history.length){app.innerHTML=`<section><div class="section-head"><div><h1 style="font-size:2rem;margin:0">Mening tarixim</h1><p>Yakunlangan testlar shu yerda saqlanadi.</p></div></div><div class="empty">Hozircha yakunlangan test yo‘q.<div class="hero-actions" style="justify-content:center"><a class="btn btn-primary" href="#/variants">Variant ishlash</a></div></div></section>`;return;}
      const rows=state.history.map(x=>`<tr><td>${x.variant}-variant</td><td>${new Date(x.submitted_at).toLocaleString('uz-UZ')}</td><td>${x.parent_correct==null?'—':`${x.parent_correct}/45`}</td><td>${x.ms_score==null?'—':Number(x.ms_score).toFixed(1)}</td><td>${esc(x.level||'—')}</td><td>${formatTime(x.duration_seconds||0)}</td><td><a class="btn btn-secondary" style="padding:7px 10px" href="#/answers?variant=${x.variant}">Kalit</a></td></tr>`).join('');
      app.innerHTML=`<section><div class="section-head"><div><h1 style="font-size:2rem;margin:0">Mening tarixim</h1><p>${state.history.length} ta yakunlangan urinish.</p></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Variant</th><th>Sana</th><th>Natija</th><th>MS</th><th>Daraja</th><th>Vaqt</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
    }catch(err){app.innerHTML=`<div class="notice danger"><div>!</div><div>${esc(err.message)}</div></div>`;}
  }

  async function pageAnswers(){
    const {params}=routeInfo(); const requested=Number(params.get('variant'))||null;
    app.innerHTML=`<section><div class="section-head"><div><h1 style="font-size:2rem;margin:0">Javob kalitlari</h1><p>Faqat o‘zingiz yakunlagan variantlarning kaliti ochiladi.</p></div></div><div class="skeleton"></div></section>`;
    try{
      await fetchHistory();
      if(!state.unlockedVariants.length){app.innerHTML=`<section><div class="section-head"><div><h1 style="font-size:2rem;margin:0">Javob kalitlari</h1><p>Kalit test yakunlangandan keyin ochiladi.</p></div></div><div class="empty">Hali hech bir variant kaliti ochilmagan.<div class="hero-actions" style="justify-content:center"><a class="btn btn-primary" href="#/variants">Test boshlash</a></div></div></section>`;return;}
      const v = requested && state.unlockedVariants.includes(requested) ? requested : state.unlockedVariants[0];
      if(!state.supabase || !state.user) throw new Error(state.backendError || 'Server bilan xavfsiz sessiya o‘rnatilmadi.');
      const data=await apiFunction('get-answer-key',{variant:v});
      const choices=data.answers.filter(x=>x.question<=35).map(x=>`<div class="answer-row"><strong>${x.question}</strong><div>${esc(x.answer)}</div></div>`).join('');
      const open=[]; for(let n=36;n<=45;n++){const parts=data.answers.filter(x=>x.question===n);open.push(`<div class="answer-row"><strong>${n}</strong><div class="answer-parts">${parts.map(p=>`<div class="answer-part"><span>${p.subpart})</span>${renderMath(p.displayLatex||p.answer)}</div>`).join('')}</div></div>`)}
      const selector=state.unlockedVariants.map(x=>`<option value="${x}" ${x===v?'selected':''}>${x}-variant</option>`).join('');
      app.innerHTML=`<section><div class="section-head"><div><h1 style="font-size:2rem;margin:0">Javob kalitlari</h1><p>Kalit faqat yakunlangan variantlar uchun mavjud.</p></div><div class="form-group"><label>Variant</label><select class="input" id="answerVariant">${selector}</select></div></div><div class="grid" style="grid-template-columns:1fr 1fr;align-items:start"><div class="card"><h3>1–35 yopiq savollar</h3><div class="answer-list section">${choices}</div></div><div class="card"><h3>36–45 ochiq savollar</h3><div class="answer-list section">${open.join('')}</div></div></div></section>`;
      qs('#answerVariant').addEventListener('change',e=>location.hash=`#/answers?variant=${e.target.value}`);
    }catch(err){app.innerHTML=`<div class="notice danger"><div>!</div><div>${esc(err.message)}</div></div>`;}
  }

  function pageHelp(){
    app.innerHTML=`<section><div class="section-head"><div><h1 style="font-size:2rem;margin:0">Yordam</h1><p>Platformadan foydalanish bo‘yicha qisqa qo‘llanma.</p></div></div><div class="grid grid-3">
      <article class="card"><h3>Test va vaqt</h3><p>Har bir variant uchun 150 daqiqa beriladi. Sahifani yopib ochsangiz ham vaqt davom etadi. Javoblar shu qurilmada avtomatik saqlanadi.</p></article>
      <article class="card"><h3>Matematik javob</h3><p>36–45 savollarda matematik maydon ishlaydi. Kasr, ildiz, daraja va π ni virtual klaviatura yoki oddiy klaviatura orqali kiriting.</p></article>
      <article class="card"><h3>Tarix va kalit</h3><p>Yakunlangan natijalar o‘zgartirilmaydi. Javob kaliti faqat o‘sha variantni yakunlaganingizdan so‘ng ochiladi.</p></article>
    </div><div class="notice section"><div>ⓘ</div><div>Rasmiy Milliy sertifikat imtihoni natijasi vakolatli davlat tashkiloti tomonidan beriladi. Bu sayt mashq, diagnostika va tahlil uchun xizmat qiladi.</div></div></section>`;
  }

  async function router(){
    closeModal(); clearInterval(state.timerId);
    const {path}=routeInfo(); setActiveNav(path);
    try{
      if(path==='/') pageHome();
      else if(path==='/variants') pageVariants();
      else if(path==='/test') renderTest();
      else if(path==='/history') await pageHistory();
      else if(path==='/answers') await pageAnswers();
      else if(path==='/help') pageHelp();
      else if(path==='/result') pageHistory();
      else pageHome();
    }catch(err){app.innerHTML=`<div class="notice danger"><div>!</div><div>${esc(err.message||'Kutilmagan xatolik')}</div></div>`;}
    app.focus({preventScroll:true});
  }

  window.addEventListener('hashchange',router);
  window.addEventListener('beforeunload',saveDraft);

  (async()=>{
    try{ await initSupabase(); }
    catch(err){
      state.backendError = 'Supabase ulanishida xatolik: ' + (err?.message || 'noma’lum xato');
      state.supabase = null;
      state.user = null;
      toast(state.backendError,'error');
    }
    await router();
  })();
})();
