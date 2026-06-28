/* تطبيق مراجعة المكملين - يعمل بالكامل داخل المتصفح */
const state = {
  rows: [],
  filteredRows: [],
  sourceName: '',
  globalExcludedMaterials: new Set(),
  studentClasses: {},
  hasClasses: false
};

const SUBJECTS = [
  'القرآن الكريم والدراسات الإسلامية', 'اللغة العربية', 'اللغة الإنجليزية', 'الرياضيات', 'العلوم',
  'الدراسات الاجتماعية', 'التفكير الناقد', 'التربية الفنية', 'التربية البدنية والدفاع عن النفس',
  'المهارات الرقمية', 'المهارات الحياتية والأسرية', 'النشاط', 'المواظبة', 'السلوك'
];

const els = {
  fileInput: document.getElementById('fileInput'),
  dropZone: document.getElementById('dropZone'),
  studentsInput: document.getElementById('studentsInput'),
  studentsDropZone: document.getElementById('studentsDropZone'),
  studentsStatus: document.getElementById('studentsStatus'),
  clearStudentsBtn: document.getElementById('clearStudentsBtn'),
  classTh: document.getElementById('classTh'),
  fileHint: document.getElementById('fileHint'),
  statusText: document.getElementById('statusText'),
  messageBox: document.getElementById('messageBox'),
  tableBody: document.getElementById('tableBody'),
  searchInput: document.getElementById('searchInput'),
  subjectFilter: document.getElementById('subjectFilter'),
  countFilter: document.getElementById('countFilter'),
  groupByClassLabel: document.getElementById('groupByClassLabel'),
  groupByClassCheckbox: document.getElementById('groupByClassCheckbox'),
  globalExclusionsList: document.getElementById('globalExclusionsList'),
  printBtn: document.getElementById('printBtn'),
  exportCsvBtn: document.getElementById('exportCsvBtn'),
  exportJsonBtn: document.getElementById('exportJsonBtn'),
  clearBtn: document.getElementById('clearBtn'),
  statTotal: document.getElementById('statTotal'),
  statSubjects: document.getElementById('statSubjects'),
};

const metaIds = ['Office','School','Title','Grade','Year','Round','Director','PreparedBy'];

init();

function init(){
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  loadMeta();
  loadStudentClasses();
  
  els.fileInput.addEventListener('change', e => handleFiles(e.target.files));
  ['dragenter','dragover'].forEach(evt => els.dropZone.addEventListener(evt, e => { e.preventDefault(); els.dropZone.classList.add('dragover'); }));
  ['dragleave','drop'].forEach(evt => els.dropZone.addEventListener(evt, e => { e.preventDefault(); els.dropZone.classList.remove('dragover'); }));
  els.dropZone.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
  
  els.studentsInput.addEventListener('change', e => handleStudentFiles(e.target.files));
  ['dragenter','dragover'].forEach(evt => els.studentsDropZone.addEventListener(evt, e => { e.preventDefault(); els.studentsDropZone.classList.add('dragover'); }));
  ['dragleave','drop'].forEach(evt => els.studentsDropZone.addEventListener(evt, e => { e.preventDefault(); els.studentsDropZone.classList.remove('dragover'); }));
  els.studentsDropZone.addEventListener('drop', e => handleStudentFiles(e.dataTransfer.files));
  els.clearStudentsBtn.addEventListener('click', clearStudentClasses);
  
  els.searchInput.addEventListener('input', applyFilters);
  els.subjectFilter.addEventListener('change', applyFilters);
  els.countFilter.addEventListener('change', applyFilters);
  if(els.groupByClassCheckbox) {
    els.groupByClassCheckbox.addEventListener('change', (e) => {
      state.groupByClass = e.target.checked;
      renderTable();
    });
  }
  els.printBtn.addEventListener('click', () => { syncPrintMeta(); window.print(); });
  els.exportCsvBtn.addEventListener('click', exportCsv);
  els.exportJsonBtn.addEventListener('click', exportJson);
  els.clearBtn.addEventListener('click', clearData);
  metaIds.forEach(id => {
    document.getElementById('meta' + id).addEventListener('input', () => {
      saveMeta();
      syncPrintMeta();
    });
  });
  syncPrintMeta();
  render();
}

function saveMeta(){
  const meta = {};
  metaIds.forEach(id => {
    if(id !== 'Grade') meta[id] = document.getElementById('meta' + id).value;
  });
  localStorage.setItem('mukamileenMetaCache', JSON.stringify(meta));
}

function loadMeta(){
  try {
    const meta = JSON.parse(localStorage.getItem('mukamileenMetaCache') || '{}');
    metaIds.forEach(id => {
      if(id !== 'Grade' && meta[id] !== undefined) {
        document.getElementById('meta' + id).value = meta[id];
      }
    });
  } catch(e) { }
}

function loadStudentClasses(){
  try {
    state.studentClasses = JSON.parse(localStorage.getItem('mukamileenStudentClasses') || '{}');
  } catch(e) { state.studentClasses = {}; }
  updateClassUI();
}

function clearStudentClasses(){
  state.studentClasses = {};
  localStorage.removeItem('mukamileenStudentClasses');
  updateClassUI();
  render();
}

function updateClassUI(){
  const keys = Object.keys(state.studentClasses);
  let idCount = 0;
  let nameCount = 0;
  keys.forEach(k => {
    if(/^[0-9]+$/.test(k)) idCount++;
    else nameCount++;
  });
  const count = Math.max(idCount, nameCount);
  
  state.hasClasses = count > 0;
  
  if(state.hasClasses){
    els.studentsStatus.textContent = `تم حفظ بيانات ${count} طالب/ة (عمود الفصل ظاهر)`;
    els.studentsStatus.style.color = '#047857';
    els.clearStudentsBtn.style.display = 'inline-block';
    els.classTh.style.display = 'table-cell';
    if(els.groupByClassLabel) els.groupByClassLabel.style.display = 'flex';
  } else {
    els.studentsStatus.textContent = 'لا يوجد بيانات للطلاب (عمود الفصل مخفي)';
    els.studentsStatus.style.color = '#b42318';
    els.clearStudentsBtn.style.display = 'none';
    els.classTh.style.display = 'none';
    if(els.groupByClassLabel) els.groupByClassLabel.style.display = 'none';
    state.groupByClass = false;
    if(els.groupByClassCheckbox) els.groupByClassCheckbox.checked = false;
  }
  
  document.querySelectorAll('.dynamic-colspan').forEach(el => {
    el.colSpan = state.hasClasses ? 7 : 6;
  });
}

async function handleStudentFiles(files){
  if(!files || !files.length) return;
  setStatus('جاري قراءة ملفات الطلاب...');
  showMessage('', true);
  try {
    if(!window.XLSX) throw new Error('مكتبة Excel غير متوفرة.');
    let addedCount = 0;
    
    for(const file of Array.from(files)){
      const ext = file.name.split('.').pop().toLowerCase();
      if(!['xlsx','xls'].includes(ext)) throw new Error('يرجى رفع ملف Excel فقط لبيانات الطلاب.');
      
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type:'array', cellDates:false });
      const sheetName = workbook.SheetNames.includes('Sheet2') ? 'Sheet2' : workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header:1, defval:'', raw:false });
      
      let headerRow = -1;
      let idCol = -1, nameCol = -1, classCol = -1;
      
      for(let r=0; r<Math.min(data.length, 10); r++){
        const rowText = data[r].join(' ').replace(/\s+/g,'');
        if(rowText.includes('رقمالطالب') || rowText.includes('رقمالهوية') || rowText.includes('اسمالطالب')){
          headerRow = r;
          data[r].forEach((v, c) => {
            const s = String(v).replace(/\s+/g,'');
            if(s.includes('رقمالطالب') || s.includes('رقمالهوية')) idCol = c;
            if(s.includes('اسمالطالب') || s.includes('الاسم')) nameCol = c;
            if(s.includes('الفصل')) {
              classCol = c;
            } else if (s.includes('الصف') && classCol === -1) {
              classCol = c;
            }
          });
          break;
        }
      }
      
      if(headerRow === -1 || classCol === -1 || (idCol === -1 && nameCol === -1)){
        throw new Error(`لم نتمكن من التعرف على أعمدة (رقم الطالب، الاسم، الفصل) في الملف ${file.name}. تأكد أنه ملف صحيح.`);
      }
      
      for(let r=headerRow+1; r<data.length; r++){
        const row = data[r];
        if(!row) continue;
        const id = normalizeText(row[idCol]);
        const name = normalizeText(row[nameCol]);
        const className = normalizeText(row[classCol]);
        if(className && (id || name)){
          if(id) state.studentClasses[id] = className;
          if(name) state.studentClasses[name] = className;
          addedCount++;
        }
      }
    }
    
    localStorage.setItem('mukamileenStudentClasses', JSON.stringify(state.studentClasses));
    updateClassUI();
    render();
    setStatus('مكتمل');
    showMessage(`تم تحديث بيانات الطلاب وإضافة الفصول بنجاح.`, false, 'success');
  } catch(err){
    console.error(err);
    setStatus('خطأ في ملف الطلاب');
    showMessage(err.message, false, 'error');
  }
}

async function handleFiles(files){
  if(!files || !files.length) return;
  const fileArray = Array.from(files);
  state.sourceName = fileArray.map(f => f.name).join(', ');
  setStatus('جاري قراءة الملفات...');
  showMessage('', true);
  try{
    let allRows = [];
    for(const file of fileArray){
      const ext = file.name.split('.').pop().toLowerCase();
      let rows = [];
      if(['xlsx','xls'].includes(ext)) rows = await parseExcel(file);
      else if(ext === 'pdf') rows = await parsePdf(file);
      else throw new Error(`صيغة الملف ${file.name} غير مدعومة. استخدم Excel أو PDF.`);
      allRows.push(...rows);
    }
    if(!allRows.length){
      throw new Error('لم يتم العثور على طلاب في الملفات.');
    }
    state.rows = dedupeRows(allRows).map((r, i) => ({ ...r, serial:i+1, excludedMaterials: [] }));
    populateFilters();
    applyFilters();
    setStatus(`تم استخراج ${state.rows.length} طالب`);
    showMessage(`تمت المعالجة بنجاح من ${fileArray.length} ملف`, false, 'success');
  }catch(err){
    console.error(err);
    setStatus('تعذر استخراج البيانات');
    showMessage(err.message || 'حدث خطأ غير متوقع أثناء قراءة الملفات.', false, 'error');
  }
}

async function parseExcel(file){
  if(!window.XLSX) throw new Error('مكتبة قراءة Excel لم تُحمّل. تأكد من اتصال الإنترنت ثم أعد فتح الصفحة.');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type:'array', cellDates:false });
  const sheetName = workbook.SheetNames.includes('Sheet2') ? 'Sheet2' : (workbook.SheetNames[1] || workbook.SheetNames[0]);
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header:1, defval:'', raw:false });
  const resultCol = detectResultColumn(data);
  const headerMap = detectSubjectHeaderMap(data);
  const infoCells = detectStudentInfoCells(data);
  const rows = [];
  infoCells.forEach(({r,c,value}, idx) => {
    const id = extractId(value);
    const name = extractName(value);
    if(!name) return;
    const studentStartRow = findStudentStartRow(data, r, resultCol);
    const near = collectColumnValues(data, resultCol, Math.max(0,studentStartRow-1), Math.min(data.length-1,studentStartRow+12));
    const result = findResult(near) || findNearbyResult(data, studentStartRow) || '';
    const count = extractCompletionCount(result);
    let materials = normalizeMaterials(findExcelMaterials(data, resultCol, studentStartRow, count));
    if(count && countMaterials(materials) < Number(count)){
      const inferred = inferMaterialsFromScores(data, headerMap, studentStartRow, count);
      materials = mergeMaterials(materials, inferred, count);
    }
    const finalCount = count || countMaterials(materials);
    rows.push({
      serial: idx+1,
      nationalId: id,
      name,
      result: result || (finalCount ? `مكمل في عدد (${finalCount}) مادة` : ''),
      completionCount: finalCount,
      materials,
      source: `${sheetName}`,
      page: ''
    });
  });
  return rows;
}

function detectResultColumn(data){
  for(let r=0; r<Math.min(data.length,60); r++){
    for(let c=0; c<(data[r] || []).length; c++){
      if(String(data[r][c]).includes('النتيجة')) return c;
    }
  }
  // احتياط: ابحث عن العمود الذي تتكرر فيه عبارة مكمل
  const scores = new Map();
  data.forEach(row => row.forEach((v,c) => {
    if(/مكمل|ناجح|راسب|مواد الإكمال|مواد الاكمال/.test(String(v))) scores.set(c, (scores.get(c)||0)+1);
  }));
  return [...scores.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0] ?? 0;
}

function detectStudentInfoCells(data){
  const cells = [];
  data.forEach((row,r) => row.forEach((v,c) => {
    const s = String(v || '');
    if(/رقم\s*الهوية/.test(s) && /الاسم/.test(s)) cells.push({r,c,value:s});
  }));
  // احتياط: لو كان الاسم والهوية في خلايا منفصلة
  if(!cells.length){
    data.forEach((row,r)=>row.forEach((v,c)=>{
      const s = String(v||'');
      if(/الاسم/.test(s) && r>0){
        const block = [data[r-2]?.[c],data[r-1]?.[c],data[r]?.[c],data[r+1]?.[c],data[r+2]?.[c]].filter(Boolean).join('\n');
        if(/رقم\s*الهوية/.test(block)) cells.push({r,c,value:block});
      }
    }));
  }
  return cells;
}

function collectColumnValues(data, col, start, end){
  const vals = [];
  for(let r=start; r<=end; r++) vals.push(String(data[r]?.[col] || '').trim());
  return vals.filter(Boolean);
}
function findResult(values){ return values.find(v => /مكمل|ناجح|راسب|متجاوز|غائب|منقطع/.test(v) && !/مواد/.test(v)) || ''; }
function findNearbyResult(data, rowIndex){
  for(let r=Math.max(0,rowIndex-3); r<Math.min(data.length,rowIndex+8); r++){
    for(const v of data[r]) if(/مكمل|ناجح|راسب/.test(String(v))) return String(v).trim();
  }
  return '';
}
function findMaterials(values){
  const hit = values.find(v => /مواد\s*(الإكمال|الاكمال)/.test(v));
  return hit ? hit.replace(/.*مواد\s*(?:الإكمال|الاكمال)\s*[:：]?/,'').trim() : '';
}

function findStudentStartRow(data, infoRow, resultCol){
  for(let r=infoRow; r>=Math.max(0, infoRow-15); r--){
    if(/مكمل|ناجح|راسب/.test(String(data[r]?.[resultCol] || ''))) return r;
  }
  for(let r=infoRow; r<Math.min(data.length, infoRow+6); r++){
    if(/مكمل|ناجح|راسب/.test(String(data[r]?.[resultCol] || ''))) return r;
  }
  return infoRow;
}

function findExcelMaterials(data, resultCol, rowIndex, expectedCount){
  const found = [];
  let collecting = false;
  const maxRows = Math.min(data.length, rowIndex + 14);
  for(let r=rowIndex; r<maxRows; r++){
    const raw = String(data[r]?.[resultCol] || '').trim();
    if(!raw) {
      if(collecting && found.length) break;
      continue;
    }
    if(r !== rowIndex && /مكمل\s+في\s+عدد|رقم\s*الهوية|الاسم/.test(raw)) break;
    if(/مواد\s*(الإكمال|الاكمال)/.test(raw)){
      collecting = true;
      addUniqueMaterials(found, raw.replace(/.*مواد\s*(?:الإكمال|الاكمال)\s*[:：]?/,'').trim());
    } else if(collecting) {
      if(isExcelMaterialStopLine(raw)) break;
      addUniqueMaterials(found, raw);
    }
    if(expectedCount && found.length >= Number(expectedCount)) break;
  }
  return found.join('، ');
}

function isExcelMaterialStopLine(value){
  const s = normalizeText(value);
  return !s || /^(اختبارات|أدوات|ادوات|نهاية|مراجعة|مجموع|المجموع|الموزونة)/.test(s) || /^\d+(?:\.\d+)?$/.test(s);
}

function addUniqueMaterials(target, text){
  extractSubjectNames(text).forEach(subject => {
    if(subject && !target.includes(subject)) target.push(subject);
  });
}

function extractSubjectNames(text){
  const clean = normalizeMaterials(text);
  if(!clean) return [];
  const matched = SUBJECTS.filter(sub => {
    const pattern = sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g,'\\s+');
    return new RegExp(pattern).test(clean);
  });
  if(matched.length) return matched;
  return clean.split(/[،,؛\n]+/).map(s=>normalizeText(s)).filter(Boolean);
}

function mergeMaterials(primary, secondary, expectedCount){
  const list = [];
  addUniqueMaterials(list, primary);
  addUniqueMaterials(list, secondary);
  return list.slice(0, Number(expectedCount) || list.length).join('، ');
}

function detectSubjectHeaderMap(data){
  const map = [];
  const maxRows = Math.min(data.length, 80);
  for(let r=0; r<maxRows; r++){
    const row = data[r] || [];
    row.forEach((v,c) => {
      const subject = extractSubjectNames(String(v || ''))[0];
      if(subject && !['المواظبة','السلوك'].includes(subject)) map.push({ subject, col:c, row:r });
    });
  }
  const unique = new Map();
  map.forEach(item => { if(!unique.has(item.col)) unique.set(item.col, item); });
  return [...unique.values()];
}

function inferMaterialsFromScores(data, headerMap, rowIndex, expectedCount){
  if(!headerMap.length || !expectedCount) return '';
  const finalRow = findFinalScoreRow(data, rowIndex);
  const weightedRow = finalRow >= 0 ? finalRow + 1 : -1;
  const candidates = [];
  headerMap.forEach(({subject,col}) => {
    const finalScore = toNumber(data[finalRow]?.[col]);
    const weighted = toNumber(data[weightedRow]?.[col]);
    // لا نعتمد عليه إلا كدعم احتياطي عندما تكون خلية المواد ناقصة.
    if(Number.isFinite(finalScore) && finalScore < 60) candidates.push({ subject, score: finalScore });
    else if(Number.isFinite(weighted) && weighted < 300) candidates.push({ subject, score: weighted / 5 });
  });
  return candidates
    .sort((a,b)=>a.score-b.score)
    .slice(0, Number(expectedCount))
    .map(x=>x.subject)
    .join('، ');
}

function findFinalScoreRow(data, rowIndex){
  for(let r=rowIndex; r<Math.min(data.length, rowIndex+16); r++){
    const rowText = (data[r] || []).map(v=>String(v||'')).join(' ');
    if(/المجموع\s+النهائي/.test(rowText)) return r;
  }
  return -1;
}

function toNumber(value){
  const n = Number(String(value ?? '').replace(/[^0-9.\-]/g,''));
  return Number.isFinite(n) ? n : NaN;
}

async function parsePdf(file){
  if(!window.pdfjsLib) throw new Error('مكتبة قراءة PDF لم تُحمّل. تأكد من اتصال الإنترنت ثم أعد فتح الصفحة.');
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  if(pdf.numPages < 3) throw new Error('ملف PDF يجب أن يحتوي أكثر من صفحتين حتى يتم تجاهل الأولى والأخيرة.');
  const rows = [];
  for(let pageNo=2; pageNo<=pdf.numPages-1; pageNo++){
    setStatus(`جاري قراءة PDF: صفحة ${pageNo} من ${pdf.numPages}`);
    const page = await pdf.getPage(pageNo);
    const textContent = await page.getTextContent();
    const decodedText = buildPageText(textContent.items);
    rows.push(...extractRowsFromPdfText(decodedText, pageNo));
  }
  return rows;
}

function buildPageText(items){
  const lines = new Map();
  items.forEach(item => {
    const raw = item.str || '';
    if(!raw.trim()) return;
    const x = item.transform?.[4] ?? 0;
    const y = item.transform?.[5] ?? 0;
    const key = Math.round(y / 3) * 3;
    if(!lines.has(key)) lines.set(key, []);
    lines.get(key).push({x, text: decodeNoorGlyphs(raw)});
  });
  return [...lines.entries()]
    .sort((a,b)=>b[0]-a[0])
    .map(([,parts]) => parts.sort((a,b)=>b.x-a.x).map(p=>p.text).join(' '))
    .join('\n')
    .replace(/االسم/g,'الاسم')
    .replace(/اإكمال/g,'الإكمال')
    .replace(/اإسالمية/g,'الإسلامية')
    .replace(/اإنجليزية/g,'الإنجليزية')
    .replace(/اأسرية/g,'الأسرية');
}

function extractRowsFromPdfText(text, pageNo){
  const clean = text.replace(/[\u0000-\u001f]+/g,' ').replace(/االسم/g,'الاسم');
  const blocks = clean.split(/(?=مكمل\s+في\s+عدد)/g).filter(b => /^مكمل\s+في\s+عدد/.test(b.trim()));
  const rows = [];
  blocks.forEach((block, index) => {
    const compact = block.replace(/[ \t]+/g,' ');
    const idBlock = compact.match(/رقم\s*الهوية\s*[:：]?\s*([0-9\s]{6,25})\s*الاسم/);
    const nameBlock = compact.match(/الاسم\s*[:：]?\s*([\s\S]*?)\s*مواد\s*(?:الإكمال|الاكمال)/);
    if(!nameBlock) return;
    const nationalId = idBlock ? idBlock[1].replace(/\s+/g,'') : '';
    const name = normalizeText(nameBlock[1].replace(/[0-9]/g,' '));
    if(!name || name.length < 3) return;
    const count = extractCompletionCount(compact) || '';
    const materials = extractPdfMaterials(compact, count);
    rows.push({
      serial: 0,
      nationalId,
      name,
      result: count ? `مكمل في عدد (${count}) مادة` : 'مكمل',
      completionCount: count,
      materials,
      source: 'PDF',
      page: pageNo
    });
  });
  return rows;
}

function extractPdfMaterials(block, expectedCount){
  const start = block.search(/مواد\s*(?:الإكمال|الاكمال)/);
  if(start < 0) return '';
  const zone = block.slice(start, Math.min(block.length, start + 900));
  const found = [];
  SUBJECTS.forEach(sub => {
    const pattern = sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g,'\\s+');
    if(new RegExp(pattern).test(zone)) found.push(sub);
  });
  if(found.length) return found.slice(0, Number(expectedCount) || found.length).join('، ');
  const m = zone.match(/مواد\s*(?:الإكمال|الاكمال)\s*[:：]?\s*([\s\S]*?)(?=\n?\s*\d+(?:\.\d+)?\s|اختبارات|ادوات|نهاية|مجموع|$)/);
  return m ? normalizeMaterials(m[1]) : '';
}

const NOOR_GLYPH_MAP = {
  '\u0381':'آ','΁':'آ','΃':'أ','Ϸ':'أ','Ϲ':'إ','΋':'ئ',
  '\u038d':'ا','΍':'ا','Ύ':'ا','Α':'ب','Ώ':'ب','Γ':'ة','Δ':'ة','Ε':'ت','Η':'ت','Ι':'ث','Λ':'ث','Ο':'ج','Ν':'ج',
  'Ρ':'ح','Σ':'ح','΢':'ح','Χ':'خ','Φ':'خ','Ω':'د','έ':'ر','ί':'ز','γ':'س','α':'س','η':'ش','ε':'ش',
  'λ':'ص','ο':'ض','ν':'ع','ρ':'ط','υ':'ظ','ό':'ع','ϋ':'ع','ω':'ع','ௌ':'ع','ύ':'غ','ϐ':'غ',
  'ϓ':'ف','ϔ':'ف','ϑ':'ف','ϗ':'ق','Ϙ':'ق','ϛ':'ك','ϙ':'ك','ϝ':'ل','ϟ':'ل','Ϡ':'ل','ϡ':'م','ϣ':'م',
  'ϥ':'ن','ϧ':'ن','ϩ':'ه','Ϫ':'ه','ϫ':'ه','Ϭ':'ه','ϭ':'و','ϰ':'ى','ϱ':'ى','ϲ':'ي','ϳ':'ي','ϊ':'ي',
  'ϼ':'لا','ϻ':'لا'
};

function decodeNoorGlyphs(str){
  let out = '';
  let token = '';
  const flush = () => {
    if(token){ out += [...token].reverse().join(''); token = ''; }
  };
  for(const ch of str){
    if(Object.prototype.hasOwnProperty.call(NOOR_GLYPH_MAP, ch)) token += NOOR_GLYPH_MAP[ch];
    else if(ch.charCodeAt(0) > 127 && /[\u0370-\u03ff\u0bcc]/.test(ch)) token += ch;
    else { flush(); out += ch; }
  }
  flush();
  return out;
}

function extractId(text){
  const m = String(text).match(/رقم\s*الهوية\s*[:：]?\s*([0-9]+)/);
  return m ? m[1].trim() : '';
}
function extractName(text){
  const m = String(text).match(/الاسم\s*[:：]?\s*([\s\S]+)/);
  return m ? normalizeText(m[1]) : '';
}
function extractCompletionCount(text){
  const s = String(text || '');
  const m1 = s.match(/\((\d+)\)/);
  if(m1) return m1[1];
  const m2 = s.match(/مكمل\s+في\s+عدد[\s\S]{0,30}?(\d+)/);
  return m2 ? m2[1] : '';
}
function countMaterials(materials){
  const clean = normalizeMaterials(materials);
  return clean ? String(clean.split(/[،,؛\n]+/).filter(Boolean).length) : '';
}
function normalizeText(v){ return String(v || '').replace(/[:：]/g,' ').replace(/\s+/g,' ').trim(); }
function normalizeMaterials(v){
  return normalizeText(v)
    .replace(/^مواد\s*(?:الإكمال|الاكمال)\s*/,'')
    .replace(/\s*،\s*/g,'، ')
    .replace(/\s*,\s*/g,'، ')
    .replace(/\s+/g,' ')
    .trim();
}

function dedupeRows(rows){
  const seen = new Set();
  const out = [];
  rows.forEach(row => {
    const key = (row.nationalId || row.name).trim();
    if(!key || seen.has(key)) return;
    seen.add(key);
    out.push(row);
  });
  return out;
}



function populateFilters(){
  const subjects = new Set();
  const counts = new Set();
  state.rows.forEach(r => {
    if(r.completionCount) counts.add(r.completionCount);
    normalizeMaterials(r.materials).split(/[،,؛\n]+/).map(s=>s.trim()).filter(Boolean).forEach(s=>subjects.add(s));
  });
  els.subjectFilter.innerHTML = '<option value="">كل المواد</option>' + [...subjects].sort().map(s => `<option>${escapeHtml(s)}</option>`).join('');
  els.countFilter.innerHTML = '<option value="">كل الأعداد</option>' + [...counts].sort((a,b)=>Number(a)-Number(b)).map(c => `<option value="${c}">${c} مادة</option>`).join('');
  
  const globalExclusionsPanel = document.getElementById('globalExclusionsPanel');
  const globalExclusionsList = document.getElementById('globalExclusionsList');
  if(globalExclusionsPanel && globalExclusionsList){
    globalExclusionsList.innerHTML = [...subjects].sort().map(s => `
      <label><input type="checkbox" value="${escapeAttr(s)}" onchange="toggleGlobalMaterial(this)" ${state.globalExcludedMaterials.has(s) ? 'checked' : ''}> ${escapeHtml(s)}</label>
    `).join('');
    globalExclusionsPanel.hidden = subjects.size === 0;
  }
}
window.toggleGlobalMaterial = function(checkbox){
  if(checkbox.checked) state.globalExcludedMaterials.add(checkbox.value);
  else state.globalExcludedMaterials.delete(checkbox.value);
  applyFilters();
};

function applyFilters(){
  const q = normalizeText(els.searchInput.value).toLowerCase();
  const subj = els.subjectFilter.value;
  const count = els.countFilter.value;
  state.filteredRows = state.rows.filter(r => {
    const materialsList = normalizeMaterials(r.materials).split(/[،,؛\n]+/).map(s=>s.trim()).filter(Boolean);
    let displayedCount = parseInt(r.completionCount) || 0;
    if(materialsList.length > 0) {
      const activeMaterials = materialsList.filter(m => !state.globalExcludedMaterials.has(m) && !(r.excludedMaterials || []).includes(m));
      displayedCount = activeMaterials.length;
      if(displayedCount === 0) return false;
    }
    const subjMatch = !subj || materialsList.some(m => m.includes(subj) && !state.globalExcludedMaterials.has(m) && !(r.excludedMaterials || []).includes(m));
    const countMatch = !count || String(displayedCount) === String(count);
    
    const haystack = [r.name,r.nationalId,r.result,r.materials,r.source].join(' ').toLowerCase();
    return (!q || haystack.includes(q)) && subjMatch && countMatch;
  });
  render();
}

function render(){
  renderStats();
  renderTable();
  const hasRows = state.rows.length > 0;
  [els.printBtn, els.exportCsvBtn, els.exportJsonBtn, els.clearBtn].forEach(btn => btn.disabled = !hasRows);
}
function renderStats(){
  const subjectSet = new Set();
  state.filteredRows.forEach(r => {
    const mList = normalizeMaterials(r.materials).split(/[،,؛\n]+/).map(s=>s.trim()).filter(Boolean);
    mList.forEach(m => { if(!state.globalExcludedMaterials.has(m) && !(r.excludedMaterials || []).includes(m)) subjectSet.add(m); });
  });
  els.statTotal.textContent = state.filteredRows.length;
  els.statSubjects.textContent = subjectSet.size;
}
function renderTable(){
  const rows = state.rows.length ? state.filteredRows : [];
  if(!rows.length){
    els.tableBody.innerHTML = `<tr class="empty-row"><td colspan="${state.hasClasses ? 7 : 6}">${state.rows.length ? 'لا توجد نتائج حسب الفلاتر الحالية (أو تم استبعاد مواد كل الطلاب).' : 'ارفع ملف Excel أو PDF لبدء المراجعة.'}</td></tr>`;
    return;
  }
  
  const subjectFilterValue = els.subjectFilter.value;
  
  const generateRowHtml = (r, serial, cName) => {
    const materialsList = normalizeMaterials(r.materials).split(/[،,؛\n]+/).map(s=>s.trim()).filter(Boolean);
    let displayedCount = parseInt(r.completionCount) || 0;
    let materialsHtml = '';
    if(materialsList.length > 0) {
      const activeMaterials = materialsList.filter(m => !state.globalExcludedMaterials.has(m));
      displayedCount = activeMaterials.filter(m => !(r.excludedMaterials || []).includes(m)).length;
      
      let renderMaterials = activeMaterials;
      if (subjectFilterValue) {
        renderMaterials = activeMaterials.filter(m => m.includes(subjectFilterValue));
      }
      
      materialsHtml = renderMaterials.map(m => {
        const isExcluded = (r.excludedMaterials || []).includes(m);
        return `<label class="${isExcluded ? 'excluded-material' : ''}"><input type="checkbox" onchange="toggleMaterial(${r.serial}, '${escapeAttr(m)}')" ${isExcluded ? '' : 'checked'}> ${escapeHtml(m)}</label>`;
      }).join('');
    }
    const classTd = state.hasClasses ? `<td>${escapeHtml(cName)}</td>` : '';
    return `
    <tr data-serial="${r.serial}">
      <td>${serial}</td>
      <td>${escapeHtml(r.nationalId || '')}</td>
      <td class="w-name">${escapeHtml(r.name || '')}</td>
      ${classTd}
      <td><span class="badge">${escapeHtml(r.result || '')}</span></td>
      <td>${displayedCount}</td>
      <td class="w-subjects"><div class="materials-list">${materialsHtml}</div></td>
    </tr>`;
  };

  if(state.groupByClass && state.hasClasses) {
    const grouped = {};
    rows.forEach(r => {
      const cName = state.studentClasses[r.nationalId] || state.studentClasses[r.name] || 'غير محدد';
      if(!grouped[cName]) grouped[cName] = [];
      grouped[cName].push(r);
    });
    
    const sortedClasses = Object.keys(grouped).sort();
    let html = '';
    
    sortedClasses.forEach((cName, idx) => {
      const pageBreak = idx > 0 ? 'page-break-before: always;' : '';
      html += `
        <tr style="${pageBreak} background: #f1f5f9; font-weight: bold; border-top: 2px solid #cbd5e1; border-bottom: 2px solid #cbd5e1;">
          <td colspan="${state.hasClasses ? 7 : 6}" style="text-align: right; padding: 12px 16px; font-size: 15px; color: #0f172a;">
            الفصل: ${escapeHtml(cName)}
          </td>
        </tr>
      `;
      let localSerial = 1;
      html += grouped[cName].map(r => generateRowHtml(r, localSerial++, cName)).join('');
    });
    els.tableBody.innerHTML = html;
  } else {
    els.tableBody.innerHTML = rows.map((r, idx) => {
      const cName = state.hasClasses ? (state.studentClasses[r.nationalId] || state.studentClasses[r.name] || '-') : '';
      return generateRowHtml(r, idx + 1, cName);
    }).join('');
  }
  
  const printFilterNote = document.getElementById('printFilterNote');
  const filterNoteSubject = document.getElementById('filterNoteSubject');
  if(subjectFilterValue && printFilterNote && filterNoteSubject) {
    printFilterNote.style.display = 'block';
    filterNoteSubject.textContent = subjectFilterValue;
  } else if (printFilterNote) {
    printFilterNote.style.display = 'none';
  }
}
window.toggleMaterial = function(serial, materialName){
  const row = state.rows.find(r => r.serial === serial);
  if(!row) return;
  row.excludedMaterials = row.excludedMaterials || [];
  if(row.excludedMaterials.includes(materialName)){
    row.excludedMaterials = row.excludedMaterials.filter(m => m !== materialName);
  } else {
    row.excludedMaterials.push(materialName);
  }
  applyFilters();
};

function syncPrintMeta(){
  const today = new Date().toLocaleDateString('ar-SA-u-ca-islamic', { day:'2-digit', month:'2-digit', year:'numeric' });
  document.getElementById('printOffice').textContent = document.getElementById('metaOffice').value || '';
  document.getElementById('printSchool').textContent = document.getElementById('metaSchool').value || '';
  document.getElementById('printTitle').textContent = document.getElementById('metaTitle').value || 'كشف مراجعة الطلاب المكملين';
  document.getElementById('printGrade').textContent = document.getElementById('metaGrade').value || '';
  document.getElementById('printYear').textContent = document.getElementById('metaYear').value || '';
  document.getElementById('printRound').textContent = document.getElementById('metaRound').value || '';
  document.getElementById('printDirector').textContent = document.getElementById('metaDirector').value || '....................';
  document.getElementById('printPreparedBy').textContent = document.getElementById('metaPreparedBy').value || '....................';
  document.getElementById('printDate').textContent = today;
}

function exportCsv(){
  const rows = state.filteredRows.length ? state.filteredRows : state.rows;
  const header = ['م','رقم الهوية','اسم الطالب'];
  if(state.hasClasses) header.push('الفصل');
  header.push('النتيجة','عدد المواد','مواد الإكمال');
  
  const lines = [header, ...rows.map((r,i)=>{
    const materialsList = normalizeMaterials(r.materials).split(/[،,؛\n]+/).map(s=>s.trim()).filter(Boolean);
    let displayedCount = parseInt(r.completionCount) || 0;
    let activeMaterials = '';
    if(materialsList.length > 0) {
      const activeList = materialsList.filter(m => !state.globalExcludedMaterials.has(m) && !(r.excludedMaterials || []).includes(m));
      displayedCount = activeList.length;
      activeMaterials = activeList.join('، ');
    }
    
    const rowData = [i+1, r.nationalId, r.name];
    if(state.hasClasses) rowData.push(state.studentClasses[r.nationalId] || state.studentClasses[r.name] || '-');
    rowData.push(r.result, displayedCount, activeMaterials);
    
    return rowData;
  })].map(cols => cols.map(csvCell).join(','));
  
  downloadFile('\ufeff' + lines.join('\n'), 'mukamileen-review.csv', 'text/csv;charset=utf-8');
}
function exportJson(){
  const rows = state.filteredRows.length ? state.filteredRows : state.rows;
  downloadFile(JSON.stringify(rows, null, 2), 'mukamileen-review.json', 'application/json;charset=utf-8');
}
function csvCell(v){ return `"${String(v ?? '').replace(/"/g,'""')}"`; }
function downloadFile(content, filename, type){
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  a.remove(); URL.revokeObjectURL(url);
}
function clearData(){
  state.rows = []; state.filteredRows = []; state.sourceName = '';
  document.getElementById('metaGrade').value = ''; // clear grade always
  metaIds.forEach(id => {
    if(id !== 'Grade') document.getElementById('meta' + id).value = ''; // clear everything else in UI
  });
  localStorage.removeItem('mukamileenMetaCache'); // Clear local storage cache
  syncPrintMeta();
  populateFilters(); render(); setStatus('جاهز لاستقبال الملفات'); showMessage('', true);
}
function setStatus(text){ els.statusText.textContent = text; }
function showMessage(text, hidden=false, type='info'){
  els.messageBox.hidden = hidden || !text;
  els.messageBox.textContent = text || '';
  els.messageBox.style.background = type === 'error' ? '#fff1f0' : type === 'success' ? '#ecfdf5' : '#fffbeb';
  els.messageBox.style.color = type === 'error' ? '#b42318' : type === 'success' ? '#047857' : '#92400e';
  els.messageBox.style.borderColor = type === 'error' ? '#fecdd3' : type === 'success' ? '#a7f3d0' : '#fde68a';
}
function escapeHtml(v){ return String(v ?? '').replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s])); }
function escapeAttr(v){ return escapeHtml(v).replace(/'/g,'&#39;'); }
