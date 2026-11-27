"use strict";
const Club = (() => {
  const departments = ["기계공학과", "전자전기공학과"];
  const cfg = window.DOLBAT_CONFIG || {};
  const demo = cfg.mode === "demo";
  const base = String(cfg.url || "").replace(/\/$/, "");
  const ready = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base) && /^sb_publishable_[A-Za-z0-9_-]+$/.test(cfg.publishableKey || "");
  const sid = "dolbal-session-v1:" + base;
  let session = null, refreshing = null;
  try {session=JSON.parse(sessionStorage.getItem(sid));}catch{}
  function saveSession(value) {
    session=value ? {access_token:value.access_token,refresh_token:value.refresh_token,user:value.user,expires_at:value.expires_at || Date.now()/1000 + value.expires_in} : null;
    if(session) sessionStorage.setItem(sid,JSON.stringify(session)); else sessionStorage.removeItem(sid);
  }
  async function api(path, {method="GET", body, auth=false, headers={}}={}) {
    if(!ready) throw Error("운영 서버 연결 설정을 확인해 주세요.");
    if(auth && !session) throw Error("다시 로그인해 주세요.");
    if(auth && session.expires_at < Date.now()/1000 + 60) {
      if(!refreshing) refreshing = api("/auth/v1/token?grant_type=refresh_token",{method:"POST",body:{refresh_token:session.refresh_token}})
        .then(saveSession).catch(e=>{if(e.status===400 || e.status===401) saveSession(null);throw e;}).finally(()=>{refreshing=null;});
      await refreshing;
    }
    const req={method,headers:{apikey:cfg.publishableKey,...headers},cache:"no-store"};
    if(auth) req.headers.Authorization="Bearer "+session.access_token;
    if(body!==undefined){req.headers["Content-Type"]="application/json";req.body=JSON.stringify(body);}
    const res=await fetch(base+path,req);
    if(!res.ok){
      const e=Error(res.status===409?"사용 중인 아이디이거나 등록할 수 없는 정보예요.":res.status===429?"요청이 많아요. 잠시 후 다시 시도해 주세요.":res.status===403?"이 작업에는 승인된 부원 권한이 필요해요.":res.status===401?"인증이 만료되었어요. 다시 로그인해 주세요.":"요청을 완료하지 못했어요. 입력 내용과 연결을 확인해 주세요.");
      e.status=res.status; throw e;
    }
    const str=await res.text();return str?JSON.parse(str):null;
  }
  const profileCols="id,nickname,role,department,bio,listed,approved";
  const table=(name,query="",opts={})=>api("/rest/v1/dolbal_"+name+(query?"?"+query:""),{auth:true,...opts});
  async function all(name,select,order){
    const rows=[];let cursor="";
    for(;;){
      const page=await table(name,"select="+select+"&order="+order+".asc&limit=400"+(cursor?"&"+order+"=gt."+encodeURIComponent(cursor):""));
      rows.push(...page);if(page.length<400)return rows;cursor=page[page.length-1][order];
    }
  }
  const when=n=>new Date(Date.now()-n*86400000).toISOString();
  const profiles=[
    ["visitor","새싹부원","재학생","기계공학과","김하늘","24","",false],
    ["grad","모터선배","졸업생","기계공학과","한도윤","16","기구 설계와 시제품 제작 과정을 함께 이야기해요.",true],
    ["student1","단풍","재학생","전자전기공학과","이한결","23","",false],
    ["student2","구름","재학생","기계공학과","박다온","24","",false],
    ["mentor2","유자선배","졸업생","기계공학과","서지안","18","설계 포트폴리오와 도면 검토 경험을 나눠요.",true],
    ["mentor3","파도선배","졸업생","전자전기공학과","윤서진","17","엔코더 신호 수집과 모터 제어 펌웨어를 다뤄요.",true],
    ["mentor4","다온선배","졸업생","전자전기공학과","오지수","19","회로 설계와 PCB 제작 경험을 나눠요.",true]
  ].map(([id,nickname,role,department,name,cohort,bio,listed])=>({id,nickname,role,department,name,cohort,bio,listed,approved:true}));
  function sampleAuthor(id){
    const member=profiles.find(p=>p.id===id);
    return {author_department:member.department,author_class:member.cohort,author_name:member.name};
  }
  const sampleQuestions=[
    ["q1","student1","첫 인턴 포트폴리오, 어떤 경험부터 담으면 좋을까요?","동아리에서 기획과 제작을 둘 다 해봤어요. 첫 지원서에는 한 프로젝트를 깊게 보여줄지, 여러 활동을 담을지 고민돼요.",1],
    ["q2","visitor","로봇 그리퍼 설계 경험을 면접에서 어떻게 설명하셨나요?","파지 실험을 여러 번 반복했는데, 결과 사진과 실패 기록을 어떻게 구성하면 좋을까요?",2],
    ["q3","student2","협업 프로젝트에서 제 역할은 어떻게 보여주나요?","팀 결과물과 개인 작업을 포트폴리오에서 구분한 경험을 듣고 싶어요.",3],
    ["q4","student1","데이터 분석 인턴을 준비할 때 첫 프로젝트가 궁금해요","수업 과제로 모은 센서 데이터가 있어요. 분석부터 시각화까지 어느 정도 완성해야 할까요?",4],
    ["q5","student2","엔코더로 측정한 회전수를 기계팀과 어떻게 비교하나요?","기구 제작을 맡았는데 전자팀과 함께 모터를 시험하고 있어요. 같은 실험 결과를 비교하려면 어떤 값을 맞춰 두면 좋을까요?",1.5],
    ["q6","student1","첫 PCB 제작 전에 기구팀과 어떤 치수를 맞춰 두시나요?","보드 외곽과 체결 홀을 정하는 중이에요. 커넥터와 케이블에 필요한 공간을 언제 확인하면 좋을까요?",2.5]
  ].map(([id,author,title,body,days])=>({id,author,...sampleAuthor(author),title,body,created_at:when(days),target:null,photo:null}));
  const sampleReplies=[
    ["a1","q1","mentor2","제가 맡은 결정이 분명한 프로젝트 하나로 시작했어요. 처음 세운 가설, 바꾼 부분, 결과를 한 장씩 보여주니 면접에서 이어갈 이야기가 생겼습니다."],
    ["a2","q1","mentor4","지원하려는 역할과 가장 가까운 경험을 앞에 뒀어요. 팀의 결과와 내가 실제로 한 일을 나눠 적어보세요."],
    ["a3","q3","mentor2","공동 결과물 옆에 직접 만든 시안과 피드백으로 바뀐 부분을 붙였어요. 과정이 보이니 역할도 자연스럽게 드러났습니다."],
    ["a4","q5","mentor3","저희는 먼저 회전수가 모터축 기준인지 출력축 기준인지 적어 뒀어요. 그다음 같은 시간 구간의 엔코더 기록과 출력축 영상에서 센 회전수를 비교했어요."]
  ].map(([id,question_id,author,body])=>({id,question_id,author,...sampleAuthor(author),body,created_at:when(.5),photo:null}));
  const sample={profiles,questions:sampleQuestions,answers:sampleReplies};
  let role="visitor";
  try{role=localStorage.getItem("dolbal-demo-role")==="grad"?"grad":"visitor";}catch{}
  let dbPromise;
  function db(){
    if(!dbPromise) dbPromise=new Promise((resolve,reject)=>{
      const req=indexedDB.open("dolbat-lounge-preview-v1",1);
      req.onupgradeneeded=()=>{for(const k of ["questions","answers"])req.result.createObjectStore(k,{keyPath:"id"});};
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(Error("이 브라우저에서 체험 데이터를 저장할 수 없어요."));
    });return dbPromise;
  }
  async function localRows(name){
    const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction(name).objectStore(name).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  }
  async function load(){
    if(demo){const [q,a]=await Promise.all([localRows("questions"),localRows("answers")]);return {profiles,questions:[...sampleQuestions,...q],answers:[...sampleReplies,...a],me:profiles.find(p=>p.id===role)};}
    const blank={profiles:[],questions:[],answers:[],me:null};
    if(!ready || !session)return blank;
    const me=(await table("profiles","id=eq."+encodeURIComponent(session.user.id)+"&select="+profileCols))[0];
    if(!me?.approved)return {...blank,me:me||null};
    const [p,q,a]=await Promise.all([all("profiles",profileCols,"id"),all("questions","id,author,author_name,author_department,author_class,target,title,body,created_at","id"),all("answers","id,question_id,author,author_name,author_department,author_class,body,created_at","id")]);
    return {profiles:p,questions:q,answers:a,me};
  }
  async function put(name,obj){
    if(demo){const d=await db();await new Promise((resolve,reject)=>{const tx=d.transaction(name,"readwrite");tx.objectStore(name).put(obj);tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(Error("이 브라우저에 저장하지 못했어요. 사진 크기를 줄여 주세요."));});return;}
    const row={...obj};delete row.created_at;
    try{await table(name,"",{method:"POST",body:row});}
    catch(e){if(e.status!==409)throw e;const existing=await table(name,"id=eq."+row.id+"&select=author");if(existing[0]?.author!==row.author)throw e;}
  }
  async function details(id,state){
    if(demo)return {q:state.questions.find(q=>q.id===id),a:state.answers.filter(a=>a.question_id===id)};
    const [qs,a]=await Promise.all([table("questions","id=eq."+encodeURIComponent(id)+"&select=*"),allForQuestion(id)]);
    return {q:qs[0],a};
  }
  async function allForQuestion(id){
    const rows=[];let cursor="";
    for(;;){const part=await table("answers","question_id=eq."+encodeURIComponent(id)+"&select=*&order=id.asc&limit=15"+(cursor?"&id=gt."+cursor:""));
      rows.push(...part);if(part.length<15)return rows;cursor=part[part.length-1].id;}
  }
  return {departments,demo,ready,sample,load,put,details,
    hasSession:()=>!!session,role:()=>role,setRole:r=>{role=r==="grad"?"grad":"visitor";localStorage.setItem("dolbal-demo-role",role);},
    signIn:async(handle,password)=>saveSession(await api("/auth/v1/token?grant_type=password",{method:"POST",body:{email:handle+"@members.dolbal.invalid",password}})),
    enroll:(handle,password)=>api("/functions/v1/dolbal-enroll",{method:"POST",headers:{Authorization:"Bearer "+cfg.enrollmentGatewayKey},body:{handle,password}}),
    join:profile=>table("profiles","",{method:"POST",body:{...profile,id:session.user.id}}),
    logout:async()=>{try{if(session)await api("/auth/v1/logout?scope=local",{method:"POST",auth:true});}finally{saveSession(null);}}
  };
})();
