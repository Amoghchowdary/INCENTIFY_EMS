import fs from 'node:fs';
const read=f=>fs.readFileSync(f,'utf8');
const files={
  index:read('index.html'),admin:read('admin.html'),employee:read('employee.html'),attendance:read('attendance.html'),
  adminJs:read('js/admin.js'),employeeJs:read('js/employee.js'),attendanceJs:read('js/attendance.js'),
  auth:read('js/auth.js'),config:read('js/config.js'),api:read('js/api-client.js'),css:read('css/app.css'),
  sw:read('sw.js'),workflow:read('.github/workflows/pages.yml'),deploy:read('scripts/test-v21-deployment.ps1')
};
const checks=[];const add=(ok,n)=>checks.push({ok:!!ok,n});
add(files.index.includes('Admin Login')&&files.index.includes('Employee Login'),'separate admin and employee login choices');
add(files.admin.includes('HOLIDAY CALENDAR')&&files.admin.includes('LATE ARRIVAL CONCESSION'),'holiday calendar and late-concession UI exist');
add(!files.admin.includes('<video')&&!files.admin.includes('<canvas'),'admin portal contains no biometric camera');
add(files.admin.includes('id="faceCaptureAccessBtn"'),'Admin has explicit Face Capture Access control');
add(files.admin.includes('Enable face capture'),'Admin face control starts as enable action');
add(files.admin.includes('<th>Face profile</th>')&&files.admin.includes('<th>Capture access</th>'),'employee directory separates face profile from capture access');
add(!files.admin.includes('Send enrollment link'),'legacy enrollment-link button removed');
add(files.adminJs.includes("call('setFaceCaptureAccess'"),'Admin ON/OFF face capture calls dedicated backend action');
add(files.adminJs.includes("e.faceCaptureAllowed?'Disable face capture':'Enable face capture'"),'Admin button switches between enable and disable');
add(files.adminJs.includes('biometricSampleCount'),'Admin shows biometric sample count');
add(files.employee.includes('Face Capture & Verification')&&files.employee.includes('faceRegistrationVideo'),'Employee Portal owns face capture camera');
add(files.employee.includes('only place where an employee face can be registered or replaced'),'face registration is explicitly Employee-Portal only');
add(files.employee.includes('Admin controls access'),'employee face UI states Admin-controlled access');
add(files.employee.includes('No location permission')||files.employee.includes('never asks for location permission'),'face registration explicitly excludes location');
add(files.employee.includes('faceSampleProgress')&&files.employee.includes('faceQualityState')&&files.employee.includes('faceProfileState'),'employee face capture shows sample/quality/profile state');
add(files.employeeJs.includes("call('setFaceCaptureAccess'")===false,'employee cannot grant itself capture access');
add(files.employeeJs.includes("call('getMyFaceRegistrationStatus'"),'employee polls server-side face capture access');
add(files.employeeJs.includes("call('registerMyFace'"),'employee face capture saves through authenticated API');
add(files.employeeJs.includes('detectAllFaces')&&files.employeeJs.includes('5 / 5'),'face capture uses five-frame quality sampling');
add(files.employeeJs.includes('maxDistance>.50'),'face capture validates descriptor consistency');
add(files.employeeJs.includes('Camera permission is blocked'),'camera permission errors are translated into actionable messages');
add(files.employeeJs.includes('getUserMedia({video:true'),'camera uses fallback constraints for laptop compatibility');
add(files.employeeJs.includes('FACE_LIBRARY_URLS')&&files.employeeJs.includes('FACE_MODEL_URLS'),'face engine/model CDN fallback paths configured');
add(files.employeeJs.includes('sampleCount:5')&&files.employeeJs.includes('quality,'),'face registration sends sample/quality metadata');
add(files.employeeJs.includes('captureAllowed:false'),'successful capture locally returns access to OFF');
add(files.attendanceJs.includes('Face registration itself is managed only inside the Employee Portal'),'attendance link does not act as enrollment flow');
add(!files.attendanceJs.includes("r.linkType==='ENROLL'"),'attendance UI contains no active enrollment-link branch');
add(files.attendanceJs.includes('detectAllFaces'),'attendance face verification uses robust multi-frame detector');
add(files.attendanceJs.includes('navigator.geolocation'),'attendance still enforces office location');
add(files.employee.includes('Complete My Shift')&&files.employeeJs.includes('checkoutMyAttendance'),'8-hour checkout remains available');
add(files.admin.includes('id="employeeDialog" class="app-modal"')&&!files.admin.includes('<dialog id="employeeDialog"'),'employee add/edit remains custom modal');
add(files.admin.includes('id="cancelEmployeeBtn"')&&files.adminJs.includes("closeModal('employeeDialog')"),'employee Cancel/X controls remain wired');
add(files.adminJs.includes("setInlineMessage('employeeFormMessage'"),'employee validation errors remain inside modal');
add(files.admin.includes('id="accessDialog" class="app-modal"')&&files.adminJs.includes("call('deleteAccessUser'"),'staff access add/delete controls remain');
add(files.adminJs.includes('cfg.PRIMARY_ADMIN_EMAIL'),'primary administrator protection remains');
add(files.admin.includes('Mail Health')&&files.adminJs.includes("call('sendTestEmail'"),'mail diagnostics and test email remain');
add(files.admin.includes('Application Run Descriptions')&&files.adminJs.includes("call('listSystemRuns'"),'backend run descriptions remain visible');
add(files.config.includes("VERSION: '21.0.0'")&&files.config.includes("BACKEND_VERSION: '21.0.0'"),'frontend targets V21 backend');
add(files.config.includes("SESSION_KEY: 'incentify_ems_v21_session'"),'V21 session namespace isolated');
add(files.api.includes('__incentify_ems_v21_cb_'),'V21 JSONP callback namespace configured');
add(files.api.includes("'setFaceCaptureAccess'")&&files.api.includes("'registerMyFace'"),'face control/capture mutations are replay-safe');
add(files.api.includes('requestReplayStatus')&&files.api.includes('_probeMutation'),'lost mutation response probes persisted backend replay');
add(files.api.includes("action === 'submitAttendanceLinkFace' || action === 'registerMyFace'"),'face operations use extended transport window');
add(files.sw.includes('incentify-ems-v21-shell-2')&&files.sw.includes("url.searchParams.get('v')==='21.0.0'"),'V21 PWA cache isolates stale V20 assets');
add(files.workflow.includes('Deploy INCENTIFY EMS V21')&&files.workflow.includes('verify-v21.mjs'),'GitHub Pages workflow verifies V21');
add(files.deploy.includes('$attempt -le 3')&&files.deploy.includes('RECOVERED_TRANSIENTS'),'live deployment test recovers transient Apps Script failures');
const deployGit=read('scripts/deploy-v21-to-git.ps1');
add(deployGit.includes('Amoghchowdary/INCENTIFY_EMS.git')&&deployGit.includes('git pull --ff-only origin main'),'deployment script synchronizes renamed Git repository before Robocopy');
add(!/\bprompt\(|\balert\(|\bconfirm\(/.test(files.adminJs+files.employeeJs),'blocking browser prompt/alert/confirm calls absent');
add(files.css.includes('.face-guide-oval')&&files.css.includes('.face-quality-grid'),'clean guided face-capture UI styles exist');
const failed=checks.filter(x=>!x.ok);
for(const c of checks)console.log(`${c.ok?'PASS':'FAIL'}: ${c.n}`);
if(failed.length){console.error(`\n${failed.length} frontend verification check(s) failed.`);process.exit(1)}
console.log(`\nV21 frontend verification passed: ${checks.length} checks.`);
