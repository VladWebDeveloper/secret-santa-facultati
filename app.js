import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const $ = (id) => document.getElementById(id);
const DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY;
const STORAGE_KEY = 'secret-santa-campus-demo-v1';
const STATUS_DEFAULTS = { name: 'Secret Santa Campus', registration_open: true, draw_done: false,
  budget_min: 100, exchange_at: null, exchange_place: '', participant_count: 0 };
const state = { client: null, user: null, profile: null, status: {...STATUS_DEFAULTS},
  assignment: null, isAdmin: false, attendees: [] };
let demo = null;
let toastTimer;

function toast(message, error = false) {
  const el = $('notice');
  el.textContent = message;
  el.classList.toggle('error', error);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 5100);
}
function humanError(error) {
  const raw = error?.message || String(error);
  if (/rate limit|email rate/i.test(raw)) return 'Prea multe emailuri trimise. Încearcă puțin mai târziu.';
  if (/invalid login credentials|invalid login/i.test(raw)) return 'Emailul sau parola sunt incorecte.';
  if (/email not confirmed/i.test(raw)) return 'Contul necesită confirmarea emailului. Contactează organizatorii.';
  if (/duplicate key|already registered/i.test(raw)) return 'Acest email are deja cont. Apasă „Am deja cont”.';
  return raw;
}
async function safe(work, busyElement) {
  if (busyElement) busyElement.disabled = true;
  try { await work(); }
  catch (error) { console.error(error); toast(humanError(error), true); }
  finally { if (busyElement) busyElement.disabled = false; }
}
function setValue(id, value) { $(id).value = value ?? ''; }
function show(id, yes) { $(id).hidden = !yes; }
function setText(id, value) { $(id).textContent = value ?? ''; }
function formatDate(value) {
  if (!value) return 'În curând';
  const date = new Date(value);
  if (Number.isNaN(+date)) return 'În curând';
  return new Intl.DateTimeFormat('ro-MD', { day: 'numeric', month: 'short', timeZone: 'Europe/Chisinau' }).format(date);
}
function formatDateTime(value) {
  if (!value) return 'Urmează să fie anunțată';
  return new Intl.DateTimeFormat('ro-MD', {
    day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Chisinau'
  }).format(new Date(value));
}
function toLocalInput(dateValue) {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(+date)) return '';
  return new Date(date.getTime() - date.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
function toISO(dateValue) { return dateValue ? new Date(dateValue).toISOString() : null; }
function cleanEmail(value){return value.trim().toLowerCase();}

// Modul demo funcționează exclusiv pe acest dispozitiv și NU înscrie persoane reale.
function demoSave(){ try {localStorage.setItem(STORAGE_KEY,JSON.stringify(demo));} catch { /* Browser privacy mode: păstrează doar în sesiunea curentă. */ } }
function demoBoot(){
  try{ demo = JSON.parse(localStorage.getItem(STORAGE_KEY)); }catch{ demo=null; }
  if (!demo || !Array.isArray(demo.people)) {
    demo = { currentEmail:null, status:{...STATUS_DEFAULTS}, people:[
      {user_id:'sample1',email:'irina@example.test',full_name:'Irina Popescu',university:'ASEM',faculty:'Finanțe',wishlist:'O carte de dezvoltare personală, ceai verde sau un carnet frumos.',avoid_gifts:'',gift_ready:false},
      {user_id:'sample2',email:'daniel@example.test',full_name:'Daniel Rusu',university:'USM',faculty:'Drept',wishlist:'Accesorii de birou, cafea sau un joc de societate.',avoid_gifts:'Ciocolată cu lapte.',gift_ready:false},
      {user_id:'sample3',email:'maria@example.test',full_name:'Maria Ceban',university:'UTM',faculty:'Calculatoare',wishlist:'Un termos, stickere sau o carte SF.',avoid_gifts:'',gift_ready:false},
      {user_id:'sample4',email:'andrei@example.test',full_name:'Andrei Lupu',university:'ASEM',faculty:'Business și Administrare',wishlist:'O cană de iarnă, un set de markere.',avoid_gifts:'',gift_ready:false}
    ]};
    demoSave();
  }
  $('demo-ribbon').hidden = false;
  state.user = demo.currentEmail ? { id:demo.currentEmail,email:demo.currentEmail } : null;
}
function demoDraw(){
  const people = demo.people;
  if(people.length<2) throw Error('Sunt necesari cel puțin doi participanți.');
  const groups = new Map();
  people.forEach(p=>{const k=p.faculty.trim().toLocaleLowerCase('ro');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(p);});
  const randomSort=arr=>arr.map(v=>({v,r:Math.random()})).sort((a,b)=>a.r-b.r).map(x=>x.v);
  const ordered=randomSort([...groups.values()]).flatMap(randomSort);
  const n=ordered.length;
  const shift=Math.min(Math.max(...[...groups.values()].map(x=>x.length)),n-1);
  let cross=0;
  for(let i=0;i<n;i++){
    ordered[i].assigned_to=ordered[(i+shift)%n].user_id;
    ordered[i].gift_ready=false;
    if(ordered[i].faculty.trim().toLocaleLowerCase('ro')!==ordered[(i+shift)%n].faculty.trim().toLocaleLowerCase('ro'))cross++;
  }
  demo.status.draw_done=true;
  demo.status.registration_open=false;
  demoSave();
  return {participants:n,cross_faculty:cross,same_faculty:n-cross};
}
async function load() {
  if (DEMO) {
    state.status = {...demo.status,participant_count:demo.people.length};
    state.profile = demo.people.find(p=>p.email===state.user?.email) || null;
    state.assignment = state.profile?.assigned_to ? demo.people.find(p=>p.user_id===state.profile.assigned_to) : null;
    state.isAdmin = !!state.user; // control admin de demonstrație, doar pe acest dispozitiv
    state.attendees = state.isAdmin ? [...demo.people] : [];
  } else {
    const {data:status,error:statusErr} = await state.client.rpc('get_santa_status');
    if(statusErr) throw statusErr;
    state.status={...STATUS_DEFAULTS,...status};
    state.profile=null;
    state.assignment=null;
    state.isAdmin=false;
    state.attendees=[];
    if(state.user){
      const {data:profile,error:profileErr}=await state.client.from('participants').select('*').eq('user_id',state.user.id).maybeSingle();
      if(profileErr) throw profileErr;
      state.profile=profile;
      const {data:isAdmin,error:adminErr}=await state.client.rpc('is_santa_admin');
      if(adminErr) throw adminErr;
      state.isAdmin=!!isAdmin;
      if(profile && state.status.draw_done){
        const {data:rows,error:assignmentErr}=await state.client.rpc('my_santa_assignment');
        if(assignmentErr) throw assignmentErr;
        state.assignment=rows?.[0]||null;
      }
      if(state.isAdmin){
        const {data:list,error:listErr}=await state.client.from('participants')
          .select('user_id,full_name,university,faculty,email,gift_ready,joined_at')
          .order('joined_at',{ascending:true});
        if(listErr) throw listErr;
        state.attendees=list||[];
      }
    }
  }
  render();
}
function render(){
  const s=state.status;
  setText('participant-count',s.participant_count || 0);
  setText('event-status',s.draw_done?'EXTRAS':s.registration_open?'DESCHIS':'ÎNCHIS');
  setText('event-date',formatDate(s.exchange_at));
  const signedIn=!!state.user;
  show('auth-form',!signedIn);
  show('profile-form',signedIn && (!!state.profile||!!s.registration_open));
  show('registration-closed',!s.registration_open && !state.profile);
  show('account-guest',!signedIn||!state.profile);
  $('account-guest').querySelector('h3').textContent=signedIn?'Completează mai întâi înscrierea':'Încă nu te-ai autentificat';
  $('account-guest').querySelector('p').textContent=signedIn?'După ce salvezi profilul, detaliile vor apărea aici.':'Intră cu emailul tău pentru a vedea detaliile participării.';
  show('account-member',signedIn&&!!state.profile);
  show('admin-panel',signedIn&&state.isAdmin);
  show('admin-activation',signedIn&&!state.isAdmin);
  setText('nav-account','Contul meu');
  setText('header-cta',signedIn&&state.profile?'Contul meu ↗':s.registration_open?'Participă ↗':'Intră în cont ↗');
  $('header-cta').href=(signedIn&&state.profile)?'#cont':'#inscriere';
  if(signedIn){
    setText('form-title',state.profile?'Actualizează wishlistul ♡':'Completează înscrierea 🎅');
    setText('form-subtitle',state.profile?'Dorințele tale îl vor ajuta pe Secret Santa.':'Spune-ne câteva lucruri despre tine.');
    setText('save-profile',state.profile?'Salvează modificările →':'Confirmă înscrierea →');
    ['full-name','university','faculty'].forEach((id,i)=>{
      const prop=['full_name','university','faculty'][i];
      setValue(id,state.profile?.[prop]);
      $(id).disabled=!!state.profile&&(!s.registration_open||s.draw_done);
    });
    setValue('wishlist',state.profile?.wishlist);
    setValue('avoid',state.profile?.avoid_gifts);
    $('consent').checked=!!state.profile;
    setText('profile-hint',s.draw_done||!s.registration_open?'După închiderea înscrierilor poți modifica doar dorințele.':'Poți modifica datele până la închiderea înscrierilor.');
    if(state.profile){
      setText('member-name',state.profile.full_name);
      setText('member-faculty',`${state.profile.faculty} · ${state.profile.university}`);
      setText('member-email',state.profile.email);
      const assignment=state.assignment;
      show('assignment-pending',!assignment);
      show('assignment-revealed',!!assignment);
      setText('assignment-status',assignment?'DEZVĂLUIT':'ÎN AȘTEPTARE');
      if(assignment){
        setText('recipient-name',assignment.recipient_name||assignment.full_name);
        setText('recipient-school',`${assignment.recipient_faculty||assignment.faculty} · ${assignment.recipient_university||assignment.university}`);
        setText('recipient-wishes',assignment.recipient_wishlist||assignment.wishlist);
        const avoided=assignment.recipient_avoid??assignment.avoid_gifts??'';
        show('avoid-box',!!avoided);
        setText('recipient-avoid',avoided);
        $('gift-ready').checked=!!state.profile.gift_ready;
      }
    }
  }
  if(state.isAdmin){
    setValue('exchange-at',toLocalInput(s.exchange_at));
    setValue('exchange-place',s.exchange_place);
    $('registration-open').checked=s.registration_open;
    $('registration-open').disabled=s.draw_done;
    $('admin-draw').disabled=s.draw_done||state.attendees.length<2;
    setText('admin-draw',s.draw_done?'Extragerea a fost finalizată ✓':'Realizează extragerea ✨');
    const ready=state.attendees.filter(p=>p.gift_ready).length;
    setText('admin-stats',`${state.attendees.length} participanți · ${ready} cadouri pregătite`);
    const tbody=$('admin-rows');
    tbody.replaceChildren();
    state.attendees.forEach(person=>{
      const tr=document.createElement('tr');
      const cells=[person.full_name,`${person.university} · ${person.faculty}`,person.gift_ready?'✅ Da':'—'];
      cells.forEach(value=>{const td=document.createElement('td');td.textContent=value;tr.append(td);});
      const td=document.createElement('td');
      if(s.registration_open&&!s.draw_done){
        const remove=document.createElement('button');
        remove.type='button';remove.className='text-link text-button';
        remove.textContent='Elimină';remove.dataset.userId=person.user_id;
        remove.dataset.personName=person.full_name;
        td.append(remove);
      }else{td.textContent='—';}
      tr.append(td);tbody.append(tr);
    });
  }
}
function profileInput() {
  const values={
    p_full_name:$('full-name').value.trim(),p_university:$('university').value.trim(),
    p_faculty:$('faculty').value.trim(),p_wishlist:$('wishlist').value.trim(),
    p_avoid_gifts:$('avoid').value.trim()
  };
  if(values.p_full_name.length<3||values.p_university.length<2||values.p_faculty.length<2||values.p_wishlist.length<4)
    throw Error('Completează numele, universitatea, facultatea și cel puțin o dorință.');
  if(!$('consent').checked) throw Error('Este necesar acordul pentru participare.');
  return values;
}
async function authenticate(createAccount = false){
  const email=cleanEmail($('email').value);
  const password=$('password').value;
  if(!/^\S+@\S+\.\S+$/.test(email)) throw Error('Introdu o adresă de email validă.');
  if(password.length<8) throw Error('Parola trebuie să aibă cel puțin 8 caractere.');
  if(DEMO){
    demo.currentEmail=email;demoSave();state.user={id:email,email};
    await load();
    toast('Ai intrat în modul demo. Datele nu sunt partajate cu ceilalți studenți.');
    return;
  }
  const {data,error}=createAccount
    ? await state.client.auth.signUp({email,password})
    : await state.client.auth.signInWithPassword({email,password});
  if(error) throw error;
  if(!data?.session) throw Error('Nu s-a creat sesiunea. Verifică setările de confirmare email și contactează organizatorii.');
  state.user=data.user||data.session.user;
  await load();
  window.location.hash=state.profile?'cont':'inscriere';
  toast(createAccount?'Cont creat! Completează acum formularul de înscriere. 🎁':'Bine ai revenit!');
}
async function claimAdmin(){
  if(!state.user) throw Error('Autentifică-te înainte de activarea rolului.');
  const code=$('organizer-code').value.trim();
  if(code.length<20) throw Error('Cod de organizator invalid.');
  if(DEMO) throw Error('Activarea organizatorilor este disponibilă doar în aplicația reală.');
  const {error}=await state.client.rpc('claim_santa_admin',{p_code:code});
  if(error) throw error;
  $('organizer-code').value='';
  await load();
  toast('Acces de organizator activat! 🎄');
}
async function removeParticipant(id,name){
  if(!state.isAdmin||state.status.draw_done||!state.status.registration_open) throw Error('Nu poți elimina participanți acum.');
  if(!window.confirm(`Elimini participantul „${name}” din eveniment? Această operațiune nu poate fi anulată.`))return;
  if(DEMO){demo.people=demo.people.filter(p=>p.user_id!==id);demoSave();}
  else{const {error}=await state.client.rpc('remove_santa_participant',{p_user_id:id});if(error) throw error;}
  await load();toast('Participant eliminat din eveniment.');
}
async function saveProfile(event){
  event.preventDefault();
  const values=profileInput();
  if(DEMO){
    const old=demo.people.find(p=>p.email===state.user.email);
    if(old){
      if(demo.status.draw_done||!demo.status.registration_open){
        old.wishlist=values.p_wishlist;
        old.avoid_gifts=values.p_avoid_gifts;
      }else{
        Object.assign(old,{full_name:values.p_full_name,university:values.p_university,faculty:values.p_faculty,wishlist:values.p_wishlist,avoid_gifts:values.p_avoid_gifts});
      }
    }else{
      if(!demo.status.registration_open) throw Error('Înscrierile s-au închis.');
      demo.people.push({user_id:state.user.id,email:state.user.email,
        full_name:values.p_full_name,university:values.p_university,faculty:values.p_faculty,
        wishlist:values.p_wishlist,avoid_gifts:values.p_avoid_gifts,gift_ready:false});
    }
    demoSave();
  }else{
    const {error}=await state.client.rpc('save_santa_profile',values);
    if(error) throw error;
  }
  await load();
  window.location.hash='cont';
  toast('Profilul tău a fost salvat cu succes! 🎁');
}
async function signOut(){
  if(DEMO){demo.currentEmail=null;demoSave();state.user=null;}
  else{const {error}=await state.client.auth.signOut();if(error) throw error;state.user=null;}
  await load();
  window.location.hash='acasa';
  toast('Te-ai deconectat.');
}
async function changeGiftReady(){
  const checked=$('gift-ready').checked;
  if(DEMO){const p=demo.people.find(p=>p.email===state.user.email);p.gift_ready=checked;demoSave();}
  else{const {error}=await state.client.rpc('mark_santa_gift_ready',{p_ready:checked});if(error) throw error;}
  await load();
  toast(checked?'Felicitări! Cadoul este marcat ca pregătit. 🎁':'Marcajul a fost actualizat.');
}
async function saveSettings(){
  const s={p_registration_open:$('registration-open').checked,p_exchange_at:toISO($('exchange-at').value),p_exchange_place:$('exchange-place').value.trim()};
  if(DEMO){if(demo.status.draw_done&&s.p_registration_open)throw Error('Nu poți redeschide după extragere.');
    Object.assign(demo.status,{registration_open:s.p_registration_open,exchange_at:s.p_exchange_at,exchange_place:s.p_exchange_place});demoSave();}
  else{const {error}=await state.client.rpc('configure_santa_event',s);if(error) throw error;}
  await load();
  toast('Detaliile evenimentului au fost actualizate.');
}
async function drawNames(){
  if(!window.confirm('Extragerea este definitivă și va închide înscrierile. Continui?'))return;
  let result;
  if(DEMO) result=demoDraw();
  else{const {data,error}=await state.client.rpc('draw_santa_names');if(error) throw error;result=data;}
  await load();
  toast(`Extragere reușită! ${result.participants} participanți, ${result.cross_faculty} perechi între facultăți diferite.`);
}
function exportCSV(){
  if(!state.isAdmin) return;
  const header=['Nume','Email','Universitate','Facultate','Cadou pregătit'];
  const lines=[header,...state.attendees.map(p=>[p.full_name,p.email,p.university,p.faculty,p.gift_ready?'Da':'Nu'])];
  const quote=value=>'"'+String(value??'').replaceAll('\"','\"\"')+'"';
  const csv='\uFEFF'+lines.map(row=>row.map(quote).join(';')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download='secret-santa-participanti.csv';
  document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function attach(){
  $('send-code').addEventListener('click',()=>safe(()=>authenticate(false),$('send-code')));
  $('create-account').addEventListener('click',()=>safe(()=>authenticate(true),$('create-account')));
  ['email','password'].forEach(id=>$(id).addEventListener('keydown',event=>{if(event.key==='Enter')safe(()=>authenticate(false),$('send-code'));}));
  $('claim-admin').addEventListener('click',()=>safe(claimAdmin,$('claim-admin')));
  $('admin-rows').addEventListener('click',event=>{
    const button=event.target.closest('button[data-user-id]');
    if(button)safe(()=>removeParticipant(button.dataset.userId,button.dataset.personName),button);
  });
  $('profile-form').addEventListener('submit',event=>safe(()=>saveProfile(event),$('save-profile')));
  $('sign-out').addEventListener('click',()=>safe(signOut,$('sign-out')));
  $('gift-ready').addEventListener('change',()=>safe(changeGiftReady));
  $('save-settings').addEventListener('click',()=>safe(saveSettings,$('save-settings')));
  $('admin-draw').addEventListener('click',()=>safe(drawNames,$('admin-draw')));
  $('export-csv').addEventListener('click',exportCSV);
}
async function boot(){
  attach();
  if(DEMO){demoBoot();await load();return;}
  try{
    const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.57.0');
    state.client=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const {data,error}=await state.client.auth.getSession();
    if(error) throw error;
    state.user=data.session?.user||null;
    await load();
    state.client.auth.onAuthStateChange((_event,session)=>{
      if(state.user?.id===session?.user?.id)return;
      state.user=session?.user||null;
      // Nu apela RPC direct în callback-ul Supabase: evită deadlock-ul de sesiune.
      setTimeout(()=>safe(load),0);
    });
  }catch(error){console.error(error);toast('Conectarea la server a eșuat: '+humanError(error),true);}
}
boot();
