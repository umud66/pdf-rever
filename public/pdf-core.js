(function (root) {
  'use strict';
  // One-based source page numbers; null represents an appended blank page.
  function makePageOrder(pageCount, padBlank = false) {
    if (!Number.isSafeInteger(pageCount) || pageCount < 1) throw new RangeError('PDF 至少需要一页。');
    const total = pageCount + (padBlank && pageCount % 2 === 1 ? 1 : 0);
    const order = [];
    for (let position = 1; position <= total; position += 1) {
      const source = position % 2 === 1 ? position : 2 * Math.floor(total / 2) - position + 2;
      order.push(source > pageCount ? null : source);
    }
    return order;
  }
  // Reuse original page objects to retain document-level resources and fields.
  async function reorderPdf(bytes, padBlank = false) {
    const { PDFDocument } = root.PDFLib;
    const doc = await PDFDocument.load(bytes, { updateMetadata:false, throwOnInvalidObject:true });
    const originalCount = doc.getPageCount();
    const order = makePageOrder(originalCount, padBlank);
    const pages = doc.getPages();
    let blankPage;
    if (order.includes(null)) {
      const last = pages[pages.length - 1];
      blankPage = doc.addPage([last.getWidth(), last.getHeight()]);
      const media = last.getMediaBox();
      const crop = last.getCropBox();
      blankPage.setMediaBox(media.x, media.y, media.width, media.height);
      blankPage.setCropBox(crop.x, crop.y, crop.width, crop.height);
      blankPage.setRotation(last.getRotation());
    }
    for (let index = doc.getPageCount() - 1; index >= 0; index -= 1) doc.removePage(index);
    for (const source of order) doc.addPage(source === null ? blankPage : pages[source - 1]);
    return { bytes:await doc.save(), order, originalCount, outputCount:order.length };
  }
  function outputFilename(name, padBlank = false) {
    const stem = name.replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_') || 'document';
    return `${stem}_偶数页倒序${padBlank ? '_补空白' : ''}.pdf`;
  }
  root.DuplexPDF = Object.freeze({ makePageOrder, reorderPdf, outputFilename });
})(globalThis);
