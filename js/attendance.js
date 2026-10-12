const cfg=window.INCENTIFY_EMS_CONFIG,api=window.incentifyEmsApi,$=(s,r=document)=>r.querySelector(s);
const token=new URLSearchParams(location.search).get('token')||'';
const state={context:null,location:null,models:false,stream:null};
function toast(m,t='info',ms=4200){const e=document.createElement('div');e.className='toast '+t;e.textContent=m;$('#toastStack').appendChild(e);setTimeout(()=>e.remove(),ms)}
function busy(b,on,label){if(on){b.dataset.old=b.textContent;b.disabled=true;b.textContent=label}else{b.disabled=false;b.textContent=b.dataset.old||b.textContent}}
function status(title,text,type=''){$('#linkStatusTitle').textContent=title;$('#linkStatusText').textContent=text;$('#linkStatusBox').className='portal-notice '+type}
const fmt=v=>{const d=new Date(v);return isNaN(d)?String(v):d.toLocaleString([], {dateStyle:'medium',timeStyle:'short'})};
async function init(){
  if(!token){status('Invalid link','The attendance token is missing.','error');return}
  try{
    const r=await api.call('getAttendanceLinkContext',{attendanceToken:token},20000);state.context=r;
    if(r.state==='USED'){
      const done=r.completedResult||null;
      if(done&&done.action==='IN'){$('#captureContent').classList.add('hidden');$('#linkSuccess').classList.remove('hidden');$('#linkSuccessTitle').textContent='Attendance already recorded';$('#linkSuccessText').textContent=done.punch&&done.punch.requiredOutAt?`Your IN attendance is recorded. Earliest checkout: ${fmt(done.punch.requiredOutAt)}.`:'Your IN attendance was recorded successfully.';status('Completed','The server confirmed this attendance link was already completed.','success');return}
      status('Link already used',r.message||'This link has already been used.','success');return
    }
    $('#captureContent').classList.remove('hidden');$('#linkEmployeeName').textContent=r.employee.fullName;$('#linkEmployeeCode').textContent=r.employee.employeeCode;$('#linkDate').textContent=r.date;$('#linkExpiry').textContent=fmt(r.validUntil);
    status('Attendance link','This link is active. Complete office-location and face verification before it expires. Face registration itself is managed only inside the Employee Portal.','success');
    $('#linkCheckLocationBtn').onclick=checkLocation;$('#linkCaptureBtn').onclick=captureAndSubmit;const warm=()=>models().catch(()=>{});if('requestIdleCallback'in window)requestIdleCallback(warm,{timeout:1200});else setTimeout(warm,350);
  }catch(e){status('Attendance link unavailable',e.message,'error')}
}
function preciseLocation(){return new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(new Error('Location is not supported by this browser.'));navigator.geolocation.getCurrentPosition(p=>resolve({latitude:Number(p.coords.latitude),longitude:Number(p.coords.longitude),accuracy:Number(p.coords.accuracy),capturedAt:new Date().toISOString()}),e=>reject(new Error(e.code===1?'Allow precise location to continue.':(e.message||'Could not read your location.'))),{enableHighAccuracy:true,timeout:15000,maximumAge:0})})}
async function checkLocation(){const b=$('#linkCheckLocationBtn');busy(b,true,'Locating…');try{state.location=await preciseLocation();$('#linkLocationState').textContent='Location captured';$('#linkLocationDetail').textContent=`Accuracy ±${Math.round(state.location.accuracy)} m. Final office-radius validation happens on the server when attendance is submitted.`;toast('Location captured.','success');return state.location}catch(e){state.location=null;$('#linkLocationState').textContent='Location blocked';$('#linkLocationDetail').textContent=e.message;toast(e.message,'error');throw e}finally{busy(b,false)}}
function loadScript(url){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=url;s.async=true;s.crossOrigin='anonymous';s.onload=resolve;s.onerror=()=>reject(new Error('load failed'));document.head.appendChild(s)})}
async function models(){
  if(state.models)return;
  if(!window.faceapi){
    let ok=false;for(const url of (cfg.FACE_LIBRARY_URLS||[cfg.FACE_LIBRARY_URL]).filter(Boolean)){try{await loadScript(url);if(window.faceapi){ok=true;break}}catch(_){}}
    if(!ok)throw new Error('Face verification engine could not load. Check internet access and reload this page.');
  }
  let last=null;
  for(const base of (cfg.FACE_MODEL_URLS||[cfg.FACE_MODEL_URL]).filter(Boolean)){
    try{await Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri(base),faceapi.nets.faceLandmark68Net.loadFromUri(base),faceapi.nets.faceRecognitionNet.loadFromUri(base)]);state.models=true;return}catch(e){last=e}
  }
  throw new Error('Face verification models could not load. Check the network and try again.');
}
async function startCamera(){
  if(!window.isSecureContext)throw new Error('Camera access requires HTTPS.');
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw new Error('Camera capture is not supported by this browser.');
  try{state.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'user'},width:{ideal:1280},height:{ideal:720}},audio:false})}
  catch(_){state.stream=await navigator.mediaDevices.getUserMedia({video:true,audio:false})}
  const v=$('#linkVideo');v.srcObject=state.stream;await v.play();const started=Date.now();while((v.readyState<2||!v.videoWidth)&&Date.now()-started<5000)await new Promise(r=>setTimeout(r,100));if(!v.videoWidth)throw new Error('Camera opened but no video frames were received.');$('#linkCameraPlaceholder').classList.add('hidden')
}
function stopCamera(){if(state.stream){state.stream.getTracks().forEach(t=>t.stop());state.stream=null}$('#linkVideo').srcObject=null;$('#linkCameraPlaceholder').classList.remove('hidden')}
function distance(a,b){if(a.length!==b.length)return Infinity;let s=0;for(let i=0;i<a.length;i++){const d=Number(a[i])-Number(b[i]);s+=d*d}return Math.sqrt(s)}
function avg(ds){const out=new Array(ds[0].length).fill(0);ds.forEach(d=>d.forEach((v,i)=>out[i]+=Number(v)));for(let i=0;i<out.length;i++)out[i]/=ds.length;const n=Math.sqrt(out.reduce((s,v)=>s+v*v,0))||1;return out.map(v=>Number((v/n).toFixed(8)))}
async function captureAndSubmit(){
  const b=$('#linkCaptureBtn');busy(b,true,'Preparing…');
  try{
    if(!state.location||Date.now()-new Date(state.location.capturedAt).getTime()>60000)await checkLocation();
    await models();await startCamera();const video=$('#linkVideo'),samples=[];
    const options=new faceapi.TinyFaceDetectorOptions({inputSize:224,scoreThreshold:.5});
    for(let i=1;i<=3;i++){
      let found=null,lastHint='Face not detected clearly.';
      for(let a=0;a<24&&!found;a++){
        const ds=await faceapi.detectAllFaces(video,options).withFaceLandmarks().withFaceDescriptors();
        if(ds.length>1)lastHint='Only one person should be visible.';
        else if(ds.length===1){
          const d=ds[0],box=d.detection.box,w=video.videoWidth||1,h=video.videoHeight||1,ratio=Math.min(box.width/w,box.height/h);
          if(Number(d.detection.score||0)<.52)lastHint='Improve lighting and face the camera.';
          else if(ratio<.14)lastHint='Move a little closer to the camera.';
          else found=d;
        }
        if(!found){$('#linkCaptureProgress').textContent=`Sample ${i}/3 • ${lastHint}`;await new Promise(r=>setTimeout(r,160))}
      }
      if(!found)throw new Error(lastHint+' Then try again.');
      samples.push([...found.descriptor]);$('#linkCaptureProgress').textContent=`Face sample ${i} / 3`;await new Promise(r=>setTimeout(r,250))
    }
    const mean=avg(samples),maxDistance=Math.max(...samples.map(s=>distance(s,mean)));
    if(maxDistance>.52)throw new Error('Face samples were not consistent. Keep the same face centered and try again.');
    $('#linkCaptureProgress').textContent='Recording attendance…';stopCamera();
    status('Secure submission in progress','Keep this page open while attendance is verified. On slower networks this may take a few seconds.');
    const r=await api.call('submitAttendanceLinkFace',{attendanceToken:token,descriptor:mean,livenessPassed:true,location:state.location,deviceName:'Mobile attendance link'},70000);
    $('#captureContent').classList.add('hidden');$('#linkSuccess').classList.remove('hidden');
    $('#linkSuccessTitle').textContent='IN attendance recorded';
    $('#linkSuccessText').textContent=`Checked in at ${fmt(r.punch.punchTime)}. Your earliest checkout is ${fmt(r.punch.requiredOutAt)} after completing the full ${Number(r.punch.shiftMinutes||480)/60}-hour shift.`;
    status('Completed',r.replayed?'The server recovered the completed submission after a temporary network delay. This secure link is now consumed.':'This secure link has been consumed and cannot be used again.','success')
  }catch(e){
    stopCamera();$('#linkCaptureProgress').textContent='Ready';const msg=e&&e.message?e.message:'Secure submission could not be confirmed.';
    status('Submission not confirmed',msg,'error');toast(msg,'error',6500)
  }finally{busy(b,false)}
}
window.addEventListener('beforeunload',stopCamera);init();