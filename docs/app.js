"use strict";
const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dataBlank=()=>({profiles:[],questions:[],answers:[],me:null});
let state=dataBlank(), phase="loading", failure="", status="", topic="", query="", view="", generation=0, detailVersion=0;
const modal=$("#modal"), board=$("#board");
const area=()=>location.hash==="#mentors"?"mentors":"questions";
const labelRole=p=>p?.role||"부원";
const person=id=>state.profiles.find(p=>p.id===id);
const nameOf=id=>person(id)?.nickname||"부원";
const day=s=>new Intl.DateTimeFormat("ko-KR",{year:"numeric",month:"short",day:"numeric",timeZone:"Asia/Seoul"}).format(new Date(s));
const norm=s=>String(s||"").normalize("NFKC").toLocaleLowerCase("ko").trim();
const button=(act,label,cls="outline",id="")=>'<button type="button" class="'+cls+'" data-act="'+act+'" data-id="'+esc(id)+'">'+label+'</button>';
const picks=(xs,chosen)=>xs.map(s=>'<option '+(s===chosen?"selected":"")+'>'+esc(s)+'</option>').join("");
const questionTopics=["자소서","면접","대회","포트폴리오","취업·진로","기타"];
function questionTopic(question){
  if(!question.field)return "미분류";
  return questionTopics.includes(question.field)?question.field:"기타";
}
function topicBadge(question){
  return '<span class="question-topic">'+esc(questionTopic(question))+'</span>';
}
function byline(post){
  if(!post.author_name)return nameOf(post.author);
  return [post.author_department,post.author_class+"학번",post.author_name].join(" · ");
}
function authorFields(){
  const mine=[...state.questions,...state.answers]
    .filter(post=>post.author===state.me.id && post.author_name && post.author_class)
    .sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];
  const department=mine?.author_department || state.me.department;
  return '<fieldset class="author-fields"><legend>작성자 정보</legend>'+
    '<label>전공<input type="text" name="author_department" required placeholder="예: 기계공학과" value="'+esc(department)+'"></label>'+
    '<label>학번 (입학연도)<input name="author_class" type="text" inputmode="numeric" pattern="([0-9]{2}|(19|20)[0-9]{2})" maxlength="4" autocomplete="off" required placeholder="예: 22 또는 2022" value="'+esc(mine?.author_class)+'"></label>'+
    '<label>이름<input name="author_name" maxlength="32" autocomplete="name" required value="'+esc(mine?.author_name)+'"></label>'+
    '<small>전공·학번·이름은 게시글을 읽을 수 있는 부원에게 표시돼요.</small></fieldset>';
}
function readMajor(value){
  const major=String(value??"").trim();
  if(!major) throw Error("전공을 입력해 주세요.");
  return major;
}
function authorDetails(formData){
  const department=readMajor(formData.get("author_department"));
  const year=String(formData.get("author_class")||"").trim();
  const name=String(formData.get("author_name")||"").trim();
  if(!/^(?:[0-9]{2}|(?:19|20)[0-9]{2})$/.test(year)||!name||name.length>32)
    throw Error("전공과 학번, 이름을 확인해 주세요.");
  return {author_department:department,author_class:year.slice(-2),author_name:name};
}
const note='<p class="hint">체험용 가상 부원과 예시 글입니다. 직접 등록한 내용은 이 브라우저에만 저장돼요.</p>';
const photoTag=s=>/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(s||"")?'<img class="photo" alt="게시물에 첨부한 사진" src="'+s+'">':"";
const fileInput='<label>사진 첨부 <input type="file" name="photo" accept="image/jpeg,image/png,image/webp"><small>JPG·PNG·WebP 한 장, 최대 12MB</small></label>';
let toastTimer;
function toast(msg){$("#toast").textContent=msg;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("#toast").textContent="",3200);}
function popup(title,body){detailVersion++;$("#modal-title").textContent=title;$("#modal-body").innerHTML=body;if(!modal.open)modal.showModal();modal.scrollTop=0;}
function close(){detailVersion++;modal.close();}
$("#close").onclick=close;modal.addEventListener("click",e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
function promptText(){return Club.demo?"체험 모드":state.me?.approved?state.me.nickname:Club.hasSession()?"내 가입 상태":"부원 로그인";}
async function refresh(){
  const n=++generation;
  try{const result=await Club.load();if(n!==generation)return;state=result;phase="ok";}
  catch(e){if(n!==generation)return;state=dataBlank();phase="error";failure=e.message;}
  paint();
}
function paint(){
  const next=area();if(next!==view){status="";topic="";query="";view=next;}
  document.querySelectorAll("[data-nav]").forEach(a=>{a.classList.toggle("on",a.dataset.nav===view);if(a.dataset.nav===view)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current");});
  $("#account").textContent=promptText();
  const mentors=view==="mentors", enabled=state.me?.approved;
  const head='<div class="board-head"><div class="section-title"><h2>'+(mentors?"선배 찾기":"질문 게시판")+'</h2><span class="count" id="total"></span></div>'+(!mentors&&enabled?button("new",'<span class="ico" aria-hidden="true">＋</span> 질문하기',"solid"):"")+'</div>';
  let main;
  if(phase==="loading")main='<div class="busyline">불러오는 중…</div>';
  else if(phase==="error")main='<div class="empty"><strong>게시판을 불러오지 못했어요.</strong>'+esc(failure)+'<div>'+button("retry","다시 불러오기")+(Club.hasSession()?button("logout","로그아웃"):"")+'</div></div>';
  else if(!enabled)main='<div class="empty"><strong>'+(state.me?"부원 확인을 기다리고 있어요.":"돌밭 부원 전용 공간이에요.")+'</strong><p>'+(state.me?"승인이 끝나면 질문·답변과 선배 명단을 볼 수 있어요.":"졸업생과 재학생 모두 가입 후 참여할 수 있어요.")+'</p>'+button("account",state.me?"가입 상태 보기":"참여하기","solid")+'</div>';
  else {
    const searchBox='<label class="search"><input type="search" id="search" autocomplete="off" aria-label="검색" placeholder="'+(mentors?"닉네임, 전공, 회사, 업종, 소개 검색":"질문 제목, 주제, 본문, 답변 검색")+'" value="'+esc(query)+'"></label>';
    const answerStatusFilter='<div class="mobile-filter-wrap"><select aria-label="답변 상태" class="mobile-filter" id="mfilter">'+picks(["전체 질문","답변 기다리는 중","답변 있음"],status||"전체 질문")+'</select></div>';
    const topicFilter='<select class="topic-filter" id="topicFilter" aria-label="질문 주제">'+
      '<option value="">전체 주제</option>'+picks([...questionTopics,"미분류"],topic)+'</select>';
    main='<div class="toolbar">'+searchBox+(mentors?"":'<div class="question-filters">'+topicFilter+answerStatusFilter+'</div>')+'</div><div id="results"></div>';
  }
  const stats=!mentors&&enabled?'<section class="sidecard statuscard"><h3>답변 상태</h3><div class="sidelist" id="slist"></div></section>':"";
  const aside='<aside>'+stats+'<section class="sidecard moss"><h3>'+(mentors?"선배에게 물어보세요":"어떤 선배에게 물어볼까요?")+'</h3><p>'+(mentors?"프로필에서 질문을 남기면 다른 부원도 답변을 함께 읽을 수 있어요.":"선배들의 소개를 읽고 궁금한 점을 물어보세요.")+'</p>'+(mentors?button("questions","질문 게시판 보기","linkbtn"):button("mentors","선배 목록 보기","linkbtn"))+'</section>'+(Club.demo?'<p class="notice">체험 모드 · 예시 데이터<br>작성한 내용은 이 브라우저에만 저장돼요.</p>':"")+'</aside>';
  board.innerHTML=head+'<div class="layout"><section class="panel">'+main+'</section>'+aside+'</div>';
  if(enabled&&phase==="ok") results();
}
function results(){
  const root=$("#results");if(!root)return;
  const words=norm(query).split(/\s+/).filter(Boolean);
  const match=s=>words.every(w=>norm(s).includes(w));
  if(view==="mentors"){
    const list=state.profiles.filter(p=>p.role==="졸업생"&&p.listed&&match([p.nickname,p.department,p.employment?.company,p.employment?.industry,p.bio].join(" ")));
    $("#total").textContent=list.length+"명";root.innerHTML=list.length?'<div class="mentor-grid">'+list.map(p=>'<button class="mentor" data-act="profile" data-id="'+esc(p.id)+'"><div class="personline"><span class="avatar">'+esc(p.nickname[0])+'</span><div><h3>'+esc(p.nickname)+'</h3><span class="meta">'+esc(p.department||'')+'</span></div></div>'+employmentSummary(p)+'<p>'+esc(p.bio||"질문을 기다리고 있어요.")+'</p></button>').join("")+'</div>':emptyResults();return;
  }
  const grouped=new Map();for(const a of state.answers){if(!grouped.has(a.question_id))grouped.set(a.question_id,[]);grouped.get(a.question_id).push(a);}
  const base=state.questions.filter(q=>
    (!topic||questionTopic(q)===topic)&&match([q.title,questionTopic(q),q.body,...(grouped.get(q.id)||[]).map(a=>a.body)].join(" "))
  );
  const answered=base.filter(q=>grouped.has(q.id)).length;
  const opts=[["전체 질문",base.length],["답변 기다리는 중",base.length-answered],["답변 있음",answered]];
  $("#slist").innerHTML=opts.map(([s,n])=>button("status",esc(s)+"<b>"+n+"</b>","filter"+((status||"전체 질문")===s?" active":""),s)).join("");
  const filtered=base.filter(q=>!status||status==="전체 질문"||(status==="답변 있음")===grouped.has(q.id)).sort((a,b)=>b.created_at.localeCompare(a.created_at));
  $("#total").textContent=filtered.length+"개";root.innerHTML=filtered.length?filtered.map(q=>{
    const n=grouped.get(q.id)?.length||0;
    return '<button class="row" data-act="read" data-id="'+esc(q.id)+'"><div class="labelrow">'+topicBadge(q)+'<span class="status '+(n?"":"wait")+'">'+(n?"답변 있음":"답변 기다리는 중")+'</span></div><h3>'+esc(q.title)+'</h3><div class="meta"><span>'+esc(byline(q))+'</span><span>·</span><time>'+day(q.created_at)+'</time><span class="answer-count">답변 '+n+'</span></div></button>';
  }).join(""):emptyResults();
}
function emptyResults(){return '<div class="empty"><strong>표시할 결과가 없어요.</strong>다른 검색어로 찾아보세요.</div>';}
function formRun(form,task){
  form.onsubmit=async e=>{e.preventDefault();if(form.dataset.busy)return;const submit=form.querySelector("[type=submit]"),error=form.querySelector(".error");form.dataset.busy="1";submit.disabled=true;error.textContent="";
    try{await task(new FormData(form));}catch(err){error.textContent=err.message||"저장하지 못했어요. 다시 시도해 주세요.";}
    finally{submit.disabled=false;delete form.dataset.busy;}};
}
async function toPhoto(file){
  if(!file||!file.size)return null;
  if(file.size>12*1024*1024||!["image/jpeg","image/png","image/webp"].includes(file.type))throw Error("12MB 이하의 JPG, PNG, WebP 사진을 골라 주세요.");
  const img=new Image(),u=URL.createObjectURL(file);try{
    img.src=u;await img.decode();const scale=Math.min(1,1200/Math.max(img.width,img.height)),c=document.createElement("canvas");c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));const ctx=c.getContext("2d");
    if(!ctx)throw Error("사진을 읽을 수 없어요.");ctx.fillStyle="white";ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);
    for(const q of [.82,.65,.45,.3]){const d=c.toDataURL("image/jpeg",q);if(d.length<=650000)return d;}
    throw Error("사진을 더 작은 크기로 선택해 주세요.");
  }finally{URL.revokeObjectURL(u);}
}
const errSlot='<p class="error" role="alert"></p>';
function employmentSummary(profile){
  const job=profile.employment;
  if(!job?.company && !job?.industry)return "";
  const fact=(label,value)=>value?'<div><dt>'+label+'</dt><dd>'+esc(value)+'</dd></div>':"";
  return '<dl class="employment-summary">'+fact("근무 회사",job.company)+fact("업종",job.industry)+'</dl>';
}
function workFields(profile={}, signup=false){
  const job=profile.employment || {};
  const fieldStatus=signup?" (필수)":" (선택)";
  const companyHint=signup?"예: 회사명 또는 미취업":"회사명 입력";
  const industryHint=signup?"예: 자동차 부품 제조 또는 해당 없음":"예: 자동차 부품 제조";
  return '<label>근무 회사'+fieldStatus+'<input type="text" name="company" maxlength="160" placeholder="'+companyHint+'" value="'+esc(job.company)+'"></label>'+
    '<label>업종'+fieldStatus+'<select id="industryChoice" name="industry_choice"><option value="">직접 입력</option></select></label>'+
    '<label id="industryManual">업종 직접 입력<input type="text" name="industry" maxlength="160" placeholder="'+industryHint+'" value="'+esc(job.industry)+'"></label>'+
    '<small>승인된 졸업생이 적은 업종명은 가입할 때 선택지로 제공돼요.</small>';
}
function visibilityField(listed=false){
  return '<label class="tick"><input type="checkbox" name="listed"'+(listed?' checked':'')+'> 선배 찾기에 내 프로필 표시</label>'+
    '<small>표시하면 승인된 부원이 내 회사와 업종을 볼 수 있어요.</small>';
}
async function wireIndustry(onChange=()=>{}){
  const choice=$("#industryChoice"), manual=$("#industryManual");
  choice.onchange=()=>{manual.hidden=Boolean(choice.value);onChange();};
  try{
    const labels=await Club.industries();
    if(!choice.isConnected)return;
    const unique=new Map();
    for(const label of labels){
      const key=norm(label).replace(/\s+/g," ");
      if(key&&!unique.has(key))unique.set(key,label);
    }
    for(const label of [...unique.values()].sort((a,b)=>a.localeCompare(b,"ko")))choice.add(new Option(label,label));
  }catch{ /* Direct entry remains available when suggestions cannot load. */ }
}
function workValues(form){
  return {company:form.get("company").trim(),industry:(form.get("industry_choice")||form.get("industry")).trim(),listed:form.has("listed")};
}
function editWork(){
  if(state.me?.role!=="졸업생")return;
  popup("근무 정보 수정",'<form id="work" class="form">'+workFields(state.me)+visibilityField(state.me.listed)+errSlot+'<button class="solid" type="submit">저장</button></form>');
  wireIndustry();
  formRun($("#work"),async f=>{
    await Club.saveWork(workValues(f));
    await refresh();
    if(phase==="error")throw Error("저장한 프로필을 다시 불러와 주세요.");
    close();toast("근무 정보를 저장했어요.");
  });
}
function account(){
  const editButton=state.me?.role==="졸업생"?button("editWork","근무 정보 수정"):"";
  if(Club.demo){popup("체험할 부원 선택",note+'<div class="chips">'+button("role","재학생으로 체험",Club.role()==="visitor"?"solid":"outline","visitor")+button("role","졸업생으로 체험",Club.role()==="grad"?"solid":"outline","grad")+editButton+'</div>');return;}
  if(!Club.ready){popup("부원 로그인",'<p class="hint">운영 서버 연결을 준비 중이에요.</p>');return;}
  if(!Club.hasSession()){login();return;}
  if(!state.me){join();return;}
  popup("내 가입 상태",'<p class="hint">'+(state.me.approved?"승인된 돌밭 부원이에요.":"운영진이 부원 여부를 확인하고 있어요. 승인 후 이 화면에서 상태를 새로 확인할 수 있어요.")+'</p><p>'+esc(state.me.nickname)+' · '+esc([state.me.department,state.me.role].filter(Boolean).join(' · '))+'</p><div class="chips">'+editButton+button("check","상태 새로고침")+button("logout","로그아웃")+'</div>');
}
function login(isNew=false){
  const title=isNew?"부원 계정 만들기":"부원 로그인";
  popup(title,'<form class="form" id="login"><p class="dim">'+(isNew?"부원 확인에 사용할 계정을 만들어 주세요.":"가입할 때 만든 돌밭 아이디로 로그인해 주세요.")+'</p><label>돌밭 아이디<input required name="handle" autocomplete="username" pattern="[a-z0-9_]{3,24}" maxlength="24" autocapitalize="none" spellcheck="false" placeholder="영문 소문자, 숫자, 밑줄 3~24자"></label><label>비밀번호<input required type="password" name="password" autocomplete="'+(isNew?"new-password":"current-password")+'"></label>'+errSlot+'<button type="submit" class="solid">'+(isNew?"계정 만들기":"로그인")+'</button></form>'+button(isNew?"login":"enroll",isNew?"이미 계정이 있어요":"처음 방문하셨나요? 부원 가입","switch"));
  formRun($("#login"),async f=>{const handle=f.get("handle").trim().toLowerCase(),password=f.get("password");
    try {
      await Club.authenticate(handle,password,isNew);
    } catch(e) {
      if(e.code==="invalid_credentials") throw Error("아이디와 비밀번호를 확인해 주세요.");
      throw e;
    }
    await refresh();if(phase==="error")throw Error(failure);if(state.me?.approved)close();else account();
  });
}
function join(){
  popup("돌밭 부원 가입 신청",'<form class="form" id="join"><p class="dim">운영진이 부원 여부를 확인한 뒤 게시판이 열려요.</p><label>부원 확인용 이름<input name="member_name" maxlength="32" required><small>운영진에게만 표시됩니다.</small></label><label>게시판 닉네임<input name="nickname" maxlength="20" required></label><label>구분<select id="roleSelect" name="role">'+picks(["재학생","졸업생"])+'</select></label><label>전공<input type="text" name="department" required placeholder="예: 기계공학과"></label><div id="mentorOpt" class="work-fields" hidden>'+workFields({},true)+'<label>한 줄 소개<input name="bio" maxlength="160"></label>'+visibilityField()+'</div>'+errSlot+'<button type="submit" class="solid">가입 신청</button></form>'+button("logout","로그아웃","switch"));
  const form=$("#join");
  const roleSelect=$("#roleSelect");
  function syncWorkRequirements(){
    const graduate=roleSelect.value==="졸업생";
    $("#mentorOpt").hidden=!graduate;
    form.elements.company.required=graduate;
    form.elements.industry.required=graduate&&!form.elements.industry_choice.value;
  }
  roleSelect.onchange=syncWorkRequirements;
  wireIndustry(syncWorkRequirements);
  syncWorkRequirements();
  formRun(form,async f=>{
    const role=f.get("role");
    const graduate=role==="졸업생";
    const work=graduate?workValues(f):{company:"",industry:"",listed:false};
    if(graduate && (!work.company||!work.industry))throw Error("근무 회사와 업종을 입력해 주세요.");
    await Club.join({nickname:f.get("nickname").trim(),member_name:f.get("member_name").trim(),role,
      department:readMajor(f.get("department")),bio:graduate?f.get("bio").trim():"",...work});
    await refresh();
    if(phase==="error")throw Error(failure);
    account();
  });
}
function compose(target=""){
  if(!state.me?.approved)return account();
  const p=person(target), id=crypto.randomUUID();
  const topicField='<label>질문 주제<select name="field" required><option value="">주제 선택</option>'+picks(questionTopics)+'</select></label>';
  popup("질문하기",'<form class="form" id="ask">'+authorFields()+(p?'<p class="hint">'+esc(p.nickname)+' 선배에게 묻는 질문이에요. 승인된 부원 모두 읽고 답할 수 있어요.</p>':"")+topicField+'<label>제목<input name="title" maxlength="120" minlength="2" placeholder="어떤 점이 궁금한가요?" required></label><div class="related" id="related"></div><label>질문 내용<textarea name="body" maxlength="5000" required placeholder="상황과 이미 시도해 본 내용을 알려 주세요."></textarea></label>'+fileInput+errSlot+'<button class="solid" type="submit">질문 등록</button></form>');
  const form=$("#ask");form.elements.title.oninput=e=>{const terms=norm(e.target.value).split(/\s+/).filter(x=>x.length>1);const hits=terms.length?state.questions.map(q=>[q,terms.filter(t=>norm(q.title+" "+q.body).includes(t)).length]).filter(([,score])=>score).sort((a,b)=>b[1]-a[1]).slice(0,3):[];$("#related").innerHTML=hits.length?"비슷한 질문"+hits.map(([q])=>'<details><summary>'+esc(q.title)+'</summary><p class="meta">'+esc(byline(q))+'</p><p>'+esc(q.body)+'</p>'+state.answers.filter(a=>a.question_id===q.id).map(a=>'<p><b>답변</b> '+esc(byline(a))+'</p><p>'+esc(a.body)+'</p>').join("")+'</details>').join(""):"";};
  formRun(form,async f=>{const title=f.get("title").trim(),body=f.get("body").trim();if(title.length<2||!body)throw Error("제목과 질문 내용을 입력해 주세요.");
    const field=f.get("field");
    if(!questionTopics.includes(field))throw Error("질문 주제를 선택해 주세요.");
    await Club.put("questions",{id,field,author:state.me.id,...authorDetails(f),target:target||null,title,body,photo:await toPhoto(f.get("photo")),created_at:new Date().toISOString()});
    query="";status="";topic="";if(area()!=="questions")location.hash="questions";await refresh();if(phase==="error")throw Error("저장 후 게시판을 다시 불러오지 못했어요. 화면을 새로고침해 주세요.");await read(id);});
}
async function read(id){
  popup("질문 보기",'<p class="dim">질문을 불러오는 중…</p>');const version=detailVersion;
  try{
    const {q,a}=await Club.details(id,state);if(!modal.open||version!==detailVersion)return;if(!q)throw Error("질문을 찾을 수 없어요.");
    a.sort((x,y)=>x.created_at.localeCompare(y.created_at));
    const replyHTML=a.map(r=>'<article class="reply"><div class="meta"><strong>'+esc(byline(r))+'</strong><span>'+esc(labelRole(person(r.author)))+'</span><span>·</span>'+day(r.created_at)+'</div><p class="article">'+esc(r.body)+'</p>'+photoTag(r.photo)+'</article>').join("");
    popup(q.title,'<div class="labelrow">'+topicBadge(q)+'<span class="meta">'+esc(byline(q))+' · '+day(q.created_at)+'</span></div>'+(q.target?'<p class="notice">'+esc(nameOf(q.target))+' 선배에게 보낸 질문</p>':"")+'<p class="article">'+esc(q.body)+'</p>'+photoTag(q.photo)+'<section class="replies"><h3>답변 '+a.length+'</h3>'+(replyHTML||'<p class="dim">첫 답변을 기다리고 있어요.</p>')+'</section><form class="form detail-form" id="reply">'+authorFields()+'<label>답변 남기기<textarea maxlength="5000" name="body" required placeholder="후배에게 도움이 될 경험을 들려주세요."></textarea></label>'+fileInput+errSlot+'<button type="submit" class="solid">답변 등록</button></form>');
    const aid=crypto.randomUUID();formRun($("#reply"),async f=>{const body=f.get("body").trim();if(!body)throw Error("답변 내용을 입력해 주세요.");await Club.put("answers",{id:aid,question_id:id,author:state.me.id,...authorDetails(f),body,photo:await toPhoto(f.get("photo")),created_at:new Date().toISOString()});await refresh();if(phase==="error")throw Error("저장 후 목록을 다시 불러오지 못했어요.");await read(id);});
  }catch(e){if(modal.open&&version===detailVersion)popup("질문 보기",'<p class="error">'+esc(e.message)+'</p>');}
}
function profile(id){const p=person(id);if(!p?.listed||!state.me?.approved)return;popup(p.nickname+' 선배','<div class="labelrow"><span class="meta">'+esc([p.department,"졸업생"].filter(Boolean).join(" · "))+'</span></div>'+employmentSummary(p)+'<p class="article">'+esc(p.bio||"질문을 기다리고 있어요.")+'</p>'+button("new","이 선배에게 질문하기","solid",p.id));}
document.addEventListener("click",async e=>{const b=e.target.closest("[data-act]");if(!b)return;const act=b.dataset.act,id=b.dataset.id;try{switch(act){
  case "editWork":editWork();break;case "profile":profile(id);break;case "read":await read(id);break;case "new":compose(id);break;
  case "status":status=id;paint();break;
  case "mentors":case "questions":location.hash=act;break;
  case "retry":await refresh();break;case "account":account();break;case "login":login();break;case "enroll":login(true);break;
  case "check":close();await refresh();break;case "logout":try{await Club.logout();}finally{if(modal.open)close();await refresh();}break;
  case "role":Club.setRole(id);close();await refresh();toast(promptText()+" · "+state.me.role);break;}
}catch(err){toast(err.message);}});
board.addEventListener("input",e=>{if(e.target.id==="search"){query=e.target.value;results();}});
board.addEventListener("change",e=>{
  if(e.target.id==="mfilter"){status=e.target.value;results();}
  if(e.target.id==="topicFilter"){topic=e.target.value;results();}
});
$("#about").onclick=()=>popup("이용 안내",'<p class="article">돌밭(DOLBAT)은 건국대학교 공과대학에서 로봇을 만드는 학술 동아리예요. 이곳에서는 기계공학과와 전자전기공학과 재학생·졸업생에게 제작 경험이나 진로에 대해 물어볼 수 있어요.</p><p class="article">동문 근황과 대회·수상 소식은 <a href="https://cafe.naver.com/dolbat1998" target="_blank" rel="noopener noreferrer">네이버 카페</a>에서, 동아리 활동 사진은 <a href="https://www.instagram.com/dolbat_ku/" target="_blank" rel="noopener noreferrer">인스타그램 @dolbat_ku</a>에서 볼 수 있어요.</p><p class="hint">선배를 지정한 질문도 승인된 부원 모두가 볼 수 있어요. 인물 사진이나 동아리 밖의 자료는 공유할 수 있는지 먼저 확인해 주세요.</p>'+(Club.demo?note:""));
$("#account").onclick=account;window.addEventListener("hashchange",paint);window.addEventListener("focus",()=>{if(!modal.open&&phase==="ok"&&!Club.demo)refresh();});
paint();refresh();
