(function () {
  'use strict';
  const ui = Object.fromEntries(['file-input','drop-zone','file-info','file-name','file-meta','remove-file','replace-file','blank-option','pad-blank','blank-explanation','error-message','file-status','preview-empty','preview-content','source-count','result-count','source-sequence','result-sequence','full-sequence','full-sequence-text','download-button','download-label','download-note'].map(id => [id,document.getElementById(id)]));
  let current = null;
  let busy = false;
  let dragDepth = 0;
  const liveUrls = new Set();
  function formatBytes(size) {
    if (size < 1024) return `${size} B`;
    if (size < 1024*1024) return `${(size/1024).toFixed(1)} KB`;
    return `${(size/1024/1024).toFixed(1)} MB`;
  }
  function showError(message) { ui['error-message'].textContent=message; ui['error-message'].hidden=!message; }
  function setBusy(value,message='') {
    busy=value;
    for (const name of ['drop-zone','remove-file','replace-file','pad-blank','file-input']) ui[name].disabled=value;
    ui['download-button'].disabled=value||!current;
    ui['file-status'].textContent=message;
    document.querySelector('.workbench').setAttribute('aria-busy',String(value));
  }
  function renderSequence(container,sequence,title) {
    container.replaceChildren();
    const entries=sequence.length>12
      ? [...sequence.slice(0,8).map((page,index)=>({page,index})),{ellipsis:true},...sequence.slice(-3).map((page,index)=>({page,index:sequence.length-3+index}))]
      : sequence.map((page,index)=>({page,index}));
    for (const item of entries) {
      const tile=document.createElement('div');
      tile.setAttribute('role','listitem');
      if (item.ellipsis) {
        tile.className='page-tile ellipsis'; tile.textContent='…';
        tile.setAttribute('aria-label','中间页码已省略，下方可查看全部页码');
      } else {
        const even=item.page===null||item.page%2===0;
        tile.className=`page-tile${even?' even':''}${item.page===null?' blank':''}`;
        tile.textContent=item.page===null?'空白':String(item.page);
        tile.setAttribute('aria-label',`${title}第 ${item.index+1} 页：${item.page===null?'新增空白页':`原第 ${item.page} 页`}`);
        tile.title=tile.getAttribute('aria-label');
      }
      container.append(tile);
    }
  }
  function renderPreview() {
    ui['preview-empty'].hidden=Boolean(current);
    ui['preview-content'].hidden=!current;
    ui['download-label'].textContent='下载 PDF';
    ui['download-note'].textContent='原文件不变';
    ui['download-note'].classList.remove('success');
    if (!current) {
      ui['source-sequence'].replaceChildren();
      ui['result-sequence'].replaceChildren();
      ui['source-count'].textContent='';
      ui['result-count'].textContent='';
      ui['full-sequence-text'].textContent='';
      ui['full-sequence'].hidden=true;
      return;
    }
    const count=current.count;
    const pad=Boolean(current&&ui['pad-blank'].checked&&count%2===1);
    const order=globalThis.DuplexPDF.makePageOrder(count,pad);
    const source=Array.from({length:count},(_,index)=>index+1);
    if (pad) source.push(null);
    renderSequence(ui['source-sequence'],source,'重排前');
    renderSequence(ui['result-sequence'],order,'处理后');
    ui['source-count'].textContent=pad?`${count} 页 + 1 空白页`:`${count} 页`;
    ui['result-count'].textContent=`${order.length} 页`;
    ui['full-sequence'].hidden=order.length<=12;
    ui['full-sequence-text'].textContent=order.map(page=>page??'空白').join('，');
    ui['blank-explanation'].textContent=pad?`${count} → ${order.length} 页，空白位于第 2 页。`:'';
  }
  function renderFile() {
    const loaded=Boolean(current);
    ui['drop-zone'].hidden=loaded; ui['file-info'].hidden=!loaded;
    ui['replace-file'].hidden=!loaded;
    ui['blank-option'].hidden=!loaded||current.count%2===0;
    if (loaded) {
      ui['file-name'].textContent=current.name; ui['file-name'].title=current.name;
      ui['file-meta'].textContent=`${current.count} 页 · ${formatBytes(current.bytes.byteLength)}`;
    }
    renderPreview();
  }
  async function loadFile(file) {
    if (busy||!file) return;
    showError(''); setBusy(true,'正在读取 PDF，请稍候…');
    try {
      if (!globalThis.PDFLib) throw new Error('LIBRARY_UNAVAILABLE');
      if (file.size===0) throw new Error('EMPTY_FILE');
      const bytes=new Uint8Array(await file.arrayBuffer());
      const header=new TextDecoder('latin1').decode(bytes.subarray(0,1024));
      if (!header.includes('%PDF-')) throw new Error('NOT_PDF');
      const doc=await globalThis.PDFLib.PDFDocument.load(bytes,{updateMetadata:false,throwOnInvalidObject:true});
      const count=doc.getPageCount();
      if (count<1) throw new Error('NO_PAGES');
      current={name:file.name,bytes,count};
      ui['pad-blank'].checked=false; ui['full-sequence'].open=false;
      renderFile(); setBusy(false);
    } catch (error) {
      const code=error.message||'';
      let message='无法读取这份 PDF，文件可能损坏。请用 PDF 阅读器重新导出后再试。';
      if (error.name==='EncryptedPDFError'||/encrypted/i.test(code)) message='这份 PDF 已加密。请先用有权限的 PDF 阅读器解锁并导出副本，再选择新文件。';
      if (code==='EMPTY_FILE') message='文件为空。请选择有内容的 PDF。';
      if (code==='NOT_PDF') message='这不是有效的 PDF 文件。请先将文件导出为 PDF，再试一次。';
      if (code==='NO_PAGES') message='这份 PDF 没有页面。请选择至少有一页的 PDF。';
      if (code==='LIBRARY_UNAVAILABLE') message='PDF 处理组件未加载。请刷新网页；离线使用时请保留 vendor 文件夹。';
      showError(message); setBusy(false);
    } finally { ui['file-input'].value=''; }
  }
  async function downloadPdf() {
    if (!current||busy) return;
    const selected=current;
    const pad=ui['pad-blank'].checked&&selected.count%2===1;
    showError(''); setBusy(true,'正在生成新 PDF，请稍候…');
    ui['download-label'].textContent='正在生成 PDF…';
    ui['download-note'].textContent='文件较大时，生成可能需要更长时间';
    try {
      await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
      const result=await globalThis.DuplexPDF.reorderPdf(selected.bytes,pad);
      const blob=new Blob([result.bytes],{type:'application/pdf'});
      const url=URL.createObjectURL(blob); liveUrls.add(url);
      const link=document.createElement('a'); link.href=url;
      link.download=globalThis.DuplexPDF.outputFilename(selected.name,pad);
      document.body.append(link); link.click(); link.remove();
      setTimeout(()=>{ URL.revokeObjectURL(url); liveUrls.delete(url); },60000);
      ui['download-note'].textContent=`${result.outputCount} 页 PDF 已开始下载`;
      ui['download-note'].classList.add('success'); ui['download-label'].textContent='再次下载 PDF';
      setBusy(false);
    } catch (error) {
      showError('生成 PDF 失败。请尝试用 PDF 阅读器重新导出文件后再处理。');
      ui['download-label'].textContent='重新生成 PDF'; ui['download-note'].textContent='未生成文件，原文件不受影响'; setBusy(false);
    }
  }
  ui['drop-zone'].addEventListener('click',()=>ui['file-input'].click());
  ui['replace-file'].addEventListener('click',()=>ui['file-input'].click());
  ui['file-input'].addEventListener('change',event=>loadFile(event.target.files[0]));
  ui['download-button'].addEventListener('click',downloadPdf);
  ui['pad-blank'].addEventListener('change',renderPreview);
  ui['remove-file'].addEventListener('click',()=>{
    current=null; ui['pad-blank'].checked=false; ui['full-sequence'].open=false;
    showError(''); setBusy(false); renderFile(); ui['drop-zone'].focus();
  });
  document.addEventListener('dragenter',event=>{
    if (!Array.from(event.dataTransfer?.types||[]).includes('Files')) return;
    event.preventDefault(); dragDepth+=1;
    if (!busy) ui['drop-zone'].classList.add('is-dragging');
  });
  document.addEventListener('dragover',event=>{ if (Array.from(event.dataTransfer?.types||[]).includes('Files')) event.preventDefault(); });
  document.addEventListener('dragleave',()=>{ dragDepth=Math.max(0,dragDepth-1); if (!dragDepth) ui['drop-zone'].classList.remove('is-dragging'); });
  document.addEventListener('drop',event=>{
    if (!Array.from(event.dataTransfer?.types||[]).includes('Files')) return;
    event.preventDefault(); dragDepth=0; ui['drop-zone'].classList.remove('is-dragging');
    if (busy) return;
    const files=event.dataTransfer.files;
    if (files.length>1) { showError('每次处理一份 PDF。请只拖入一个文件。'); return; }
    loadFile(files[0]);
  });
  window.addEventListener('pagehide',()=>{ for (const url of liveUrls) URL.revokeObjectURL(url); liveUrls.clear(); });
  renderFile();
})();
