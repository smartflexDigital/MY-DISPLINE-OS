/* MY DISCIPLINE OS — Phase 1 MVP. All user data stays in this browser. */
(() => {
  "use strict";
  const KEY = "myDisciplineOS.data";
  const VERSION = 1;
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const pad = n => String(n).padStart(2, "0");
  const dateKey = (d=new Date()) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const parseDate = s => { const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); };
  const fmtDate = (s, options={day:"2-digit",month:"2-digit",year:"numeric"}) => {
    if (!s) return "—";
    return new Intl.DateTimeFormat("en-GB", options).format(typeof s==="string" ? parseDate(s) : s);
  };
  const timeNow = () => new Date().toLocaleTimeString("sw-TZ",{hour:"2-digit",minute:"2-digit",hour12:false});
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id-"+Date.now()+"-"+Math.random().toString(16).slice(2));
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const defaultSettings = {
    wakeTime:"05:00", sleepTime:"22:00", dinnerPrep:"19:00", dinnerTime:"20:00",
    pomodoro:25, focusMinutes:25, shortBreak:5, longBreak:15, theme:"light", language:"sw",
    planStart:"2026-10-15", planEnd:"2026-11-13", notifications:false,
    weeklyGoal:20, monthlyGoal:80, userName:"H", demoData:false
  };
  const initialData = () => ({
    version:VERSION, settings:{...defaultSettings}, tasks:[], schedule:[], projects:[], subjects:[],
    sessions:[], reviews:[], business:[], habits:[], xp:0, achievements:[], dayLogs:{}, activeProject:null
  });
  let data = loadData();
  let currentView = "dashboard";
  let calendarDate = new Date();
  let focus = {running:false, paused:false, mode:"focus", remaining:(Number(data.settings.focusMinutes)||25)*60, total:(Number(data.settings.focusMinutes)||25)*60, taskId:"", interval:null, startedAt:null};
  let lastTick = Date.now();
  let alarmAudio = null;
  let alarmInterval = null;
  let alarmActive = false;
  const cloud = {enabled:false,client:null,user:null,channel:null,ready:false,revision:0,localDirty:false,syncError:false,lastCloudJSON:null,writeTimer:null,syncInFlight:false,syncAgain:false,conflictOpen:false,initialChoiceOpen:false,localOnly:false,pendingRemote:null,pendingRemoteRevision:0};
  const cloudConfig = window.MY_DISCIPLINE_CLOUD || {};

  function loadData(){
    try {
      const raw=localStorage.getItem(KEY);
      if(!raw) return initialData();
      const parsed=JSON.parse(raw);
      if(!parsed || typeof parsed!=="object" || !Number.isInteger(parsed.version)) return initialData();
      return migrate(parsed);
    } catch(e){ console.error("Load data failed",e); return initialData(); }
  }
  function migrate(obj){
    const fresh=initialData();
    const merged={...fresh,...obj,settings:{...fresh.settings,...(obj.settings||{})}};
    if(obj.settings?.focusMinutes==null&&obj.settings?.pomodoro!=null)merged.settings.focusMinutes=Math.min(360,Math.max(1,Number(obj.settings.pomodoro)||25));
    ["tasks","schedule","projects","subjects","sessions","reviews","business","habits","achievements"].forEach(k=>{if(!Array.isArray(merged[k]))merged[k]=[];});
    if(!merged.dayLogs || typeof merged.dayLogs!=="object") merged.dayLogs={};
    merged.version=VERSION;
    return merged;
  }
  function save(syncCloud=true){
    try { localStorage.setItem(KEY,JSON.stringify(data)); }
    catch(e){ console.error("Save failed",e); toast("Imeshindikana kuhifadhi data. Export backup na angalia nafasi ya browser."); }
    if(syncCloud&&cloud.enabled&&cloud.user&&cloud.ready&&!cloud.localOnly){cloud.localDirty=true;clearTimeout(cloud.writeTimer);cloud.writeTimer=setTimeout(syncWorkspace,650);}
    return true;
  }
  function stableStringify(value){
    const normalize=v=>Array.isArray(v)?v.map(normalize):v&&typeof v==="object"?Object.keys(v).sort().reduce((o,k)=>(o[k]=normalize(v[k]),o),{}):v;
    return JSON.stringify(normalize(value));
  }
  function renderAuth(message="",loading=false){
    $("#appShell").hidden=true;$("#authScreen").hidden=false;
    const configured=!!(String(cloudConfig.url||"").trim()&&String(cloudConfig.publishableKey||"").trim());
    if(loading){$("#authScreen").innerHTML=`<section class="auth-card"><div class="brand-mark">M</div><h1>MY DISCIPLINE OS</h1><p>${esc(message||"Inaunganisha akaunti yako…")}</p></section>`;return;}
    const signup=cloud.authMode==="signup";
    $("#authScreen").innerHTML=`<section class="auth-card"><div class="brand-mark">M</div><p class="eyebrow">SYNC YA VIFAA</p><h1>${configured?"MY DISCIPLINE OS":"Cloud sync haijawekwa"}</h1><p class="muted">${configured?"Ingia kwa akaunti yako ili kutumia data ileile kwenye kompyuta na simu.":"Weka Project URL na Publishable key kwenye cloud-config.js ili kuwasha login na sync."}</p>${configured?`<form id="authForm"><div class="field"><label for="authEmail">Barua pepe</label><input id="authEmail" name="email" type="email" autocomplete="email" required></div><div class="field spacer-top"><label for="authPassword">Nenosiri</label><input id="authPassword" name="password" type="password" minlength="8" autocomplete="${signup?"new-password":"current-password"}" required></div><button class="btn primary spacer-top" id="authSubmit" type="submit">${signup?"Tengeneza akaunti":"Ingia"}</button></form><button class="link-btn spacer-top" id="authToggle" type="button">${signup?"Tayari una akaunti? Ingia":"Huna akaunti? Tengeneza mpya"}</button>`:""}<div id="authMessage" class="notice spacer-top" ${message?"":"hidden"}>${esc(message)}</div><button class="btn spacer-top" id="localMode" type="button">Tumia kwenye kifaa hiki tu</button><small class="muted auth-foot">Taarifa huhifadhiwa kwenye browser. Cloud sync hutumika ukiingia kwenye akaunti yako.</small></section>`;
    const toggle=$("#authToggle");if(toggle)toggle.addEventListener("click",()=>{cloud.authMode=signup?"signin":"signup";renderAuth();});
    const local=$("#localMode");if(local)local.addEventListener("click",useLocalOnly);
    const form=$("#authForm");if(form)form.addEventListener("submit",submitAuth);
  }
  function authMessage(text){const el=$("#authMessage");if(el){el.textContent=text;el.hidden=!text;}}
  async function submitAuth(event){
    event.preventDefault();if(!cloud.client){authMessage("Supabase haijaunganishwa. Angalia cloud-config.js na internet.");return;}
    const button=$("#authSubmit"),email=$("#authEmail").value.trim(),password=$("#authPassword").value;
    button.disabled=true;button.textContent="Subiri…";authMessage("");
    try{
      const result=cloud.authMode==="signup"?await cloud.client.auth.signUp({email,password,options:{emailRedirectTo:location.href}}):await cloud.client.auth.signInWithPassword({email,password});
      if(result.error)throw result.error;
      if(cloud.authMode==="signup"&&!result.data.session)authMessage("Akaunti imetengenezwa. Angalia email yako uthibitishe, kisha urudi uingie.");
      else authMessage("Umeingia. Inapakia data…");
    }catch(error){authMessage(error.message||"Imeshindikana kuingia. Hakiki email na nenosiri.");}
    finally{if($("#authSubmit")){button.disabled=false;button.textContent=cloud.authMode==="signup"?"Tengeneza akaunti":"Ingia";}}
  }
  function loadSupabaseSDK(){
    if(window.supabase?.createClient)return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      const timeout=setTimeout(()=>{script.remove();reject(new Error("Muda umeisha kusubiri Supabase CDN."));},12000);
      script.src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      script.async=true;
      script.onload=()=>{clearTimeout(timeout);window.supabase?.createClient?resolve():reject(new Error("Supabase SDK haikupatikana baada ya kupakia."));};
      script.onerror=()=>{clearTimeout(timeout);reject(new Error("Supabase CDN haikupatikana. Angalia internet."));};
      document.head.append(script);
    });
  }
  async function bootCloud(){
    const url=String(cloudConfig.url||"").trim(),key=String(cloudConfig.publishableKey||"").trim();
    if(!url&&!key){cloud.enabled=false;save(false);render();return;}
    cloud.enabled=true;cloud.authMode="signin";
    if(!url||!key){renderAuth("Weka Project URL na Publishable key zote mbili ndani ya cloud-config.js.");return;}
    if(!window.supabase?.createClient){renderAuth("Inaunganisha Supabase…",true);try{await loadSupabaseSDK();}catch(error){renderAuth((error.message||"SDK haikupatikana.")+" Unaweza kutumia app kwenye kifaa hiki pekee, au refresh ukipata internet.");return;}}
    renderAuth("Inaangalia login…",true);
    try{
      cloud.client=window.supabase.createClient(url,key);
      cloud.client.auth.onAuthStateChange((_event,session)=>setTimeout(()=>handleCloudSession(session),0));
      const {data:sessionData,error}=await cloud.client.auth.getSession();if(error)throw error;
      await handleCloudSession(sessionData.session);
    }catch(error){renderAuth("Imeshindikana kuunganisha Supabase: "+(error.message||"hakiki URL, key na internet."));}
  }
  async function handleCloudSession(session){
    const user=session?.user||null;
    if(!user){cloud.user=null;cloud.ready=false;cloud.revision=0;cloud.loadingUserId=null;if(cloud.channel){cloud.client.removeChannel(cloud.channel);cloud.channel=null;}if(cloud.enabled&&!cloud.localOnly)renderAuth();return;}
    if(cloud.user?.id===user.id&&cloud.ready)return;
    if(cloud.loadingUserId===user.id)return;
    cloud.loadingUserId=user.id;cloud.user=user;cloud.localOnly=false;renderAuth("Inapakua workspace yako…",true);
    try{
      const {data:row,error}=await cloud.client.from("discipline_workspaces").select("payload,revision,updated_at").eq("user_id",user.id).maybeSingle();
      if(error)throw error;
      const localRaw=localStorage.getItem(KEY),localOwner=localStorage.getItem(KEY+".cloudUser"),local=localRaw?migrate(JSON.parse(localRaw)):null;
      if(!row){
        if(localRaw){await chooseInitialWorkspace(local,null,localOwner===user.id?"Hakuna workspace ya cloud kwa akaunti hii. Unaweza kupakia data ya browser hii au kuanza tupu.":"Kuna data kwenye browser hii. Unaweza kuihamisha kwenye akaunti hii au kuanza tupu.",0);}
        else await finishWorkspace(initialData(),true,0);
      }else if(localRaw&&stableStringify(local)!==stableStringify(migrate(row.payload))){
        await chooseInitialWorkspace(local,migrate(row.payload),localOwner===user.id?"Data ya cloud na browser hii zinatofautiana. Chagua ipi itumike.":"Akaunti hii ina data ya cloud na browser hii ina data ya ndani. Chagua ipi itumike.",row.revision);
      }else await finishWorkspace(migrate(row.payload),false,row.revision);
    }catch(error){cloud.user=null;cloud.ready=false;cloud.loadingUserId=null;renderAuth("Cloud sync imeshindikana: "+(error.message||"hakiki SQL/RLS na project config."));return;}
    cloud.loadingUserId=null;
  }
  function chooseInitialWorkspace(local,remote,message,remoteRevision=0){
    return new Promise(resolve=>{
      const localCounts=`Tasks ${local.tasks.length}, ratiba ${local.schedule.length}, miradi ${local.projects.length}`;
      const remoteCounts=remote?`Tasks ${remote.tasks.length}, ratiba ${remote.schedule.length}, miradi ${remote.projects.length}`:"Workspace ya cloud bado haina data.";
      cloud.initialChoiceOpen=true;openModal("Chagua data ya kutumia",`<p>${esc(message)}</p><div class="notice"><strong>Browser hii</strong>${esc(localCounts)}</div><div class="notice spacer-top"><strong>Cloud</strong>${esc(remoteCounts)}</div><p class="muted">Ukitumia data ya cloud, rekodi za browser hii zitabadilishwa. Pakua backup hapa chini kwanza ikiwa unataka kuihifadhi.</p>`,`<button class="btn" id="backupBeforeCloud">↓ Pakua backup ya browser</button><button class="btn" id="chooseCloud">Tumia data ya cloud / tupu</button><button class="btn primary" id="chooseLocal">Hamisha data ya browser kwenda cloud</button>`);$("#modal").querySelectorAll("[data-close-modal]").forEach(b=>b.hidden=true);
      $("#backupBeforeCloud").addEventListener("click",exportJSON);
      $("#chooseCloud").addEventListener("click",async()=>{await finishWorkspace(remote||initialData(),!remote,remoteRevision);cloud.initialChoiceOpen=false;$("#modal").close();resolve();});
      $("#chooseLocal").addEventListener("click",async()=>{await finishWorkspace(local,true,remoteRevision);cloud.initialChoiceOpen=false;$("#modal").close();resolve();});
    });
  }
  async function finishWorkspace(workspace,upload,revision=0){
    data=migrate(workspace);cloud.revision=Number(revision)||0;localStorage.setItem(KEY+".cloudUser",cloud.user.id);save(false);cloud.ready=true;cloud.lastCloudJSON=stableStringify(data);cloud.localDirty=false;cloud.syncError=false;
    $("#authScreen").hidden=true;$("#appShell").hidden=false;render();updateCloudChrome();subscribeWorkspace();
    if(upload){cloud.localDirty=true;await syncWorkspace();}
  }
  function updateCloudChrome(){
    const status=$("#cloudStatus"),logout=$("#cloudSignOut");if(status){status.hidden=!cloud.user||!cloud.ready;status.textContent=cloud.syncError?"Sync hitilafu · imehifadhiwa hapa":cloud.localDirty?"Inasawazisha…":"Cloud ✓";status.title=cloud.user?.email||"";}if(logout)logout.hidden=!cloud.user||!cloud.ready;
  }
  async function syncWorkspace(){
    if(!cloud.user||!cloud.ready||!cloud.client)return;
    if(cloud.syncInFlight){cloud.syncAgain=true;return;}
    cloud.syncInFlight=true;let succeeded=false;updateCloudChrome();
    try{
      const snapshot=stableStringify(data),payload=JSON.parse(snapshot);
      if(cloud.revision===0){
        const result=await cloud.client.from("discipline_workspaces").insert({user_id:cloud.user.id,payload}).select("revision").single();
        if(result.error?.code==="23505"){const latest=await fetchWorkspace();cloud.revision=latest.revision;showRealtimeConflict(migrate(latest.payload),latest.revision);return;}
        if(result.error)throw result.error;cloud.revision=result.data.revision;
      }else{
        const result=await cloud.client.rpc("update_discipline_workspace",{p_payload:payload,p_expected_revision:cloud.revision});
        if(result.error?.code==="40001"){const latest=await fetchWorkspace();cloud.revision=latest.revision;showRealtimeConflict(migrate(latest.payload),latest.revision);return;}
        if(result.error)throw result.error;cloud.revision=result.data?.[0]?.revision||cloud.revision+1;
      }
      cloud.lastCloudJSON=snapshot;cloud.localDirty=stableStringify(data)!==snapshot;cloud.syncError=false;localStorage.setItem(KEY+".cloudUser",cloud.user.id);succeeded=true;
    }catch(error){console.error("Cloud sync failed",error);cloud.localDirty=true;cloud.syncError=true;}
    finally{cloud.syncInFlight=false;const again=cloud.syncAgain;cloud.syncAgain=false;updateCloudChrome();if((cloud.localDirty&&succeeded)||again&&succeeded){clearTimeout(cloud.writeTimer);cloud.writeTimer=setTimeout(syncWorkspace,150);}}
  }
  async function fetchWorkspace(){const {data,error}=await cloud.client.from("discipline_workspaces").select("payload,revision,updated_at").eq("user_id",cloud.user.id).single();if(error)throw error;return data;}
  function subscribeWorkspace(){
    if(cloud.channel)cloud.client.removeChannel(cloud.channel);
    cloud.channel=cloud.client.channel("workspace-"+cloud.user.id).on("postgres_changes",{event:"*",schema:"public",table:"discipline_workspaces",filter:"user_id=eq."+cloud.user.id},event=>{
      if(!event.new?.payload)return;const remote=migrate(event.new.payload),remoteJSON=stableStringify(remote),localJSON=stableStringify(data);
      if(remoteJSON===cloud.lastCloudJSON||remoteJSON===localJSON){cloud.revision=event.new.revision||cloud.revision;cloud.lastCloudJSON=remoteJSON;cloud.localDirty=false;updateCloudChrome();return;}
      if(cloud.localDirty){showRealtimeConflict(remote,event.new.revision);return;}
      applyRemoteWorkspace(remote,event.new.revision);
    }).subscribe(status=>{if(status==="CHANNEL_ERROR"||status==="TIMED_OUT")console.warn("Realtime status",status);});
  }
  function applyRemoteWorkspace(remote,revision=cloud.revision){if($("#modal")?.open){cloud.pendingRemote=remote;cloud.pendingRemoteRevision=revision;toast("Data ya kifaa kingine itasasishwa baada ya kufunga dirisha hili.");return;}data=migrate(remote);cloud.revision=Number(revision)||cloud.revision;save(false);cloud.lastCloudJSON=stableStringify(data);cloud.localDirty=false;render();updateCloudChrome();toast("Data mpya kutoka kifaa kingine imewasili.");}
  function showRealtimeConflict(remote,revision=cloud.revision){
    if(cloud.localDirty)clearTimeout(cloud.writeTimer);
    if(cloud.conflictOpen||$("#modal")?.open){cloud.pendingRemote=remote;cloud.pendingRemoteRevision=revision;if(!cloud.conflictOpen)toast("Kuna mabadiliko kutoka kifaa kingine; funga dirisha hili kuyapitia.");return;}cloud.pendingRemote=remote;cloud.pendingRemoteRevision=revision;cloud.conflictOpen=true;
    openModal("Mabadiliko kwenye vifaa viwili",'<p>Data imebadilika kwenye kifaa kingine wakati hapa pia kuna mabadiliko ambayo hayajasawazishwa. Chagua data ya kuhifadhi.</p>','<button class="btn" id="keepThisDevice">Hifadhi ya hapa</button><button class="btn primary" id="useOtherDevice">Tumia mabadiliko ya kifaa kingine</button>');$("#modal").querySelectorAll("[data-close-modal]").forEach(b=>b.hidden=true);
    $("#keepThisDevice").addEventListener("click",()=>{cloud.conflictOpen=false;const latest=cloud.pendingRemote||remote;cloud.revision=cloud.pendingRemoteRevision||revision;cloud.lastCloudJSON=stableStringify(latest);cloud.pendingRemote=null;cloud.pendingRemoteRevision=0;cloud.localDirty=true;$("#modal").close();syncWorkspace();});
    $("#useOtherDevice").addEventListener("click",()=>{cloud.conflictOpen=false;const latest=cloud.pendingRemote||remote,latestRevision=cloud.pendingRemoteRevision||revision;cloud.pendingRemote=null;cloud.pendingRemoteRevision=0;$("#modal").close();applyRemoteWorkspace(latest,latestRevision);});
  }
  async function signOutCloud(){if(!cloud.client)return;if(cloud.localDirty)await syncWorkspace();const {error}=await cloud.client.auth.signOut();if(error)toast("Imeshindwa kutoka: "+error.message);}
  function useLocalOnly(){cloud.localOnly=true;cloud.enabled=false;cloud.user=null;cloud.ready=false;if(cloud.client)cloud.client.auth.signOut().catch(()=>{});$("#authScreen").hidden=true;$("#appShell").hidden=false;render();toast("Unatumia data ya browser hii tu; cloud sync haipo.");}
  function toast(message){
    const el=document.createElement("div"); el.className="toast"; el.textContent=message; $("#toastRegion").append(el);
    setTimeout(()=>el.remove(),3500);
  }
  function greeting(){
    const h=new Date().getHours();
    return h<12?"Habari za asubuhi":h<17?"Habari za mchana":h<20?"Habari za jioni":"Pumzika vizuri";
  }
  function statusLabel(s){return ({notStarted:"Not Started",inProgress:"In Progress",completed:"Completed",skipped:"Skipped",rescheduled:"Rescheduled"})[s]||s||"Not Started";}
  function priorityTag(p){return `<span class="tag ${esc((p||"medium").toLowerCase())}">${esc(p||"Medium")}</span>`;}
  function isDone(t){return t.status==="completed";}
  function todaysTasks(){return data.tasks.filter(t=>t.date===dateKey() && t.status!=="skipped");}
  function dailyPct(){
    const ts=todaysTasks(); if(!ts.length)return 0;
    return Math.round(ts.filter(isDone).length/ts.length*100);
  }
  function daySchedule(){return data.schedule.filter(s=>s.date===dateKey()).sort((a,b)=>(a.start||"").localeCompare(b.start||""));}
  function nextSchedule(){
    const now=timeNow();
    return daySchedule().find(s=>s.status!=="completed" && s.status!=="skipped" && (s.start||"99:99")>=now) || null;
  }
  function formatDuration(min){if(min<60)return `${min} dk`;return `${Math.floor(min/60)}h ${min%60?min%60+"dk":""}`.trim();}
  function completedStreak(){
    let streak=0, d=parseDate(dateKey());
    while(true){
      const k=dateKey(d), log=data.dayLogs[k];
      if(log && log.closed && (log.completed||0)>0){streak++;d.setDate(d.getDate()-1);continue;}
      if(k===dateKey() && !log){d.setDate(d.getDate()-1);continue;}
      break;
    }
    return streak;
  }
  function addXP(task){
    const base=Math.min(50,Math.max(5,Math.round((Number(task.estimate)||25)/15)*5));
    data.xp=(data.xp||0)+base;
    if(!data.achievements.includes("first-task"))data.achievements.push("first-task");
    const todayCount=data.tasks.filter(t=>t.date===dateKey()&&t.status==="completed").length;
    if(todayCount>=3&&!data.achievements.includes("three-tasks"))data.achievements.push("three-tasks");
    return base;
  }
  function setTaskStatus(id,status){
    const task=data.tasks.find(t=>t.id===id); if(!task)return;
    if(status==="completed" && task.status!=="completed"){
      task.status="completed"; task.completedAt=new Date().toISOString(); task.xpAwarded=addXP(task);
      toast(`Kazi imekamilika. +${task.xpAwarded} XP`);
    }else if(status!=="completed"){
      task.status=status; if(status==="rescheduled")task.rescheduledAt=new Date().toISOString();
    }
    save(); render();
  }
  function openModal(title,body,actions){
    $("#modalContent").innerHTML=`<div class="modal-head"><h2>${title}</h2><button class="icon-btn" data-close-modal aria-label="Funga">×</button></div><div class="modal-body">${body}</div><div class="modal-foot">${actions||'<button class="btn" data-close-modal>Funga</button>'}</div>`;
    const dlg=$("#modal"); if(!dlg.open)dlg.showModal();
    $$("[data-close-modal]",dlg).forEach(b=>b.addEventListener("click",()=>dlg.close()));
  }
  function field(label,name,value="",type="text",extra=""){
    return `<div class="field"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}></div>`;
  }
  function selectField(label,name,options,value){
    return `<div class="field"><label for="${name}">${label}</label><select id="${name}" name="${name}">${options.map(o=>`<option value="${esc(o[0])}" ${o[0]===value?"selected":""}>${esc(o[1])}</option>`).join("")}</select></div>`;
  }
  function pageHead(eyebrow,title,desc,actions=""){
    return `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${desc}</p></div><div class="head-actions">${actions}</div></div>`;
  }
  function cardTitle(title,sub="",action=""){
    return `<div class="section-title"><div><h2>${title}</h2>${sub?`<p>${sub}</p>`:""}</div>${action}</div>`;
  }
  function stat(label,value,sub,icon,positive=false){
    return `<div class="card stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon">${icon}</span></div><div class="stat-value">${value}</div><div class="stat-sub ${positive?"positive":""}">${sub}</div></div>`;
  }
  function empty(icon,title,desc,button=""){
    return `<div class="empty"><div class="empty-icon">${icon}</div><strong>${title}</strong>${desc}${button?`<div class="spacer-top">${button}</div>`:""}</div>`;
  }
  function taskRow(t, compact=false){
    return `<div class="task-row ${isDone(t)?"done":""}"><input class="check" type="checkbox" data-complete="${t.id}" ${isDone(t)?"checked":""} aria-label="Kamilisha ${esc(t.title)}"><div class="task-main"><strong>${esc(t.title)}</strong><small>${esc(t.category||"Binafsi")} · ${t.estimate||25} dk${t.deadline?` · Deadline ${fmtDate(t.deadline)}`:""}</small></div>${priorityTag(t.priority)}${compact?"":`<button class="icon-action" data-edit-task="${t.id}">Edit</button>`}</div>`;
  }
  function timelineItem(s){
    return `<div class="timeline-item ${s.status==="completed"?"done":""}"><div class="timeline-time">${esc(s.start)}${s.end?`–${esc(s.end)}`:""}</div><div class="timeline-dot"></div><div class="timeline-copy"><strong>${esc(s.title)}</strong><small>${esc(s.category||"Shughuli")} · ${statusLabel(s.status)}</small></div></div>`;
  }
  function renderDashboard(){
    const ts=todaysTasks(), done=ts.filter(isDone).length, next=nextSchedule(), sched=daySchedule();
    const greetingName=esc(data.settings.userName||"rafiki");
    const mainTask=ts.filter(t=>t.mit&&!isDone(t)).slice(0,3);
    const overdue=data.tasks.filter(t=>t.status!=="completed"&&t.status!=="skipped"&&t.deadline&&t.deadline<dateKey());
    const focusMins=data.sessions.filter(s=>s.date===dateKey()&&s.mode==="focus").reduce((a,s)=>a+(s.minutes||0),0);
    const monthTasks=data.tasks.filter(t=>t.date&&t.date.slice(0,7)===dateKey().slice(0,7));
    const proj=data.projects.find(p=>p.id===data.activeProject)||data.projects.find(p=>p.status==="active");
    return `${pageHead(`DASHBOARD · ${fmtDate(dateKey())}`,`${greeting()}, ${greetingName} 👋`,"Kila siku ni nafasi ya kufanya hatua moja yenye maana.",`<button class="btn" data-action="start-day">＋ Anza siku</button><button class="btn primary" data-action="close-day">Funga siku</button>`)}
      <div class="grid stats-grid">
        ${stat("KAZI ZA LEO",`${done}/${ts.length}`,ts.length?`${ts.length-done} bado hazijakamilika`:"Ongeza kazi za leo","☑",done>0)}
        ${stat("UTEKELEZAJI",`${dailyPct()}%`,"Progress ya kazi za leo","◔",dailyPct()>=70)}
        ${stat("FOCUS YA LEO",formatDuration(focusMins),"Muda wa focus uliorekodiwa","◷")}
        ${stat("JUMLA YA XP",data.xp||0,`Level ${Math.floor((data.xp||0)/250)+1} · ${250-(data.xp||0)%250} XP hadi level inayofuata`,"✦",true)}
      </div>
      <div class="grid dashboard-grid">
        <div>
          <div class="card hero-card"><div class="eyebrow">LENGO LA LEO</div><h2>${mainTask.length?esc(mainTask[0].title):"Chagua jambo moja muhimu"}</h2><p>${mainTask.length?esc(mainTask[0].outcome||"Kamilisha hatua inayofuata kwa umakini."): "Chagua hadi kazi tatu muhimu (MIT) na anza na moja tu. Maendeleo hutokana na kazi iliyokamilika."}</p><div class="hero-actions"><button class="btn" data-view="focus">◷ Anza Focus Mode</button><button class="btn ghost" data-action="add-task">＋ Ongeza task</button></div></div>
          <div class="card" style="margin-bottom:16px">${cardTitle("Kazi kuu za leo","Most Important Tasks (MIT) — zisizozidi tatu",`<button class="link-btn" data-view="tasks">Tasks zote →</button>`)}
            ${mainTask.length?`<div class="task-list">${mainTask.map(t=>taskRow(t,true)).join("")}</div>`:empty("✧","Hakuna MIT zilizochaguliwa","Ongeza task kisha weka alama ya MIT.",'<button class="btn primary small" data-action="add-task">＋ Ongeza task</button>')}
          </div>
          <div class="card">${cardTitle("Ratiba ya leo","Shughuli zilizopangwa kwa muda",`<button class="link-btn" data-view="schedule">Ratiba →</button>`)}
            ${sched.length?`<div class="timeline">${sched.slice(0,6).map(timelineItem).join("")}</div>`:empty("▦","Ratiba bado iko wazi","Ongeza vipindi vyako vya leo.",'<button class="btn small" data-action="add-schedule">＋ Ongeza shughuli</button>')}
          </div>
        </div>
        <div>
          <div class="card" style="margin-bottom:16px">${cardTitle("Kazi inayofuata","Usisubiri motisha; anza kwa hatua ndogo")}
            ${next?`<div class="mini-stat"><small>${esc(next.start)} · ${esc(next.category||"Shughuli")}</small><strong style="font-size:16px">${esc(next.title)}</strong><p class="muted" style="font-size:11px;line-height:1.6">${esc(next.note||"")}</p><button class="btn primary small" data-action="start-next" data-id="${next.id}">Anza shughuli</button></div>`:empty("◷","Hakuna shughuli inayofuata","Ratiba ya leo haina shughuli iliyobaki yenye muda wa baadaye.")}
          </div>
          <div class="card" style="margin-bottom:16px">${cardTitle("Maendeleo ya siku")}
            <div class="progress-row"><span>Kazi zilizokamilika</span><span>${dailyPct()}%</span></div><div class="progress"><span style="width:${dailyPct()}%"></span></div>
            <div class="mini-grid spacer-top"><div class="mini-stat"><small>MIT zilizokamilika</small><strong>${ts.filter(t=>t.mit&&isDone(t)).length}/3</strong></div><div class="mini-stat"><small>Kazi zilizochelewa</small><strong>${overdue.length}</strong></div></div>
          </div>
          <div class="card" style="margin-bottom:16px">${cardTitle("Mradi mkuu","Lenga kumaliza kabla ya kuanza mwingine")}
            ${proj?`<strong>${esc(proj.name)}</strong><p class="muted" style="font-size:11px;line-height:1.6;margin:7px 0 14px">${esc(proj.goal||"")}</p><div class="progress-row"><span>Progress</span><span>${Number(proj.progress)||0}%</span></div><div class="progress"><span style="width:${Number(proj.progress)||0}%"></span></div><button class="link-btn spacer-top" data-view="projects">Fungua mradi →</button>`:empty("◇","Hakuna mradi mkuu","Ongeza mradi mmoja wa kuupa kipaumbele.",'<button class="btn small" data-action="add-project">＋ Mradi</button>')}
          </div>
          ${overdue.length?`<div class="card"><div class="section-title"><h2>Kazi zilizochelewa</h2><span class="tag high">${overdue.length}</span></div>${overdue.slice(0,3).map(t=>`<div class="task-row"><div class="task-main"><strong>${esc(t.title)}</strong><small>Deadline ${fmtDate(t.deadline)}</small></div><button class="icon-action" data-edit-task="${t.id}">Panga</button></div>`).join("")}</div>`:""}
        </div>
      </div>`;
  }
  function renderTasks(){
    const ts=[...data.tasks].sort((a,b)=>(a.date||"").localeCompare(b.date||""));
    return `${pageHead("KAZI NA MATOKEO","Task Manager","Andika matokeo unayotaka, panga muda na kamilisha kazi moja baada ya nyingine.",'<button class="btn primary" data-action="add-task">＋ Ongeza task</button>')}
      <div class="grid stats-grid">${stat("JUMLA YA KAZI",ts.length,"Kazi zote zilizosajiliwa","☑")}${stat("ZILIZOKAMILIKA",ts.filter(isDone).length,"Zilizothibitishwa","✓",true)}${stat("ZINAZOENDELEA",ts.filter(t=>t.status==="inProgress").length,"In Progress","◷")}${stat("ZILIZOCHELEWA",ts.filter(t=>t.status!=="completed"&&t.deadline&&t.deadline<dateKey()).length,"Deadline imepita","!",false)}</div>
      <div class="card"><div class="filters"><input id="taskSearch" placeholder="Tafuta kazi..." aria-label="Tafuta kazi"><select id="taskStatus"><option value="">Status zote</option><option value="notStarted">Not Started</option><option value="inProgress">In Progress</option><option value="completed">Completed</option><option value="skipped">Skipped</option><option value="rescheduled">Rescheduled</option></select><select id="taskPriority"><option value="">Priority zote</option><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select><select id="taskCategory"><option value="">Category zote</option>${[...new Set(ts.map(t=>t.category).filter(Boolean))].map(c=>`<option>${esc(c)}</option>`).join("")}</select></div><div id="taskTable">${taskTable(ts)}</div></div>`;
  }
  function taskTable(ts){
    if(!ts.length)return empty("☑","Hakuna kazi hapa","Ongeza kazi yako ya kwanza ili uanze kufuatilia utekelezaji.",'<button class="btn primary small" data-action="add-task">＋ Ongeza task</button>');
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Kazi</th><th>Tarehe</th><th>Priority</th><th>Status</th><th>Muda</th><th>Vitendo</th></tr></thead><tbody>${ts.map(t=>`<tr><td><strong>${esc(t.title)}</strong><div class="muted" style="margin-top:4px">${esc(t.category||"Binafsi")}${t.mit?' · MIT':''}</div></td><td>${fmtDate(t.date)}</td><td>${priorityTag(t.priority)}</td><td><select class="inline-status" data-status-id="${t.id}" aria-label="Status ya ${esc(t.title)}">${["notStarted","inProgress","completed","skipped","rescheduled"].map(s=>`<option value="${s}" ${t.status===s?"selected":""}>${statusLabel(s)}</option>`).join("")}</select></td><td>${t.estimate||25} dk</td><td><div class="row-actions"><button class="icon-action" data-edit-task="${t.id}">Edit</button><button class="icon-action" data-delete-task="${t.id}">Futa</button></div></td></tr>`).join("")}</tbody></table></div>`;
  }
  function renderSchedule(){
    const today=daySchedule();
    const month=calendarDate.getMonth(), year=calendarDate.getFullYear();
    const first=new Date(year,month,1), offset=(first.getDay()+6)%7, days=new Date(year,month+1,0).getDate();
    const names=["Jtatu","Jnne","Jtano","Alh","Ijum","Jmos","Jpil"];
    let cells=names.map(n=>`<div class="cal-day-name">${n}</div>`).join("");
    for(let i=0;i<offset;i++)cells+=`<div class="cal-day muted"></div>`;
    for(let d=1;d<=days;d++){
      const key=`${year}-${pad(month+1)}-${pad(d)}`, count=data.schedule.filter(s=>s.date===key).length;
      cells+=`<button class="cal-day ${key===dateKey()?"today":""}" data-calendar-day="${key}"><span class="daynum">${d}</span>${count?`<div class="cal-dot"></div><small>${count} shughuli</small>`:""}</button>`;
    }
    return `${pageHead("TIME MANAGEMENT","Ratiba","Panga siku yako kwa uhalisia. Vipindi vinavyogongana vitaonyeshwa kabla ya kuhifadhi.",'<button class="btn primary" data-action="add-schedule">＋ Ongeza shughuli</button>')}
      <div class="grid dashboard-grid">
        <div class="card">${cardTitle("Ratiba ya siku","Shughuli za tarehe iliyochaguliwa",`<input type="date" id="scheduleDate" value="${dateKey()}" aria-label="Chagua tarehe">`)}
          <div id="scheduleDayList">${scheduleList(dateKey())}</div>
        </div>
        <div class="card"><div class="calendar-head"><button class="icon-action" data-calendar-shift="-1">←</button><strong>${new Intl.DateTimeFormat("sw-TZ",{month:"long",year:"numeric"}).format(calendarDate)}</strong><button class="icon-action" data-calendar-shift="1">→</button></div><div class="calendar">${cells}</div><p class="muted" style="font-size:10px;margin:12px 0 0">Chagua tarehe ili kuona ratiba ya siku hiyo.</p></div>
      </div>
      <div class="card spacer-top">${cardTitle("Ukaguzi wa ratiba","Kabla ya kuhifadhi, hakikisha muda na kipaumbele vinaendana na siku yako.")}<div id="scheduleWarnings">${scheduleWarnings(dateKey())}</div></div>`;
  }
  function scheduleList(date){
    const items=data.schedule.filter(s=>s.date===date).sort((a,b)=>a.start.localeCompare(b.start));
    return items.length?`<div class="timeline">${items.map(s=>`${timelineItem(s)}<div class="row-actions" style="margin:-10px 0 14px 93px"><button class="icon-action" data-edit-schedule="${s.id}">Edit</button><button class="icon-action" data-delete-schedule="${s.id}">Futa</button><select class="inline-status" data-schedule-status="${s.id}" aria-label="Hali ya ${esc(s.title)}">${["notStarted","inProgress","completed","skipped","rescheduled"].map(st=>`<option value="${st}" ${s.status===st?"selected":""}>${statusLabel(st)}</option>`).join("")}</select></div>`).join("")}</div>`:empty("▦","Hakuna shughuli kwa tarehe hii","Unaweza kupanga masomo, biashara, mapumziko au kazi za miradi.",'<button class="btn small primary" data-action="add-schedule">＋ Ongeza shughuli</button>');
  }
  function scheduleWarnings(date){
    const list=data.schedule.filter(s=>s.date===date&&s.start&&s.end).sort((a,b)=>a.start.localeCompare(b.start));
    const conflicts=[];
    for(let i=1;i<list.length;i++)if(list[i].start<list[i-1].end)conflicts.push(`${list[i-1].title} (${list[i-1].start}–${list[i-1].end}) inagongana na ${list[i].title} (${list[i].start}–${list[i].end}).`);
    const minutes=list.reduce((n,s)=>n+Math.max(0,clockMin(s.end)-clockMin(s.start)),0);
    return `${conflicts.length?`<div class="notice"><strong>⚠ Vipindi vinavyogongana</strong>${conflicts.map(esc).join("<br>")}</div>`:`<span class="pill">✓ Hakuna mgongano uliogunduliwa</span>`}<p class="muted" style="font-size:11px;margin-top:12px">Muda uliopangwa: <strong>${formatDuration(minutes)}</strong>. Mfumo hautahamisha shughuli bila idhini yako.</p>`;
  }
  function clockMin(t){if(!t)return 0;const [h,m]=t.split(":").map(Number);return h*60+m;}
  function renderFocus(){
    const taskOptions=data.tasks.filter(t=>t.status!=="completed"&&t.status!=="skipped").map(t=>`<option value="${t.id}" ${focus.taskId===t.id?"selected":""}>${esc(t.title)}</option>`).join("");
    const minutes=Math.min(360,Math.max(1,Number(data.settings.focusMinutes)||25)),preset=[25,45,60,90].includes(minutes)?String(minutes):"custom";
    return `${pageHead("UMAKINI","Focus Mode","Fanya kazi moja kwa wakati. Ikiwa oda ya bando itaingia, pause kwa sababu halisi kisha urudi.",'<button class="btn" data-view="tasks">☑ Chagua task</button>')}
      <div class="focus-wrap"><div class="card focus-panel"><span class="pill">● ${focus.running?(focus.paused?"Imesitishwa":"Focus inaendelea"):"Tayari kuanza"}</span>${alarmActive?'<div class="notice spacer-top" role="alert"><strong>⏰ Alarm inaendelea</strong>Bonyeza “Simamisha alarm” ukiwa tayari.</div>':''}<div class="field focus-task-select spacer-top"><label for="focusTask">Kazi unayofanyia kazi</label><select id="focusTask"><option value="">Chagua kazi...</option>${taskOptions}</select></div><div class="field spacer-top"><label for="focusDuration">Muda wa focus (dakika)</label><select id="focusDuration" ${focus.running||focus.paused?"disabled":""}><option value="25" ${preset==="25"?"selected":""}>25 dakika</option><option value="45" ${preset==="45"?"selected":""}>45 dakika</option><option value="60" ${preset==="60"?"selected":""}>60 dakika</option><option value="90" ${preset==="90"?"selected":""}>90 dakika</option><option value="custom" ${preset==="custom"?"selected":""}>Muda maalum…</option></select></div><div class="field spacer-top" id="customDurationField" ${preset!=="custom"?"hidden":""}><label for="customDuration">Dakika maalum (1–360; hadi saa 6)</label><input id="customDuration" type="number" min="1" max="360" step="1" value="${minutes}" ${focus.running||focus.paused?"disabled":""}></div><div class="focus-ring"><div><div class="timer" id="timerDisplay">${formatTimer(focus.remaining)}</div><div class="timer-label" id="timerMode">${focus.mode==="focus"?"FOCUS SESSION":focus.mode==="short"?"MAPUMZIKO MAFUPI":"MAPUMZIKO MAREFU"}</div></div></div><div class="focus-controls"><button class="btn primary" data-action="focus-toggle">${focus.running?(focus.paused?"▶ Endelea":"Ⅱ Pause"):"▶ Anza focus"}</button><button class="btn" data-action="focus-reset">↻ Anza upya</button><button class="btn" data-action="focus-finish">✓ Rekodi session</button>${alarmActive?'<button class="btn danger" data-action="alarm-stop">■ Simamisha alarm</button>':''}</div><div class="grid mini-grid spacer-top"><div class="mini-stat"><small>Muda uliochaguliwa</small><strong>${minutes} dk</strong></div><div class="mini-stat"><small>Focus leo</small><strong>${formatDuration(data.sessions.filter(s=>s.date===dateKey()&&s.mode==="focus").reduce((a,s)=>a+s.minutes,0))}</strong></div></div><p class="muted" style="font-size:11px;line-height:1.7;margin-top:18px">Timer ikifika sifuri, alarm itaendelea hadi uisimamishe. Arifa ya browser itaonekana pia ukiruhusu notifications kwenye Settings. Browser lazima ibaki wazi ili timer isikose mwisho wa session.</p></div></div>`;
  }
  function formatTimer(sec){return `${pad(Math.floor(Math.max(0,sec)/60))}:${pad(Math.max(0,sec)%60)}`;}
  function renderProjects(){
    const active=data.projects.filter(p=>p.status==="active"), backlog=data.projects.filter(p=>p.status!=="active");
    return `${pageHead("BUILD & SHIP","Miradi","Weka mradi mmoja mkuu kwenye utekelezaji; mawazo mengine yabaki backlog.",'<button class="btn primary" data-action="add-project">＋ Ongeza mradi</button>')}
      <div class="notice" style="margin-bottom:16px"><strong>Kanuni ya mradi mmoja mkuu</strong>Chagua mradi mmoja unaopata muda wako wa kina. Miradi mingine inaweza kusubiri bila kupotea.</div>
      <div class="section-title"><h2>Mradi mkuu / unaoendelea</h2></div><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(245px,1fr));margin-bottom:24px">${active.length?active.map(projectCard).join(""):empty("◇","Hakuna mradi unaoendelea","Chagua kazi moja ya kujenga au kutengeneza.",'<button class="btn small primary" data-action="add-project">＋ Ongeza mradi</button>')}</div>
      <div class="section-title"><h2>Backlog</h2><span class="tag">${backlog.length} miradi</span></div><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(245px,1fr))">${backlog.length?backlog.map(projectCard).join(""):empty("↗","Backlog iko wazi","Miradi ya baadaye itaonekana hapa.")}</div>`;
  }
  function projectCard(p){
    return `<div class="card project-card"><div class="project-top"><span class="tag">${esc(p.category||"Mradi")}</span><span class="tag ${p.status==="active"?"low":""}">${p.status==="active"?"ACTIVE":"BACKLOG"}</span></div><h3>${esc(p.name)}</h3><p>${esc(p.goal||"Bado hujaweka lengo la mradi.")}</p><div class="progress-row"><span>Progress</span><span>${Number(p.progress)||0}%</span></div><div class="progress"><span style="width:${Number(p.progress)||0}%"></span></div><div class="project-foot"><span>${p.deadline?`Deadline ${fmtDate(p.deadline)}`:"Hakuna deadline"}</span><span>${(p.steps||[]).filter(s=>s.done).length}/${(p.steps||[]).length} hatua</span></div><div class="row-actions"><button class="btn small" data-edit-project="${p.id}">Hariri</button><button class="btn small" data-toggle-project="${p.id}">${p.status==="active"?"Weka backlog":"Anzisha"}</button><button class="icon-action" data-delete-project="${p.id}">Futa</button></div></div>`;
  }
  function renderStudy(){
    const subs=data.subjects;
    return `${pageHead("LEARN SMART","Mfumo wa Masomo","Pima uelewa kwa active recall na maswali, si muda wa kukaa na kitabu pekee.",'<button class="btn primary" data-action="add-subject">＋ Ongeza somo</button>')}
      <div class="grid stats-grid">${stat("MASOMO",subs.length,"Masomo yaliyosajiliwa","▤")}${stat("SESSIONS",data.sessions.filter(s=>s.mode==="study").length,"Vipindi vya masomo vilivyorekodiwa","◷")}${stat("MUDA WA MASOMO",formatDuration(data.sessions.filter(s=>s.mode==="study").reduce((a,s)=>a+s.minutes,0)),"Jumla ya muda uliorekodiwa","⌁")}${stat("FLASHCARDS",subs.reduce((n,s)=>n+(s.cards||[]).length,0),"Kadi za kujikumbusha","✧")}</div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">${subs.length?subs.map(s=>`<div class="card project-card"><div class="project-top"><span class="tag">${esc(s.difficulty||"Haijawekwa")}</span><span class="tag">${(s.cards||[]).length} flashcards</span></div><h3>${esc(s.name)}</h3><p>${esc(s.notes||"Ongeza topics na maelezo ya somo hili.")}</p><div class="progress-row"><span>Uelewa binafsi</span><span>${s.understanding||0}%</span></div><div class="progress green"><span style="width:${s.understanding||0}%"></span></div><div class="row-actions"><button class="btn small primary" data-study-session="${s.id}">Rekodi session</button><button class="btn small" data-flashcards="${s.id}">Flashcards</button><button class="icon-action" data-edit-subject="${s.id}">Edit</button></div></div>`).join(""):empty("▤","Bado hakuna masomo","Ongeza jina la somo lako mwenyewe; mfumo hautabuni masomo.",'<button class="btn primary small" data-action="add-subject">＋ Ongeza somo</button>')}</div>
      <div class="card spacer-top">${cardTitle("Session za hivi karibuni","Muda na matokeo ya kujipima")}${data.sessions.filter(s=>s.mode==="study").length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Somo</th><th>Tarehe</th><th>Muda</th><th>Uelewa</th><th>Nilichojifunza</th></tr></thead><tbody>${data.sessions.filter(s=>s.mode==="study").slice(-10).reverse().map(s=>`<tr><td>${esc(s.subjectName||"Somo")}</td><td>${fmtDate(s.date)}</td><td>${s.minutes} dk</td><td>${s.understanding??"—"}%</td><td>${esc(s.learned||"—")}</td></tr>`).join("")}</tbody></table></div>`:empty("◷","Hakuna session bado","Baada ya kusoma, rekodi uelewa na mada ya kurudia.")}</div>`;
  }
  function renderBusiness(){
    const b=data.business.filter(x=>x.date===dateKey());
    const revenue=b.reduce((a,x)=>a+(Number(x.revenue)||0),0), cost=b.reduce((a,x)=>a+(Number(x.cost)||0),0);
    return `${pageHead("BIASHARA YA BANDO","Business Tracker","Rekodi oda na takwimu kwa hiari. Wateja wanaweza kuwasiliana wakati wowote — hakuna saa za huduma zilizofungwa.",'<button class="btn primary" data-action="add-sale">＋ Rekodi oda</button>')}
      <div class="grid stats-grid">${stat("ODA ZA LEO",b.length,"Rekodi za leo","↗")}${stat("MAPATO YA LEO",money(revenue),"Weka kwa currency uliyochagua","↗",true)}${stat("GHARAMA",money(cost),"Gharama zilizorekodiwa","⌁")}${stat("TOFAUTI",money(revenue-cost),"Mapato ukitoa gharama zilizowekwa","✦",revenue>=cost)}</div>
      <div class="notice" style="margin-bottom:16px"><strong>Faragha ya biashara</strong>Usihifadhi PIN, nywila, au taarifa nyeti za wateja hapa. Hii ni tracker ya ndani ya browser, si mfumo wa malipo au uhasibu unaounganishwa na Halotel.</div>
      <div class="card">${cardTitle("Rekodi za oda","Data inatokana na rekodi unazoingiza wewe.")}${data.business.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Tarehe</th><th>Aina / maelezo</th><th>Mapato</th><th>Gharama</th><th>Vitendo</th></tr></thead><tbody>${data.business.slice().reverse().map(x=>`<tr><td>${fmtDate(x.date)}</td><td><strong>${esc(x.title)}</strong><div class="muted">${esc(x.note||"")}</div></td><td>${money(x.revenue)}</td><td>${money(x.cost)}</td><td><button class="icon-action" data-delete-sale="${x.id}">Futa</button></td></tr>`).join("")}</tbody></table></div>`:empty("↗","Bado hakuna rekodi","Rekodi oda au muhtasari wa mauzo ili kupata ripoti yenye data halisi.",'<button class="btn primary small" data-action="add-sale">＋ Rekodi oda</button>')}</div>`;
  }
  function money(n){return new Intl.NumberFormat("en-TZ",{style:"currency",currency:"TZS",maximumFractionDigits:0}).format(Number(n)||0);}
  function renderReviews(){
    const today=data.dayLogs[dateKey()]||{};
    const weeks=data.reviews.filter(r=>r.type==="weekly");
    return `${pageHead("REFLECT & IMPROVE","Tathmini","Jifunze kutokana na siku iliyopita bila kujilaumu. Tumia data halisi kuboresha hatua inayofuata.",'<button class="btn primary" data-action="daily-review">＋ Tathmini ya leo</button>')}
      <div class="grid dashboard-grid"><div class="card">${cardTitle("Muhtasari wa leo",fmtDate(dateKey()))}<div class="mini-grid"><div class="mini-stat"><small>Kazi zilizokamilika</small><strong>${today.completed||0}</strong></div><div class="mini-stat"><small>Utekelezaji</small><strong>${today.pct??dailyPct()}%</strong></div><div class="mini-stat"><small>Focus</small><strong>${formatDuration(data.sessions.filter(s=>s.date===dateKey()&&s.mode==="focus").reduce((a,s)=>a+s.minutes,0))}</strong></div><div class="mini-stat"><small>XP</small><strong>${data.xp||0}</strong></div></div>${today.closed?`<p class="muted" style="font-size:11px;margin-top:15px">Siku hii imefungwa kwa tathmini. Unaweza kuendelea kurekodi shughuli mpya.</p>`:`<button class="btn primary spacer-top" data-action="daily-review">Fanya tathmini ya siku</button>`}</div>
      <div class="card">${cardTitle("Tathmini ya wiki","Jumla ya ripoti zilizohifadhiwa")}${weeks.length?weeks.slice(-4).reverse().map(r=>`<div class="task-row"><div class="task-main"><strong>Wiki inayoishia ${fmtDate(r.date)}</strong><small>${esc(r.summary||"Tathmini imehifadhiwa")}</small></div><button class="icon-action" data-view-review="${r.id}">Angalia</button></div>`).join(""):empty("✧","Hakuna tathmini ya wiki","Tathmini ya wiki itajengwa kutokana na kazi, sessions na rekodi ulizohifadhi.",'<button class="btn small" data-action="weekly-review">Tathmini ya wiki</button>')}</div></div>
      <div class="card spacer-top">${cardTitle("Historia ya tathmini","Kumbukumbu zako za kujifunza")}${data.reviews.length?data.reviews.slice().reverse().slice(0,10).map(r=>`<div class="task-row"><div class="task-main"><strong>${r.type==="weekly"?"Tathmini ya wiki":"Tathmini ya siku"} · ${fmtDate(r.date)}</strong><small>${esc(r.summary||r.answers?.["Kesho kazi yangu kuu ni ipi?"]||"")}</small></div></div>`).join(""):empty("▤","Historia bado iko wazi","Tathmini utakazohifadhi zitaonekana hapa.")}</div>`;
  }
  function renderSettings(){
    const s=data.settings;
    return `${pageHead("PREFERENCES","Settings","Badilisha mfumo uendane na maisha yako. Mabadiliko yanahifadhiwa bila kuandika code.",'<button class="btn primary" data-action="save-settings">Hifadhi settings</button>')}
      <form id="settingsForm"><div class="grid dashboard-grid"><div class="card"><div class="setting-section"><h3>Ratiba binafsi</h3><div class="form-grid">${field("Jina / salamu","userName",s.userName)}${field("Saa ya kuamka","wakeTime",s.wakeTime,"time")}${field("Saa ya kulala","sleepTime",s.sleepTime,"time")}${field("Kuandaa chakula","dinnerPrep",s.dinnerPrep,"time")}${field("Muda wa chakula","dinnerTime",s.dinnerTime,"time")}</div><div class="sleep-card"><span style="font-size:22px">☾</span><div><strong id="sleepSummary">${sleepSummary(s.wakeTime,s.sleepTime)}</strong><p>Lenga usingizi wa kutosha. Saa hizi ni mipangilio unayoweza kubadilisha kulingana na majukumu na afya yako.</p></div></div></div>
      <div class="setting-section spacer-top"><h3>Mpango wa siku 30</h3><div class="form-grid">${field("Tarehe ya kuanza","planStart",s.planStart,"date")}${field("Tarehe ya mwisho","planEnd",s.planEnd,"date")}${field("Lengo la kazi kwa wiki","weeklyGoal",s.weeklyGoal,"number",'min="1" max="200"')}${field("Lengo la kazi kwa mwezi","monthlyGoal",s.monthlyGoal,"number",'min="1" max="500"')}</div><p class="muted" style="font-size:11px;line-height:1.6">Awamu ya mtihani: 15–26/10/2026. Awamu ya maendeleo: 27/10–13/11/2026. Ongeza tarehe na masomo halisi katika sehemu ya Masomo na Ratiba.</p></div></div>
      <div><div class="card"><div class="setting-section"><h3>Focus timer</h3><div class="form-grid">${field("Muda wa focus (dakika)","focusMinutes",s.focusMinutes,"number",'min="1" max="360"')}${field("Mapumziko mafupi","shortBreak",s.shortBreak,"number",'min="1" max="60"')}${field("Mapumziko marefu","longBreak",s.longBreak,"number",'min="1" max="90"')}</div></div><div class="setting-section"><h3>Muonekano</h3>${selectField("Theme","theme",[["light","Light mode"],["dark","Dark mode"]],s.theme)}<div class="field spacer-top"><label><input type="checkbox" id="notifications" ${s.notifications?"checked":""}> Ruhusu browser notifications</label><small class="muted">Ruhusa itaombwa na browser. Reminders haziwezi kuhakikishwa app ikiwa imefungwa.</small></div></div><button class="btn primary" type="submit">Hifadhi settings</button></div>
      <div class="card spacer-top"><div class="setting-section"><h3>Backup na data</h3><p class="muted" style="font-size:11px;line-height:1.7">${cloud.user&&cloud.ready?"Data huhifadhiwa kwenye cloud na vifaa vyako husawazishwa ukiwa online. Export JSON bado ni nakala ya ziada.":"Data huhifadhiwa kwenye browser hii pekee ukiwa local. Export JSON ndiyo njia ya kuhamisha kwenda kifaa kingine."} Fanya export mara kwa mara.</p><div class="grid" style="gap:8px"><button class="btn" type="button" data-action="export-json">↓ Export JSON backup</button><button class="btn" type="button" data-action="export-csv">↓ Export tasks CSV</button><button class="btn" type="button" data-action="import-json">↑ Import backup</button><button class="btn" type="button" data-action="export-report">↓ Export report CSV</button><button class="btn danger" type="button" data-action="reset-data">Reset data…</button></div></div></div></div></div></form>`;
  }
  function sleepSummary(wake,sleep){
    if(!wake||!sleep)return "Weka muda wa kulala na kuamka.";
    const [wh,wm]=wake.split(":").map(Number),[sh,sm]=sleep.split(":").map(Number);
    let mins=(wh*60+wm)-(sh*60+sm);if(mins<=0)mins+=1440;
    return `Muda wa usingizi uliopangwa: ${Math.floor(mins/60)} saa ${mins%60} dakika`;
  }
  function render(){
    const names={dashboard:"Dashboard",schedule:"Ratiba",tasks:"Tasks",focus:"Focus Mode",projects:"Miradi",study:"Masomo",business:"Biashara",reviews:"Tathmini",settings:"Settings"};
    $("#viewName").textContent=names[currentView]||"Dashboard";
    $$(".nav-item[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===currentView));
    $("#topDate").textContent=fmtDate(dateKey());
    $("#sidebarStreak").textContent=`${completedStreak()} day streak`;
    document.body.classList.toggle("dark",data.settings.theme==="dark");
    const renderers={dashboard:renderDashboard,tasks:renderTasks,schedule:renderSchedule,focus:renderFocus,projects:renderProjects,study:renderStudy,business:renderBusiness,reviews:renderReviews,settings:renderSettings};
    $("#appContent").innerHTML=(renderers[currentView]||renderDashboard)();
    bindView();
  }
  function bindView(){
    $$("[data-view]").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.view)));
    $$("[data-action]").forEach(b=>b.addEventListener("click",()=>handleAction(b.dataset.action,b.dataset.id)));
    $$("[data-complete]").forEach(c=>c.addEventListener("change",()=>setTaskStatus(c.dataset.complete,c.checked?"completed":"inProgress")));
    $$("[data-edit-task]").forEach(b=>b.addEventListener("click",()=>taskForm(b.dataset.editTask)));
    $$("[data-delete-task]").forEach(b=>b.addEventListener("click",()=>deleteTask(b.dataset.deleteTask)));
    $$("[data-status-id]").forEach(s=>s.addEventListener("change",()=>setTaskStatus(s.dataset.statusId,s.value)));
    $$("[data-edit-schedule]").forEach(b=>b.addEventListener("click",()=>scheduleForm(b.dataset.editSchedule)));
    $$("[data-delete-schedule]").forEach(b=>b.addEventListener("click",()=>deleteSchedule(b.dataset.deleteSchedule)));
    $$("[data-schedule-status]").forEach(s=>s.addEventListener("change",()=>{const x=data.schedule.find(x=>x.id===s.dataset.scheduleStatus);if(x){x.status=s.value;save();render();}}));
    $$("[data-calendar-shift]").forEach(b=>b.addEventListener("click",()=>{calendarDate.setMonth(calendarDate.getMonth()+Number(b.dataset.calendarShift));render();}));
    $$("[data-calendar-day]").forEach(b=>b.addEventListener("click",()=>{const input=$("#scheduleDate");if(input)input.value=b.dataset.calendarDay;const list=$("#scheduleDayList");if(list)list.innerHTML=scheduleList(b.dataset.calendarDay);const warn=$("#scheduleWarnings");if(warn)warn.innerHTML=scheduleWarnings(b.dataset.calendarDay);bindDynamicSchedule();}));
    $$("[data-edit-project]").forEach(b=>b.addEventListener("click",()=>projectForm(b.dataset.editProject)));
    $$("[data-toggle-project]").forEach(b=>b.addEventListener("click",()=>toggleProject(b.dataset.toggleProject)));
    $$("[data-delete-project]").forEach(b=>b.addEventListener("click",()=>deleteProject(b.dataset.deleteProject)));
    $$("[data-study-session]").forEach(b=>b.addEventListener("click",()=>studySessionForm(b.dataset.studySession)));
    $$("[data-edit-subject]").forEach(b=>b.addEventListener("click",()=>subjectForm(b.dataset.editSubject)));
    $$("[data-flashcards]").forEach(b=>b.addEventListener("click",()=>flashcards(b.dataset.flashcards)));
    $$("[data-delete-sale]").forEach(b=>b.addEventListener("click",()=>deleteSale(b.dataset.deleteSale)));
    $$("[data-view-review]").forEach(b=>b.addEventListener("click",()=>showReview(b.dataset.viewReview)));
    const dateInput=$("#scheduleDate");if(dateInput)dateInput.addEventListener("change",()=>{const l=$("#scheduleDayList");l.innerHTML=scheduleList(dateInput.value);$("#scheduleWarnings").innerHTML=scheduleWarnings(dateInput.value);bindDynamicSchedule();});
    const search=$("#taskSearch");if(search)search.addEventListener("input",filterTasks);
    ["taskStatus","taskPriority","taskCategory"].forEach(id=>{const el=$("#"+id);if(el)el.addEventListener("change",filterTasks);});
    const form=$("#settingsForm");if(form)form.addEventListener("submit",e=>{e.preventDefault();saveSettings();});
    const theme=$("#theme");if(theme)theme.addEventListener("change",()=>{document.body.classList.toggle("dark",theme.value==="dark");});
    const wake=$("#wakeTime"),sleep=$("#sleepTime");[wake,sleep].forEach(el=>el&&el.addEventListener("change",()=>$("#sleepSummary").textContent=sleepSummary(wake.value,sleep.value)));
    const ft=$("#focusTask");if(ft)ft.addEventListener("change",()=>{focus.taskId=ft.value;});
    const duration=$("#focusDuration");if(duration)duration.addEventListener("change",()=>{const custom=$("#customDurationField");if(custom)custom.hidden=duration.value!=="custom";if(duration.value!=="custom")setFocusMinutes(Number(duration.value));});
    const customDuration=$("#customDuration");if(customDuration)customDuration.addEventListener("change",()=>{const n=Number(customDuration.value);if(Number.isInteger(n)&&n>=1&&n<=360)setFocusMinutes(n);else{customDuration.value=data.settings.focusMinutes;toast("Weka dakika 1 hadi 360 (saa 6).");}});
  }
  function bindDynamicSchedule(){
    $$("[data-edit-schedule]").forEach(b=>b.addEventListener("click",()=>scheduleForm(b.dataset.editSchedule)));
    $$("[data-delete-schedule]").forEach(b=>b.addEventListener("click",()=>deleteSchedule(b.dataset.deleteSchedule)));
    $$("[data-schedule-status]").forEach(s=>s.addEventListener("change",()=>{const x=data.schedule.find(x=>x.id===s.dataset.scheduleStatus);if(x){x.status=s.value;save();render();}}));
  }
  function navigate(view){currentView=view;$("#sidebar").classList.remove("open");render();}
  function handleAction(action,id){
    switch(action){
      case "add-task":taskForm();break;
      case "add-schedule":scheduleForm();break;
      case "add-project":projectForm();break;
      case "add-subject":subjectForm();break;
      case "add-sale":saleForm();break;
      case "start-day":startDay();break;
      case "close-day":dailyReviewForm();break;
      case "daily-review":dailyReviewForm();break;
      case "weekly-review":weeklyReviewForm();break;
      case "save-settings":saveSettings();break;
      case "export-json":exportJSON();break;
      case "export-csv":exportTasksCSV();break;
      case "export-report":exportReportCSV();break;
      case "import-json":$("#importFile").click();break;
      case "reset-data":resetData();break;
      case "focus-toggle":toggleFocus();break;
      case "focus-reset":resetFocus();render();break;
      case "alarm-stop":stopFocusAlarm();break;
      case "focus-finish":finishFocus();break;
      case "start-next":{const s=data.schedule.find(s=>s.id===id);if(s){s.status="inProgress";save();navigate("focus");toast("Shughuli imewekwa In Progress.");}break;}
    }
  }
  function taskForm(id){
    const t=id?data.tasks.find(x=>x.id===id):null;
    const body=`<form id="taskForm" class="form-grid">
      ${field("Jina la kazi *","title",t?.title||"","text","required maxlength=\"140\"")}
      ${selectField("Priority","priority",[["Critical","Critical"],["High","High"],["Medium","Medium"],["Low","Low"]],t?.priority||"Medium")}
      ${field("Tarehe ya kazi","date",t?.date||dateKey(),"date")}
      ${field("Deadline (hiari)","deadline",t?.deadline||"","date")}
      ${field("Muda unaokadiriwa (dakika)","estimate",t?.estimate||25,"number",'min="1" max="1440" required')}
      ${selectField("Category","category",[["Masomo","Masomo"],["Web development","Web development"],["Graphic design","Graphic design"],["Content","Content"],["Biashara ya bando","Biashara ya bando"],["Wateja","Wateja"],["Afya","Afya"],["Binafsi","Binafsi"]],t?.category||"Binafsi")}
      <div class="field full"><label for="outcome">Matokeo yanayotarajiwa</label><textarea id="outcome" name="outcome">${esc(t?.outcome||"")}</textarea></div>
      <div class="field full"><label for="notes">Maelezo / sababu ya kutopanga upya (hiari)</label><textarea id="notes" name="notes">${esc(t?.notes||"")}</textarea></div>
      <div class="field"><label><input type="checkbox" name="mit" ${t?.mit?"checked":""}> Kazi kuu ya siku (MIT)</label><small class="muted">MIT zisizozidi tatu kwa siku.</small></div>
      ${t?selectField("Status","status",[["notStarted","Not Started"],["inProgress","In Progress"],["completed","Completed"],["skipped","Skipped"],["rescheduled","Rescheduled"]],t.status):""}
      <div class="field full"><label for="subtasks">Subtasks (mstari mmoja kwa kila hatua)</label><textarea id="subtasks" name="subtasks" placeholder="Mfano: Andaa outline&#10;Jenga sehemu ya kwanza">${esc((t?.subtasks||[]).map(s=>s.title).join("\n"))}</textarea></div>
    </form>`;
    openModal(t?"Hariri task":"Ongeza task",body,`<button class="btn" data-close-modal>Ghairi</button><button class="btn primary" id="saveTask">Hifadhi task</button>`);
    $("#saveTask").addEventListener("click",()=>{
      const f=$("#taskForm");if(!f.reportValidity())return;
      const fd=new FormData(f), title=String(fd.get("title")||"").trim();if(!title)return;
      const sameMit=data.tasks.filter(x=>x.date===(fd.get("date")||dateKey())&&x.mit&&x.id!==id&&x.status!=="completed");
      if(fd.get("mit")&&sameMit.length>=3){toast("Tayari una MIT tatu zisizokamilika kwa tarehe hii.");return;}
      const oldStatus=t?.status;
      const obj={...(t||{}),id:t?.id||uid(),title,priority:fd.get("priority"),date:fd.get("date")||dateKey(),deadline:fd.get("deadline")||"",estimate:Number(fd.get("estimate"))||25,category:fd.get("category"),outcome:fd.get("outcome")||"",notes:fd.get("notes")||"",mit:fd.get("mit")==="on",status:fd.get("status")||t?.status||"notStarted",subtasks:String(fd.get("subtasks")||"").split("\n").map(x=>x.trim()).filter(Boolean).map((title,i)=>({id:t?.subtasks?.[i]?.id||uid(),title,done:t?.subtasks?.[i]?.title===title?t.subtasks[i].done:false}))};
      if(!t)data.tasks.push(obj);else Object.assign(t,obj);
      if(obj.status==="completed"&&oldStatus!=="completed"&&!obj.xpAwarded)obj.xpAwarded=addXP(obj);
      save();$("#modal").close();render();toast(t?"Task imehaririwa.":"Task imehifadhiwa.");
    });
  }
  function deleteTask(id){
    const t=data.tasks.find(x=>x.id===id);if(!t)return;
    openModal("Thibitisha kufuta",`<p>Una uhakika unataka kufuta <strong>${esc(t.title)}</strong>? Kitendo hiki hakiwezi kutenduliwa bila backup.</p>`,`<button class="btn" data-close-modal>Ghairi</button><button class="btn danger" id="confirmDelete">Futa task</button>`);
    $("#confirmDelete").addEventListener("click",()=>{data.tasks=data.tasks.filter(x=>x.id!==id);save();$("#modal").close();render();toast("Task imefutwa.");});
  }
  function scheduleForm(id){
    const s=id?data.schedule.find(x=>x.id===id):null;
    const body=`<form id="scheduleForm" class="form-grid">
      ${field("Jina la shughuli *","title",s?.title||"","text","required maxlength=\"140\"")}
      ${field("Tarehe","date",s?.date||$("#scheduleDate")?.value||dateKey(),"date","required")}
      ${field("Muda wa kuanza","start",s?.start||"09:00","time","required")}
      ${field("Muda wa kumaliza","end",s?.end||"10:00","time","required")}
      ${selectField("Kategoria","category",[["Masomo","Masomo"],["Biashara ya bando","Biashara ya bando"],["Web development","Web development"],["Graphic design","Graphic design"],["Content","Content"],["Afya","Afya"],["Chakula","Chakula"],["Mapumziko","Mapumziko"],["Binafsi","Binafsi"]],s?.category||"Binafsi")}
      ${selectField("Kipaumbele","priority",[["Critical","Critical"],["High","High"],["Medium","Medium"],["Low","Low"]],s?.priority||"Medium")}
      <div class="field full"><label for="note">Lengo / matokeo</label><textarea name="note" id="note">${esc(s?.note||"")}</textarea></div>
      ${selectField("Status","status",[["notStarted","Not Started"],["inProgress","In Progress"],["completed","Completed"],["skipped","Skipped"],["rescheduled","Rescheduled"]],s?.status||"notStarted")}
    </form>`;
    openModal(s?"Hariri shughuli":"Ongeza shughuli",body,`<button class="btn" data-close-modal>Ghairi</button><button class="btn primary" id="saveSchedule">Hifadhi shughuli</button>`);
    $("#saveSchedule").addEventListener("click",()=>{
      const f=$("#scheduleForm");if(!f.reportValidity())return;
      const fd=new FormData(f);
      if(fd.get("end")<=fd.get("start")){toast("Muda wa kumaliza lazima uwe baada ya muda wa kuanza.");return;}
      const obj={...(s||{}),id:s?.id||uid(),title:String(fd.get("title")).trim(),date:fd.get("date"),start:fd.get("start"),end:fd.get("end"),category:fd.get("category"),priority:fd.get("priority"),note:fd.get("note")||"",status:fd.get("status")||"notStarted"};
      const clash=data.schedule.find(x=>x.id!==id&&x.date===obj.date&&obj.start<x.end&&obj.end>x.start);
      if(clash){openModal("Mgongano wa ratiba",`<div class="notice"><strong>Vipindi hivi vinagongana</strong>${esc(obj.title)} (${obj.start}–${obj.end}) inagongana na ${esc(clash.title)} (${clash.start}–${clash.end}).</div><p>Unaweza kurudi kubadilisha muda. Hakuna shughuli itakayohamishwa moja kwa moja.</p>`,`<button class="btn" data-close-modal>Rudi urekebishe</button><button class="btn primary" id="saveConflict">Hifadhi hata hivyo</button>`);$("#saveConflict").addEventListener("click",()=>{upsertSchedule(obj,s);});return;}
      upsertSchedule(obj,s);
    });
  }
  function upsertSchedule(obj,old){if(old)Object.assign(old,obj);else data.schedule.push(obj);save();$("#modal").close();render();toast("Ratiba imehifadhiwa.");}
  function deleteSchedule(id){
    const s=data.schedule.find(x=>x.id===id);if(!s)return;
    openModal("Futa shughuli",`Una uhakika unataka kufuta <strong>${esc(s.title)}</strong>?`,`<button class="btn" data-close-modal>Ghairi</button><button class="btn danger" id="confirmDelete">Futa</button>`);
    $("#confirmDelete").addEventListener("click",()=>{data.schedule=data.schedule.filter(x=>x.id!==id);save();$("#modal").close();render();});
  }
  function projectForm(id){
    const p=id?data.projects.find(x=>x.id===id):null;
    const body=`<form id="projectForm" class="form-grid">${field("Jina la mradi *","name",p?.name||"","text","required")}${selectField("Category","category",[["Web development","Web development"],["Graphic design","Graphic design"],["Content creation","Content creation"],["Kutafuta wateja","Kutafuta wateja"],["Utafiti","Utafiti"],["Nyingine","Nyingine"]],p?.category||"Web development")}${field("Deadline","deadline",p?.deadline||"","date")}${field("Progress (%)","progress",p?.progress||0,"number",'min="0" max="100"') }<div class="field full"><label for="goal">Lengo / kwa nini ni muhimu</label><textarea id="goal" name="goal">${esc(p?.goal||"")}</textarea></div><div class="field full"><label for="nextStep">Kazi inayofuata</label><input id="nextStep" name="nextStep" value="${esc(p?.nextStep||"")}"></div><div class="field full"><label for="steps">Hatua zilizobaki (mstari mmoja kwa kila hatua)</label><textarea id="steps" name="steps">${esc((p?.steps||[]).map(s=>s.title).join("\n"))}</textarea></div>${selectField("Hali","status",[["active","Mradi mkuu / active"],["backlog","Backlog"]],p?.status||"backlog")}</form>`;
    openModal(p?"Hariri mradi":"Ongeza mradi",body,`<button class="btn" data-close-modal>Ghairi</button><button class="btn primary" id="saveProject">Hifadhi</button>`);
    $("#saveProject").addEventListener("click",()=>{const f=$("#projectForm");if(!f.reportValidity())return;const fd=new FormData(f);let status=fd.get("status");if(status==="active"&&data.projects.some(x=>x.status==="active"&&x.id!==id)){toast("Tayari kuna mradi active. Weka ule kwenye backlog kwanza.");return;}const obj={...(p||{}),id:p?.id||uid(),name:String(fd.get("name")).trim(),category:fd.get("category"),deadline:fd.get("deadline")||"",progress:Math.max(0,Math.min(100,Number(fd.get("progress"))||0)),goal:fd.get("goal")||"",nextStep:fd.get("nextStep")||"",steps:String(fd.get("steps")||"").split("\n").map(x=>x.trim()).filter(Boolean).map((title,i)=>({id:p?.steps?.[i]?.id||uid(),title,done:p?.steps?.[i]?.done||false})),status};if(p)Object.assign(p,obj);else data.projects.push(obj);if(status==="active")data.activeProject=obj.id;save();$("#modal").close();render();toast("Mradi umehifadhiwa.");});
  }
  function toggleProject(id){const p=data.projects.find(x=>x.id===id);if(!p)return;if(p.status!=="active"&&data.projects.some(x=>x.status==="active"&&x.id!==id)){toast("Weka mradi uliopo kwenye backlog kwanza ili kuanza mwingine.");return;}p.status=p.status==="active"?"backlog":"active";data.activeProject=p.status==="active"?p.id:null;save();render();}
  function deleteProject(id){const p=data.projects.find(x=>x.id===id);if(!p)return;openModal("Futa mradi",`Futa mradi <strong>${esc(p.name)}</strong>?`,`<button class="btn" data-close-modal>Ghairi</button><button class="btn danger" id="confirmDelete">Futa mradi</button>`);$("#confirmDelete").addEventListener("click",()=>{data.projects=data.projects.filter(x=>x.id!==id);if(data.activeProject===id)data.activeProject=null;save();$("#modal").close();render();});}
  function subjectForm(id){
    const s=id?data.subjects.find(x=>x.id===id):null;
    const body=`<form id="subjectForm" class="form-grid">${field("Jina la somo *","name",s?.name||"","text","required")}${selectField("Ugumu","difficulty",[["Rahisi","Rahisi"],["Wastani","Wastani"],["Ngumu","Ngumu"],["Haijawekwa","Haijawekwa"]],s?.difficulty||"Haijawekwa")}${field("Uelewa binafsi (%)","understanding",s?.understanding||0,"number",'min="0" max="100"')}<div class="field full"><label for="notes">Topics / notes / viungo</label><textarea name="notes" id="notes">${esc(s?.notes||"")}</textarea></div></form>`;
    openModal(s?"Hariri somo":"Ongeza somo",body,`<button class="btn" data-close-modal>Ghairi</button><button class="btn primary" id="saveSubject">Hifadhi</button>`);
    $("#saveSubject").addEventListener("click",()=>{const f=$("#subjectForm");if(!f.reportValidity())return;const fd=new FormData(f),obj={...(s||{}),id:s?.id||uid(),name:String(fd.get("name")).trim(),difficulty:fd.get("difficulty"),understanding:Math.max(0,Math.min(100,Number(fd.get("understanding"))||0)),notes:fd.get("notes")||"",cards:s?.cards||[]};if(s)Object.assign(s,obj);else data.subjects.push(obj);save();$("#modal").close();render();toast("Somo limehifadhiwa.");});
  }
  function studySessionForm(id){
    const s=data.subjects.find(x=>x.id===id);if(!s)return;
    const body=`<form id="studyForm" class="form-grid">${field("Tarehe","date",dateKey(),"date")}${field("Muda wa kusoma (dakika)","minutes",25,"number",'min="1" max="600" required')}${field("Uelewa baada ya kujipima (%)","understanding",s.understanding||0,"number",'min="0" max="100" required')}<div class="field full"><label for="learned">1. Nimejifunza nini?</label><textarea id="learned" name="learned"></textarea></div><div class="field full"><label for="confusing">2. Ni nini bado sijaelewa?</label><textarea id="confusing" name="confusing"></textarea></div><div class="field full"><label for="recall">3. Ninaweza kujibu bila notes? Eleza matokeo.</label><textarea id="recall" name="recall"></textarea></div><div class="field full"><label for="reviewDate">4. Nitarudia mada hii lini?</label><input type="date" id="reviewDate" name="reviewDate"></div></form>`;
    openModal(`Study session · ${esc(s.name)}`,body,`<button class="btn" data-close-modal>Ghairi</button><button class="btn primary" id="saveStudy">Hifadhi session</button>`);
    $("#saveStudy").addEventListener("click",()=>{const f=$("#studyForm");if(!f.reportValidity())return;const fd=new FormData(f);const session={id:uid(),mode:"study",subjectId:s.id,subjectName:s.name,date:fd.get("date")||dateKey(),minutes:Number(fd.get("minutes")),understanding:Number(fd.get("understanding")),learned:fd.get("learned")||"",confusing:fd.get("confusing")||"",recall:fd.get("recall")||"",reviewDate:fd.get("reviewDate")||""};data.sessions.push(session);s.understanding=session.understanding;if(session.reviewDate)s.reviewDate=session.reviewDate;save();$("#modal").close();render();toast("Study session imehifadhiwa. Uelewa umeandikwa kutokana na kujipima kwako.");});
  }
  function flashcards(id){
    const s=data.subjects.find(x=>x.id===id);if(!s)return;
    const body=`<div id="cardsList">${(s.cards||[]).map((c,i)=>`<div class="task-row"><div class="task-main"><strong>${esc(c.front)}</strong><small>${esc(c.back)}</small></div><button class="icon-action" data-remove-card="${i}">Futa</button></div>`).join("")||empty("✧","Hakuna flashcards","Ongeza swali na jibu ili kufanya active recall.")}</div><form id="cardForm" class="form-grid spacer-top"><div class="field full"><label for="front">Swali / front</label><textarea id="front" name="front" required></textarea></div><div class="field full"><label for="back">Jibu / back</label><textarea id="back" name="back" required></textarea></div></form>`;
    openModal(`Flashcards · ${esc(s.name)}`,body,`<button class="btn" data-close-modal>Funga</button><button class="btn primary" id="saveCard">＋ Hifadhi kadi</button>`);
    $$("[data-remove-card]").forEach(b=>b.addEventListener("click",()=>{s.cards.splice(Number(b.dataset.removeCard),1);save();$("#modal").close();flashcards(id);}));
    $("#saveCard").addEventListener("click",()=>{const f=$("#cardForm");if(!f.reportValidity())return;const fd=new FormData(f);s.cards.push({front:String(fd.get("front")).trim(),back:String(fd.get("back")).trim()});save();$("#modal").close();flashcards(id);});
  }
  function saleForm(){
    const body=`<form id="saleForm" class="form-grid">${field("Tarehe","date",dateKey(),"date")}${field("Aina / maelezo ya oda *","title","","text","required")}${field("Mapato (TZS)","revenue",0,"number",'min="0" step="1" required')}${field("Gharama (TZS)","cost",0,"number",'min="0" step="1" required')}<div class="field full"><label for="note">Maelezo ya ziada (usiweke PIN/nywila/taarifa nyeti)</label><textarea id="note" name="note"></textarea></div></form>`;
    openModal("Rekodi oda / mauzo",body,`<button class="btn" data-close-modal>Ghairi</button><button class="btn primary" id="saveSale">Hifadhi rekodi</button>`);
    $("#saveSale").addEventListener("click",()=>{const f=$("#saleForm");if(!f.reportValidity())return;const fd=new FormData(f);data.business.push({id:uid(),date:fd.get("date")||dateKey(),title:String(fd.get("title")).trim(),revenue:Number(fd.get("revenue"))||0,cost:Number(fd.get("cost"))||0,note:fd.get("note")||""});save();$("#modal").close();render();toast("Rekodi ya biashara imehifadhiwa.");});
  }
  function deleteSale(id){openModal("Futa rekodi",`Futa rekodi hii ya biashara?`,`<button class="btn" data-close-modal>Ghairi</button><button class="btn danger" id="confirmDelete">Futa</button>`);$("#confirmDelete").addEventListener("click",()=>{data.business=data.business.filter(x=>x.id!==id);save();$("#modal").close();render();});}
  function startDay(){
    const key=dateKey();data.dayLogs[key]=data.dayLogs[key]||{started:true,startedAt:new Date().toISOString()};
    data.dayLogs[key].started=true;data.dayLogs[key].startedAt=data.dayLogs[key].startedAt||new Date().toISOString();save();toast("Siku imeanza. Chagua MIT tatu na anza na kazi moja.");render();
  }
  function dailyReviewForm(){
    const questions=["Kazi gani muhimu nimekamilisha?","Nimefuata ratiba kwa kiwango gani?","Nini kilinivuruga?","Nimejifunza nini?","Nini hakikukamilika, na kwa nini?","Kesho kazi yangu kuu ni ipi?"];
    const body=`<form id="reviewForm">${questions.map(q=>`<div class="review-question"><label for="q-${questions.indexOf(q)}">${q}</label><textarea id="q-${questions.indexOf(q)}" name="${q}">${esc(data.dayLogs[dateKey()]?.answers?.[q]||"")}</textarea></div>`).join("")}</form>`;
    openModal("Tathmini ya mwisho wa siku",body,`<button class="btn" data-close-modal>Baadaye</button><button class="btn primary" id="saveReview">Hifadhi tathmini</button>`);
    $("#saveReview").addEventListener("click",()=>{const fd=new FormData($("#reviewForm")),answers={};questions.forEach(q=>answers[q]=String(fd.get(q)||"").trim());const completed=todaysTasks().filter(isDone).length;data.dayLogs[dateKey()]={...(data.dayLogs[dateKey()]||{}),closed:true,completed,pct:dailyPct(),answers,closedAt:new Date().toISOString()};data.reviews.push({id:uid(),type:"daily",date:dateKey(),answers,summary:answers[questions[0]]||"Tathmini ya siku imehifadhiwa."});save();$("#modal").close();render();toast("Tathmini imehifadhiwa. Kesho ni nafasi mpya.");});
  }
  function weeklyReviewForm(){
    const start=new Date();start.setDate(start.getDate()-6);const startKey=dateKey(start),endKey=dateKey();
    const ts=data.tasks.filter(t=>t.date>=startKey&&t.date<=endKey),done=ts.filter(isDone).length;
    const sessions=data.sessions.filter(s=>s.date>=startKey&&s.date<=endKey);
    const focusMin=sessions.filter(s=>s.mode==="focus").reduce((a,s)=>a+s.minutes,0),studyMin=sessions.filter(s=>s.mode==="study").reduce((a,s)=>a+s.minutes,0);
    const body=`<div class="mini-grid"><div class="mini-stat"><small>Kazi zilizokamilika</small><strong>${done}/${ts.length}</strong></div><div class="mini-stat"><small>Focus</small><strong>${formatDuration(focusMin)}</strong></div><div class="mini-stat"><small>Masomo</small><strong>${formatDuration(studyMin)}</strong></div><div class="mini-stat"><small>Biashara records</small><strong>${data.business.filter(b=>b.date>=startKey&&b.date<=endKey).length}</strong></div></div><form id="weeklyForm" class="spacer-top"><div class="review-question"><label>Ni nini kilifanya kazi vizuri?</label><textarea name="good"></textarea></div><div class="review-question"><label>Kizuizi kikuu kilikuwa nini?</label><textarea name="blocker"></textarea></div><div class="review-question"><label>Mabadiliko 1–3 ya wiki ijayo</label><textarea name="next"></textarea></div></form>`;
    openModal("Tathmini ya wiki",body,`<button class="btn" data-close-modal>Funga</button><button class="btn primary" id="saveWeekly">Hifadhi ripoti</button>`);
    $("#saveWeekly").addEventListener("click",()=>{const fd=new FormData($("#weeklyForm")),summary=`${done}/${ts.length} tasks; focus ${formatDuration(focusMin)}; study ${formatDuration(studyMin)}.`;data.reviews.push({id:uid(),type:"weekly",date:endKey,start:startKey,summary,metrics:{planned:ts.length,completed:done,focusMin,studyMin},answers:{good:fd.get("good"),blocker:fd.get("blocker"),next:fd.get("next")}});save();$("#modal").close();render();toast("Ripoti ya wiki imehifadhiwa kutokana na data ya mfumo.");});
  }
  function showReview(id){const r=data.reviews.find(x=>x.id===id);if(!r)return;openModal("Ripoti ya tathmini",`<p class="muted">${fmtDate(r.date)} · ${r.type==="weekly"?"Wiki":"Siku"}</p><p>${esc(r.summary||"")}</p><pre style="white-space:pre-wrap;font:12px DM Sans;line-height:1.7">${esc(JSON.stringify(r.answers||{},null,2))}</pre>`);}
  function saveSettings(){
    const f=$("#settingsForm");if(!f)return;
    const fd=new FormData(f),s=data.settings;
    ["userName","wakeTime","sleepTime","dinnerPrep","dinnerTime","planStart","planEnd","theme"].forEach(k=>{const el=f.elements[k];if(el)s[k]=String(fd.get(k)||s[k]);});
    ["focusMinutes","shortBreak","longBreak","weeklyGoal","monthlyGoal"].forEach(k=>{const n=Number(fd.get(k));if(Number.isFinite(n)&&n>0)s[k]=k==="focusMinutes"?Math.min(360,n):n;});
    s.notifications=$("#notifications")?.checked||false;
    if(s.planEnd<s.planStart){toast("Tarehe ya mwisho haiwezi kuwa kabla ya tarehe ya kuanza.");return;}
    if(s.notifications&&"Notification"in window){Notification.requestPermission().then(p=>{if(p!=="granted"){s.notifications=false;save();toast("Notifications hazijaruhusiwa. Tumia reminders ndani ya dashboard.");}});}
    save();if(!focus.running){focus.total=(Number(s.focusMinutes)||25)*60;focus.remaining=focus.total;}render();toast("Settings zimehifadhiwa.");
  }
  function filterTasks(){
    const q=($("#taskSearch")?.value||"").toLowerCase(),status=$("#taskStatus")?.value||"",priority=$("#taskPriority")?.value||"",category=$("#taskCategory")?.value||"";
    const list=data.tasks.filter(t=>(t.title+" "+(t.notes||"")+" "+(t.category||"")).toLowerCase().includes(q)&&(!status||t.status===status)&&(!priority||t.priority===priority)&&(!category||t.category===category));
    $("#taskTable").innerHTML=taskTable(list);bindView();
  }
  function toggleFocus(){
    if(!focus.running){try{const Audio=window.AudioContext||window.webkitAudioContext;if(Audio){alarmAudio=alarmAudio||new Audio();if(alarmAudio.state==="suspended")alarmAudio.resume();}}catch(e){}focus.running=true;focus.paused=false;focus.startedAt=Date.now();lastTick=Date.now();focus.total=focus.mode==="focus"?(Number(data.settings.focusMinutes)||25)*60:focus.mode==="short"?data.settings.shortBreak*60:data.settings.longBreak*60;focus.remaining=focus.total;focus.interval=setInterval(tickFocus,1000);toast("Focus session imeanza.");}
    else if(focus.paused){focus.paused=false;focus.startedAt=Date.now();lastTick=Date.now();focus.interval=setInterval(tickFocus,1000);toast("Umerudi kwenye focus.");}
    else{focus.paused=true;clearInterval(focus.interval);focus.interval=null;toast("Timer imesitishwa. Endelea unapokuwa tayari.");}
    render();
  }
  function tickFocus(){
    if(!focus.running||focus.paused)return;
    const now=Date.now(),delta=Math.max(1,Math.floor((now-lastTick)/1000));lastTick=now;focus.remaining=Math.max(0,focus.remaining-delta);
    const display=$("#timerDisplay");if(display)display.textContent=formatTimer(focus.remaining);
    if(focus.remaining<=0){clearInterval(focus.interval);focus.interval=null;focus.running=false;focus.paused=true;startFocusAlarm();toast("Session imeisha. Rekodi session au pumzika kidogo.");if(data.settings.notifications&&"Notification"in window&&Notification.permission==="granted")new Notification("MY DISCIPLINE OS",{body:"Focus session imeisha."});render();}
  }
  function setFocusMinutes(minutes){const n=Math.min(360,Math.max(1,Math.round(minutes)));data.settings.focusMinutes=n;data.settings.pomodoro=n;save();if(!focus.running&&!focus.paused){focus.total=n*60;focus.remaining=focus.total;const display=$("#timerDisplay");if(display)display.textContent=formatTimer(focus.remaining);const stat=$$(".mini-stat strong")[0];if(stat)stat.textContent=`${n} dk`;}}
  function playFocusAlarm(){try{const ctx=alarmAudio;if(!ctx)return;if(ctx.state==="suspended")ctx.resume();[0,0.55,1.1].forEach((delay,i)=>{const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type="sine";osc.frequency.value=i===1?1046:880;gain.gain.setValueAtTime(0.0001,ctx.currentTime+delay);gain.gain.exponentialRampToValueAtTime(0.35,ctx.currentTime+delay+0.02);gain.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+delay+0.32);osc.connect(gain);gain.connect(ctx.destination);osc.start(ctx.currentTime+delay);osc.stop(ctx.currentTime+delay+0.34);});}catch(e){console.warn("Alarm audio haikuweza kuchezwa",e);}}
  function startFocusAlarm(){if(alarmActive)return;alarmActive=true;playFocusAlarm();alarmInterval=setInterval(playFocusAlarm,1800);}
  function stopFocusAlarm(){if(alarmInterval){clearInterval(alarmInterval);alarmInterval=null;}alarmActive=false;render();toast("Alarm imesimamishwa.");}
  function resetFocus(){clearInterval(focus.interval);focus.interval=null;focus.running=false;focus.paused=false;focus.mode="focus";focus.total=(Number(data.settings.focusMinutes)||25)*60;focus.remaining=focus.total;}
  function finishFocus(){
    if(!focus.running&&!focus.paused){toast("Anza timer kwanza ili kurekodi session.");return;}
    const elapsed=Math.max(0,Math.round((focus.total-focus.remaining)/60));
    if(elapsed<1){toast("Session haijafika dakika moja; endelea kidogo kabla ya kurekodi.");return;}
    const task=data.tasks.find(t=>t.id===focus.taskId);
    data.sessions.push({id:uid(),mode:focus.mode==="focus"?"focus":"break",date:dateKey(),minutes:elapsed,taskId:focus.taskId||"",taskName:task?.title||"",createdAt:new Date().toISOString()});
    resetFocus();save();render();toast(`Session ya ${elapsed} dakika imehifadhiwa.`);
  }
  function exportBlob(content,type,name){
    const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function exportJSON(){const backup={...data,exportedAt:new Date().toISOString(),app:"MY DISCIPLINE OS"};exportBlob(JSON.stringify(backup,null,2),"application/json",`my-discipline-os-backup-${dateKey()}.json`);toast("JSON backup imeandaliwa.");}
  function csvEscape(v){const s=String(v??"");return `"${s.replace(/"/g,'""')}"`;}
  function exportTasksCSV(){const cols=["title","date","deadline","priority","status","estimate","category","outcome","mit"];const rows=[cols,...data.tasks.map(t=>cols.map(k=>t[k]??""))].map(r=>r.map(csvEscape).join(",")).join("\r\n");exportBlob("\ufeff"+rows,"text/csv;charset=utf-8",`my-discipline-os-tasks-${dateKey()}.csv`);toast("Tasks CSV imeandaliwa.");}
  function exportReportCSV(){const rows=[["date","planned_tasks","completed_tasks","completion_percent","focus_minutes","study_minutes","business_orders","revenue_tzs","cost_tzs"]];const dates=[...new Set([...data.tasks.map(t=>t.date),...data.sessions.map(s=>s.date),...data.business.map(b=>b.date)].filter(Boolean))].sort();dates.forEach(d=>{const tasks=data.tasks.filter(t=>t.date===d),ss=data.sessions.filter(s=>s.date===d),bb=data.business.filter(b=>b.date===d);rows.push([d,tasks.length,tasks.filter(isDone).length,tasks.length?Math.round(tasks.filter(isDone).length/tasks.length*100):0,ss.filter(s=>s.mode==="focus").reduce((a,s)=>a+s.minutes,0),ss.filter(s=>s.mode==="study").reduce((a,s)=>a+s.minutes,0),bb.length,bb.reduce((a,b)=>a+(Number(b.revenue)||0),0),bb.reduce((a,b)=>a+(Number(b.cost)||0),0)]);});exportBlob("\ufeff"+rows.map(r=>r.map(csvEscape).join(",")).join("\r\n"),"text/csv;charset=utf-8",`my-discipline-os-report-${dateKey()}.csv`);toast("Report CSV imeandaliwa.");}
  function resetData(){
    openModal("Reset data yote?",`<div class="notice"><strong>⚠ Hatua hii ni kubwa</strong>Itafuta tasks, ratiba, projects, masomo, sessions, reviews, biashara na XP kwenye browser hii. Export backup kwanza ikiwa unahitaji kuhifadhi historia.</div><p>Andika <strong>RESET</strong> hapa chini ili kuthibitisha.</p><div class="field"><label for="resetConfirm">Uthibitisho</label><input id="resetConfirm" autocomplete="off"></div>`,`<button class="btn" data-close-modal>Ghairi</button><button class="btn danger" id="confirmReset">Futa data</button>`);
    $("#confirmReset").addEventListener("click",()=>{if($("#resetConfirm").value!=="RESET"){toast("Andika RESET ili kuthibitisha.");return;}localStorage.removeItem(KEY);data=initialData();save();resetFocus();$("#modal").close();render();toast("Data imerudishwa kwenye hali ya mwanzo.");});
  }
  $("#importFile").addEventListener("change",async e=>{
    const file=e.target.files?.[0];if(!file)return;
    try{
      const parsed=JSON.parse(await file.text());
      if(!parsed||typeof parsed!=="object"||!Number.isInteger(parsed.version)||!Array.isArray(parsed.tasks)||!Array.isArray(parsed.schedule)||!parsed.settings||typeof parsed.settings!=="object")throw new Error("Muundo wa backup si sahihi.");
      const clean=migrate(parsed);
      openModal("Thibitisha import",`<div class="notice"><strong>Backup imekaguliwa</strong>Tasks: ${clean.tasks.length}; ratiba: ${clean.schedule.length}; miradi: ${clean.projects.length}; masomo: ${clean.subjects.length}.</div><p>Import itachukua nafasi ya data iliyopo kwenye browser hii. Export backup ya sasa kwanza ikiwa unahitaji kuihifadhi.</p>`,`<button class="btn" data-close-modal>Ghairi</button><button class="btn primary" id="confirmImport">Import backup</button>`);
      $("#confirmImport").addEventListener("click",()=>{data=clean;save();resetFocus();$("#modal").close();render();toast("Backup imerejeshwa.");});
    }catch(err){toast("Backup haijaingizwa: "+(err.message||"Faili si sahihi."));}
    e.target.value="";
  });
  $("#themeBtn").addEventListener("click",()=>{data.settings.theme=data.settings.theme==="dark"?"light":"dark";save();render();});
  $("#settingsShortcut").addEventListener("click",()=>navigate("settings"));
  $("#cloudSignOut").addEventListener("click",signOutCloud);
  $("#menuBtn").addEventListener("click",()=>$("#sidebar").classList.toggle("open"));
  $("#modal").addEventListener("click",e=>{if(e.target===$("#modal")&&!cloud.conflictOpen&&!cloud.initialChoiceOpen)$("#modal").close();});
  $("#modal").addEventListener("cancel",e=>{if(cloud.conflictOpen||cloud.initialChoiceOpen)e.preventDefault();});
  $("#modal").addEventListener("close",()=>{if(cloud.pendingRemote&&!cloud.conflictOpen&&!cloud.initialChoiceOpen){const remote=cloud.pendingRemote,revision=cloud.pendingRemoteRevision;cloud.pendingRemote=null;cloud.pendingRemoteRevision=0;if(cloud.localDirty)showRealtimeConflict(remote,revision);else applyRemoteWorkspace(remote,revision);}});
  document.addEventListener("keydown",e=>{if(e.key==="Escape")$("#sidebar").classList.remove("open");});
  if("serviceWorker"in navigator && location.protocol!=="file:"){window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(e=>console.warn("Service worker haijasajiliwa",e)));}
  window.addEventListener("online",()=>{if(cloud.localDirty)syncWorkspace();});
  // Browser-only reminder: best effort while this page is open. Not guaranteed after the browser closes.
  setInterval(()=>{
    const now=timeNow();
    const reminder=data.schedule.find(s=>s.date===dateKey()&&s.start===now&&s.status==="notStarted");
    if(reminder){toast(`Muda wa kuanza: ${reminder.title}`);if(data.settings.notifications&&"Notification"in window&&Notification.permission==="granted")new Notification("MY DISCIPLINE OS",{body:`Muda wa kuanza: ${reminder.title}`});}
    $("#topDate").textContent=fmtDate(dateKey());
  },30000);
  bootCloud();
})();

