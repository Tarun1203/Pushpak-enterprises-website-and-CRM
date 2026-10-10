const brands={
 makwell:{name:'MakWell',tag:'MAKE IT HAPPEN',logo:'../assets/logos/makwell-logo.jpeg',color:'#7b3fa1'},
 flyvision:{name:'Flyvision',tag:'PRECISION IN MOTION',logo:'../assets/logos/flyvision-logo.jpeg',color:'#e5262c'},
 skevia:{name:'Skevia',tag:'A NEW AWAKENING',logo:'../assets/logos/skevia-logo.jpeg',color:'#1c7dc0'}
};
const defaults=[
 ['Display / Panel','Covered','1 Year'],['Main Board','Covered','1 Year'],['Power Board','Covered','1 Year'],['Speaker','Covered','1 Year'],['Remote','Covered','1 Year']
];
const $=id=>document.getElementById(id);
let rows=[...defaults];
function esc(v){return String(v??'').replace(/[&<>\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\\':'&bsol;','"':'&quot;'}[m]));}
function renderInputs(){
 $('coverageInputs').innerHTML=rows.map((r,i)=>`<div class="coverage-row"><input data-i="${i}" data-k="0" value="${esc(r[0])}" aria-label="Component"><input data-i="${i}" data-k="1" value="${esc(r[1])}" aria-label="Coverage"><input data-i="${i}" data-k="2" value="${esc(r[2])}" aria-label="Period"><button type="button" data-remove="${i}" aria-label="Remove row">×</button></div>`).join('');
 $('coverageInputs').querySelectorAll('input').forEach(el=>el.addEventListener('input',e=>{rows[+e.target.dataset.i][+e.target.dataset.k]=e.target.value;render();}));
 $('coverageInputs').querySelectorAll('[data-remove]').forEach(el=>el.addEventListener('click',()=>{rows.splice(+el.dataset.remove,1);renderInputs();render();}));
}
function qrUrl(token){return `https://quickchart.io/qr?size=180&margin=1&text=${encodeURIComponent(location.origin+location.pathname.replace(/index\.html$/,'verify.html')+'?token='+token)}`;}
function getToken(){let token=localStorage.getItem('pushpakWarrantyQrToken');if(!token){token=crypto.randomUUID().replaceAll('-','');localStorage.setItem('pushpakWarrantyQrToken',token)}return token;}
function render(){
 const key=$('brandSelect').value,b=brands[key];
 $('brandLogo').src=b.logo;$('brandLogoBack').src=b.logo;$('brandTagline').textContent=b.tag;$('brandOut').textContent=b.name;$('brandNoOut');
 $('cardNoOut').textContent=$('cardNo').value;$('customerNameOut').textContent=$('customerName').value;$('mobileOut').textContent=$('mobile').value;$('addressOut').textContent=$('address').value;$('categoryOut').textContent=$('category').value;$('productOut').textContent=$('product').value;$('modelOut').textContent=$('model').value;$('serialOut').textContent=$('serial').value;$('purchaseOut').textContent=formatDate($('purchaseDate').value);$('dealerOut').textContent=$('dealer').value;$('planOut').textContent=$('warrantyPlan').value;$('validOut').textContent=formatDate($('validUntil').value);$('termsOut').textContent=$('terms').value;
 $('coverageTable').innerHTML=rows.map(r=>`<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('');
 const token=getToken();const qr=qrUrl(token);$('qrImage').src=qr;$('qrImageBack').src=qr;
 document.documentElement.style.setProperty('--w-purple',b.color);
}
function formatDate(v){if(!v)return '—';const d=new Date(v+'T00:00:00');return d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});}
$('brandSelect').addEventListener('change',render);$('addRow').addEventListener('click',()=>{rows.push(['New Component','Covered','1 Year']);renderInputs();render();});$('printBtn').addEventListener('click',()=>window.print());
['cardNo','customerName','mobile','address','category','product','model','serial','purchaseDate','validUntil','dealer','warrantyPlan','terms'].forEach(id=>$(id).addEventListener('input',render));
renderInputs();render();