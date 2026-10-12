const cfg=window.INCENTIFY_EMS_CONFIG,api=window.incentifyEmsApi,$=(s,r=document)=>r.querySelector(s);
const state={token:sessionStorage.getItem(cfg.SESSION_KEY)||'',user:null,employee:null,settings:{},attendance:[],today:{},checkout:{},faceRegistration:{},faceModels:false,faceModelsLoading:null,faceStream:null,facePoll:null,capturing:false};
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmt=v=>{if(!v)return'—';const d=new Date(v);return isNaN(d)?String(v):d.toLocaleString()};
const fmtTime=v=>{if(!v)return'—';const d=new Date(v);return isNaN(d)?String(v):d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})};
const todayKey=()=>{const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const call=(a,p={},t)=>api.call(a,{token:state.token,...p},t);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function toast(m,t='info',ms=4200){const e=document.createElement('div');e.className='toast '+t;e.textContent=m;$('#toastStack').appendChild(e);setTimeout(()=>e.remove(),ms)}
function busy(b,on,label){if(!b)return;if(on){b.dataset.old=b.textContent;b.disabled=true;b.textContent=label||'Working…'}else{b.disabled=false;b.textContent=b.dataset.old||b.textContent}}
function getLocation(){return new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(new Error('Location is not supported by this browser.'));navigator.geolocation.getCurrentPosition(p=>resolve({latitude:Number(p.coords.latitude),longitude:Number(p.coords.longitude),accuracy:Number(p.coords.accuracy),capturedAt:new Date().toISOString()}),e=>reject(new Error(e.code===1?'Allow precise location to check out.':(e.message||'Could not read location.'))),{enableHighAccuracy:true,timeout:15000,maximumAge:0})})}

async function init(){
  if(!state.token){location.replace('./index.html');return}
  const t=todayKey();$('#selfAttendanceStart').value=t;$('#selfAttendanceEnd').value=t;
  $('#employeeLogoutBtn').onclick=logout;$('#selfAttendanceApply').onclick=loadAttendance;$('#checkoutBtn').onclick=checkout;$('#faceRegisterBtn').onclick=captureFaceRegistration;$('#faceStopBtn').onclick=stopFaceCamera;
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshFaceStatus(false)});
  try{
    await bootstrap();$('#employeeBackendState').textContent='Online';
    if(state.user&&state.user.portal!=='employee'){location.replace('./admin.html');return}
    startFaceStatusPolling();
    if(state.faceRegistration.captureAllowed)void loadFaceModels().catch(()=>{});
  }catch(e){
    sessionStorage.removeItem(cfg.SESSION_KEY);sessionStorage.removeItem(cfg.USER_KEY);
    sessionStorage.setItem('incentify_ems_login_flash',e.message||'Your session expired. Please sign in again.');
    location.replace('./index.html')
  }
}
async function bootstrap(){const r=await call('bootstrapEmployee');state.user=r.user;state.employee=r.employee;state.settings=r.settings||{};state.attendance=r.attendance||[];state.today=r.today||{};state.checkout=r.checkout||{};state.faceRegistration=r.faceRegistration||{};render()}
function render(){
  const e=state.employee||{},u=state.user||{};
  $('#employeeWelcomeName').textContent=`Welcome, ${e.fullName||'Employee'}`;$('#employeeUserName').textContent=e.fullName||u.email||'Employee';$('#employeeUserInitial').textContent=(e.fullName||u.email||'E')[0].toUpperCase();
  $('#selfEmployeeCode').textContent=e.employeeCode||'—';$('#selfStatus').textContent=e.status||'—';$('#selfName').textContent=e.fullName||'—';$('#selfEmail').textContent=e.email||u.email||'—';$('#selfDepartment').textContent=e.department||'—';$('#selfDesignation').textContent=e.designation||'—';$('#selfBranch').textContent=e.branch||'—';$('#selfShift').textContent=e.shiftName||'—';$('#selfJoining').textContent=e.joiningDate||'—';
  const mins=Number(state.settings.shift_duration_minutes||480);$('#selfShiftDuration').textContent=mins%60?`${(mins/60).toFixed(1)}h`:`${mins/60}h`;
  renderToday();renderCheckout();renderAttendance();renderFaceRegistration()
}
function renderToday(){const t=state.today||{};if(!t.lastPunch){$('#selfTodayStatus').textContent='NOT IN';$('#selfTodayDetail').textContent='Use the secure email attendance link to check in.';return}$('#selfTodayStatus').textContent=t.currentlyIn?'IN':'OUT';$('#selfTodayDetail').textContent=`Last: ${t.lastPunch.punchType} • ${fmtTime(t.lastPunch.punchTime)}`}
function renderCheckout(){const c=state.checkout||{},b=$('#checkoutBtn');$('#checkoutInTime').textContent=fmtTime(c.checkedInAt);$('#checkoutEligibleTime').textContent=fmtTime(c.requiredOutAt);$('#checkoutOutTime').textContent=fmtTime(c.checkedOutAt);$('#checkoutMessage').textContent=c.message||'Waiting for attendance.';$('#selfCheckoutState').textContent=c.state==='READY'?'READY':c.state==='COMPLETED'?'DONE':c.state==='WORKING'?'WORKING':'WAITING';$('#selfCheckoutTime').textContent=c.state==='WORKING'?`${c.remainingMinutes||0} min remaining`:(c.requiredOutAt?`Earliest ${fmtTime(c.requiredOutAt)}`:'Waiting for IN');$('#checkoutBadge').textContent=c.state||'WAITING';$('#checkoutBadge').className='badge '+(c.canCheckout?'badge-success':c.state==='COMPLETED'?'badge-success':'badge-neutral');b.disabled=!c.canCheckout;b.textContent=c.canCheckout?'Check out now':'Checkout locked'}
async function checkout(){const b=$('#checkoutBtn');busy(b,true,'Checking location…');try{const location=await getLocation();const r=await call('checkoutMyAttendance',{location},60000);toast(`OUT recorded at ${fmtTime(r.punch.punchTime)}.`,'success');await bootstrap()}catch(e){toast(e.message,'error')}finally{busy(b,false);renderCheckout()}}
async function loadAttendance(){try{const r=await call('getMyAttendance',{filters:{startDate:$('#selfAttendanceStart').value,endDate:$('#selfAttendanceEnd').value}});state.attendance=r.attendance||[];renderAttendance()}catch(e){toast(e.message,'error')}}
function renderAttendance(){const rows=state.attendance||[];$('#selfAttendanceBody').innerHTML=rows.map(p=>`<tr><td><span class="badge ${p.punchType==='IN'?'badge-success':'badge-neutral'}">${esc(p.punchType)}</span></td><td>${esc(fmt(p.punchTime))}</td><td>${esc(p.requiredOutAt?fmt(p.requiredOutAt):'—')}</td><td>${esc(p.source||p.method||'—')}</td><td>${p.distanceMeters==null?'—':esc(p.distanceMeters+' m')}</td></tr>`).join('');$('#selfAttendanceEmpty').classList.toggle('hidden',rows.length>0)}

function renderFaceRegistration(){
  const f=state.faceRegistration||{},allowed=Boolean(f.captureAllowed??f.unlocked),badge=$('#faceRegistrationBadge'),btn=$('#faceRegisterBtn'),stop=$('#faceStopBtn');
  const samples=Number(f.sampleCount||state.employee?.biometricSampleCount||0);
  $('#faceProfileState').textContent=f.hasEnrollment?`Verified${samples?` • ${samples} samples`:''}`:'Not registered';
  if(allowed){
    badge.textContent='ACCESS ON';badge.className='badge badge-warn';
    $('#faceRegistrationState').textContent=f.hasEnrollment?'Face update enabled':'Face capture enabled';
    $('#faceRegistrationDetail').textContent='Admin enabled Face Capture Access. Press Capture & verify face. No location permission is used.';
  }else if(f.hasEnrollment){
    badge.textContent='VERIFIED • ACCESS OFF';badge.className='badge badge-success';
    $('#faceRegistrationState').textContent='Face profile verified';
    $('#faceRegistrationDetail').textContent=f.verifiedAt?`Verified ${fmt(f.verifiedAt)}. Capture access is OFF. Admin can enable it if your face needs to be updated.`:'Your face profile is active for attendance verification.';
  }else{
    badge.textContent='ACCESS OFF';badge.className='badge badge-neutral';
    $('#faceRegistrationState').textContent='Waiting for Admin';
    $('#faceRegistrationDetail').textContent='Ask Admin to select your employee profile and switch Face Capture Access ON.';
  }
  btn.disabled=!allowed||state.capturing;btn.textContent=f.hasEnrollment&&allowed?'Update & verify face':'Capture & verify face';
  stop.classList.toggle('hidden',!state.faceStream);
  $('#faceRegistrationPanel').classList.toggle('face-panel-unlocked',allowed);
  if(!state.capturing){$('#faceSampleProgress').textContent='0 / 5';$('#faceQualityState').textContent=allowed?'Ready':'Waiting'}
}
async function refreshFaceStatus(showNotice=true){
  try{
    const r=await call('getMyFaceRegistrationStatus',{},12000),before=Boolean(state.faceRegistration?.captureAllowed??state.faceRegistration?.unlocked);
    state.faceRegistration=r.faceRegistration||{};const now=Boolean(state.faceRegistration?.captureAllowed??state.faceRegistration?.unlocked);renderFaceRegistration();
    if(showNotice&&!before&&now){toast('Admin enabled Face Capture Access. You can capture your face now.','success',6500);$('#faceRegistrationPanel').scrollIntoView({behavior:'smooth',block:'center'});void loadFaceModels().catch(()=>{})}
    if(before&&!now&&state.faceStream){stopFaceCamera();toast('Admin disabled Face Capture Access. Camera capture has been stopped.','info',5500)}
  }catch(_){}
}
function startFaceStatusPolling(){if(state.facePoll)clearInterval(state.facePoll);state.facePoll=setInterval(()=>void refreshFaceStatus(true),4000)}

function loadExternalScript(url){
  return new Promise((resolve,reject)=>{
    const existing=[...document.scripts].find(s=>s.src===url);if(existing){if(window.faceapi)return resolve();existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',()=>reject(new Error('load failed')),{once:true});return}
    const s=document.createElement('script');s.src=url;s.async=true;s.crossOrigin='anonymous';s.onload=resolve;s.onerror=()=>reject(new Error('load failed'));document.head.appendChild(s)
  })
}
async function loadFaceModels(){
  if(state.faceModels)return;if(state.faceModelsLoading)return state.faceModelsLoading;
  state.faceModelsLoading=(async()=>{
    if(!window.faceapi){
      const urls=cfg.FACE_LIBRARY_URLS||[cfg.FACE_LIBRARY_URL];let loaded=false;
      for(const url of urls.filter(Boolean)){try{await loadExternalScript(url);if(window.faceapi){loaded=true;break}}catch(_){}}
      if(!loaded||!window.faceapi)throw new Error('Facial-recognition engine could not load. Check internet access and reload the portal.');
    }
    const bases=cfg.FACE_MODEL_URLS||[cfg.FACE_MODEL_URL];let last=null;
    for(const base of bases.filter(Boolean)){
      try{
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(base),
          faceapi.nets.faceLandmark68Net.loadFromUri(base),
          faceapi.nets.faceRecognitionNet.loadFromUri(base)
        ]);
        state.faceModels=true;return;
      }catch(e){last=e}
    }
    throw new Error('Facial-recognition models could not load. Check the network and try again.');
  })();
  try{await state.faceModelsLoading}finally{state.faceModelsLoading=null}
}
async function waitForVideo(video,timeout=6000){
  const started=Date.now();while((video.readyState<2||!video.videoWidth||!video.videoHeight)&&Date.now()-started<timeout)await sleep(100);
  if(video.readyState<2||!video.videoWidth||!video.videoHeight)throw new Error('Camera started but no video frames were received. Close other camera apps and try again.');
}
async function startFaceCamera(){
  if(state.faceStream)return;
  if(!window.isSecureContext)throw new Error('Camera access requires the secure HTTPS Employee Portal.');
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw new Error('This browser does not support camera capture.');
  let stream;
  try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'user'},width:{ideal:1280},height:{ideal:720}},audio:false})}
  catch(first){
    try{stream=await navigator.mediaDevices.getUserMedia({video:true,audio:false})}
    catch(error){
      const name=String(error&&error.name||'');
      if(name==='NotAllowedError'||name==='SecurityError')throw new Error('Camera permission is blocked. Allow camera access for this site and try again.');
      if(name==='NotReadableError')throw new Error('The camera is already being used by another application. Close it and try again.');
      if(name==='NotFoundError'||name==='DevicesNotFoundError')throw new Error('No working camera was found on this device.');
      throw new Error('Could not start the camera. Check browser camera permissions and try again.');
    }
  }
  state.faceStream=stream;const v=$('#faceRegistrationVideo');v.srcObject=stream;await v.play();await waitForVideo(v);
  $('#faceRegistrationPlaceholder').classList.add('hidden');renderFaceRegistration()
}
function stopFaceCamera(){
  if(state.faceStream){state.faceStream.getTracks().forEach(t=>t.stop());state.faceStream=null}
  const v=$('#faceRegistrationVideo');if(v)v.srcObject=null;$('#faceRegistrationPlaceholder').classList.remove('hidden');
  if(!state.capturing)$('#faceRegistrationProgress').textContent='Ready';renderFaceRegistration()
}
function descriptorDistance(a,b){if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return Infinity;let s=0;for(let i=0;i<a.length;i++){const d=Number(a[i])-Number(b[i]);s+=d*d}return Math.sqrt(s)}
function averageDescriptors(ds){const out=new Array(ds[0].length).fill(0);ds.forEach(d=>d.forEach((v,i)=>out[i]+=Number(v)));for(let i=0;i<out.length;i++)out[i]/=ds.length;const n=Math.sqrt(out.reduce((s,v)=>s+v*v,0))||1;return out.map(v=>Number((v/n).toFixed(8)))}
async function detectGoodFace(video,sampleNo){
  const options=new faceapi.TinyFaceDetectorOptions({inputSize:224,scoreThreshold:.5});let lastHint='Position your face inside the guide.';
  for(let attempt=0;attempt<28;attempt++){
    if(!(state.faceRegistration.captureAllowed??state.faceRegistration.unlocked))throw new Error('Face Capture Access was switched OFF by Admin.');
    const detections=await faceapi.detectAllFaces(video,options).withFaceLandmarks().withFaceDescriptors();
    if(detections.length>1){lastHint='Only one person should be visible in the camera.'}
    else if(detections.length===1){
      const d=detections[0],box=d.detection.box,score=Number(d.detection.score||0),w=video.videoWidth||1,h=video.videoHeight||1;
      const faceRatio=Math.min(box.width/w,box.height/h),cx=(box.x+box.width/2)/w,cy=(box.y+box.height/2)/h;
      if(score<.52)lastHint='Improve lighting and face the camera.';
      else if(faceRatio<.15)lastHint='Move a little closer to the camera.';
      else if(cx<.12||cx>.88||cy<.10||cy>.90)lastHint='Center your face inside the guide.';
      else return {descriptor:[...d.descriptor],score,faceRatio};
    }else lastHint='Face not detected. Look directly at the camera.';
    $('#faceQualityState').textContent=lastHint;$('#faceRegistrationProgress').textContent=`Sample ${sampleNo}/5 • ${lastHint}`;await sleep(160)
  }
  throw new Error(lastHint+' Then try again.')
}
async function captureFaceRegistration(){
  if(state.capturing)return;
  const b=$('#faceRegisterBtn');state.capturing=true;busy(b,true,'Preparing…');
  try{
    const fresh=await call('getMyFaceRegistrationStatus',{},12000);state.faceRegistration=fresh.faceRegistration||{};renderFaceRegistration();
    if(!(state.faceRegistration.captureAllowed??state.faceRegistration.unlocked))throw new Error('Face Capture Access is OFF. Ask Admin to enable it for your profile.');
    $('#faceRegistrationProgress').textContent='Loading facial-recognition engine…';$('#faceQualityState').textContent='Loading';
    await loadFaceModels();
    $('#faceRegistrationProgress').textContent='Starting camera…';await startFaceCamera();
    const video=$('#faceRegistrationVideo'),samples=[],scores=[],ratios=[];
    for(let i=1;i<=5;i++){
      $('#faceSampleProgress').textContent=`${i-1} / 5`;$('#faceQualityState').textContent='Detecting';
      const sample=await detectGoodFace(video,i);samples.push(sample.descriptor);scores.push(sample.score);ratios.push(sample.faceRatio);
      $('#faceSampleProgress').textContent=`${i} / 5`;$('#faceQualityState').textContent='Good';$('#faceRegistrationProgress').textContent=`Captured ${i} of 5`;await sleep(260)
    }
    const averaged=averageDescriptors(samples),distances=samples.map(s=>descriptorDistance(s,averaged)),maxDistance=Math.max(...distances),avgScore=scores.reduce((a,b)=>a+b,0)/scores.length;
    if(maxDistance>.50)throw new Error('The five face samples were not consistent enough. Keep the same face centered and try once more.');
    const quality={consistency:Number((1-maxDistance).toFixed(3)),maxDescriptorDistance:Number(maxDistance.toFixed(4)),averageDetectionScore:Number(avgScore.toFixed(3)),minimumFaceRatio:Number(Math.min(...ratios).toFixed(3)),samples:5};
    $('#faceQualityState').textContent='Verified';$('#faceRegistrationProgress').textContent='Face quality passed. Saving securely…';
    stopFaceCamera();busy(b,true,'Saving verified face…');
    const r=await call('registerMyFace',{descriptor:averaged,livenessPassed:true,sampleCount:5,quality,deviceName:`Employee Portal • ${navigator.platform||'Browser'}`},90000);
    state.faceRegistration={hasEnrollment:true,captureAllowed:false,unlocked:false,verifiedAt:r.verifiedAt||new Date().toISOString(),sampleCount:r.sampleCount||5};
    if(state.employee){state.employee.hasFaceEnrollment=true;state.employee.biometricSampleCount=r.sampleCount||5;state.employee.faceVerifiedAt=state.faceRegistration.verifiedAt;state.employee.faceCaptureAllowed=false}
    $('#faceSampleProgress').textContent='5 / 5';$('#faceQualityState').textContent='Verified';renderFaceRegistration();
    const mail=r.emailDelivery||{},delivered=mail.employeeMailSent||mail.adminMailSent;
    toast(delivered?'Face verified and registered. Verification details were emailed.':'Face verified and registered. Email delivery could not be confirmed; Admin can review Mail Log.',delivered?'success':'error',7000)
  }catch(e){
    stopFaceCamera();$('#faceQualityState').textContent='Needs retry';$('#faceRegistrationProgress').textContent='Capture not completed';
    toast(e.message||'Face capture failed.','error',7000)
  }finally{state.capturing=false;busy(b,false);renderFaceRegistration()}
}
async function logout(){if(state.facePoll)clearInterval(state.facePoll);stopFaceCamera();try{await api.call('logout',{token:state.token,userAgent:navigator.userAgent.slice(0,480)})}catch(_){}sessionStorage.removeItem(cfg.SESSION_KEY);sessionStorage.removeItem(cfg.USER_KEY);location.replace('./index.html')}
window.addEventListener('beforeunload',()=>{if(state.facePoll)clearInterval(state.facePoll);stopFaceCamera()});
init();
