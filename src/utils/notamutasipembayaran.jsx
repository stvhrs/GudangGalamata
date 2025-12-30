import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- KONSTANTA FONT ---
const FONT_NORMAL_URL = '/fonts/arialnarrow.ttf';
const FONT_BOLD_URL = '/fonts/arialnarrow_bold.ttf';

const companyInfo = {
    nama: "CV. GANGSAR MULIA UTAMA",
    hp: "0882-0069-05391"
};

const formatNumber = (value) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0 }).format(value || 0);
const formatDate = (timestamp) => new Date(timestamp || 0).toLocaleDateString('id-ID', { 
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute:'2-digit' 
});

const loadFont = async (path) => {
    try {
        const res = await fetch(path);
        if (!res.ok) throw new Error("Font missing");
        const blob = await res.blob();
        return new Promise((r) => {
            const reader = new FileReader();
            reader.onload = () => r(reader.result.split(',')[1]);
            reader.readAsDataURL(blob);
        });
    } catch { return null; }
};

/**
 * GENERATE NOTA PEMBAYARAN PDF (ASYNC)
 */
const buildDoc = async (payment, allocations) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Load Font
    const fontNormal = await loadFont(FONT_NORMAL_URL);
    const fontBold = await loadFont(FONT_BOLD_URL);
    let fontName = 'helvetica';
    if (fontNormal && fontBold) {
        doc.addFileToVFS('ArialNarrow.ttf', fontNormal);
        doc.addFont('ArialNarrow.ttf', 'ArialNarrow', 'normal');
        doc.addFileToVFS('ArialNarrow-Bold.ttf', fontBold);
        doc.addFont('ArialNarrow-Bold.ttf', 'ArialNarrow', 'bold');
        fontName = 'ArialNarrow';
    }

    const margin = { top: 10, right: 10, bottom: 5, left: 10 };
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let currentY = margin.top;

    // Header
    doc.setFontSize(18); doc.setFont(fontName, 'bold');
    doc.text(companyInfo.nama, margin.left, currentY);
    doc.setFontSize(11); 
    doc.text("NOTA PEMBAYARAN", pageWidth - margin.right, currentY, { align: 'right' });
    currentY += 2; 
    doc.setLineWidth(0.2); doc.line(margin.left, currentY, pageWidth - margin.right, currentY);
    currentY += 8; 

    // Info
    const idDokumen = payment.id || '-';
    const namaPelanggan = payment.namaCustomer || 'Umum';
    const infoX = pageWidth / 2 + 10;
    
    doc.setFontSize(9.5); 
    doc.setFont(fontName, 'bold'); doc.text('No. Bayar:', margin.left, currentY);
    doc.setFont(fontName, 'normal'); doc.text(idDokumen, margin.left + 30, currentY);
    currentY += 5;
    doc.setFont(fontName, 'bold'); doc.text('Customer:', margin.left, currentY);
    doc.setFont(fontName, 'normal'); doc.text(namaPelanggan, margin.left + 30, currentY);
    currentY += 5;

    const rightY = currentY - 10;
    doc.setFont(fontName, 'bold'); doc.text('Tanggal:', infoX, rightY);
    doc.setFont(fontName, 'normal'); doc.text(formatDate(payment.tanggal), infoX + 25, rightY);
    currentY += 5; 

    // Table
    const head = [['No', 'No. Invoice', 'Keterangan', 'Jumlah Bayar']];
    let body = [];
    let calculatedTotal = 0;

    if (allocations && Array.isArray(allocations) && allocations.length > 0) {
        body = allocations.map((item, i) => {
            const amount = Number(item.amount || 0);
            calculatedTotal += amount;
            return [ i + 1, item.invoiceId || '-', payment.keterangan || '-', formatNumber(amount) ];
        });
    } else {
        const total = Number(payment.totalBayar || 0);
        calculatedTotal = total;
        body = [['1', '-', payment.keterangan || '-', formatNumber(total)]];
    }

    autoTable(doc, {
        startY: currentY,
        head: head,
        body: body,
        theme: 'grid',
        headStyles: {
            fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.1,
            halign: 'center', fontSize: 9, font: fontName, fontStyle: 'bold', cellPadding: 1.5,
        },
        styles: {
            font: fontName, lineColor: [0, 0, 0], lineWidth: 0.1, fontSize: 9, cellPadding: 1.5,
            valign: 'middle', textColor: [0, 0, 0]
        },
        columnStyles: { 
            0: { halign: 'center', cellWidth: 12 }, 
            1: { cellWidth: 50 }, 
            3: { halign: 'right', cellWidth: 40 } 
        },
        margin: { left: margin.left, right: margin.right },
    });

    // Summary
    currentY = doc.lastAutoTable.finalY + 5;
    const checkPageOverflow = (y, increment = 10) => { 
        if (y + increment > pageHeight - margin.bottom) { doc.addPage(); return margin.top + 5; } return y;
    };
    currentY = checkPageOverflow(currentY, 20);
    const finalTotal = Number(payment.totalBayar) || calculatedTotal;
    const totalColValueX = pageWidth - margin.right; 
    const totalColLabelX = totalColValueX - 50;

    doc.setFontSize(9);
    doc.setFont(fontName, 'bold');
    doc.text('Total Pembayaran:', totalColLabelX, currentY);
    doc.text(formatNumber(finalTotal), totalColValueX, currentY, { align: 'right' });

    // TTD
    let signY = currentY + 15;
    signY = checkPageOverflow(signY, 40);
    const leftSignX = margin.left + 25; 
    const rightSignX = pageWidth - margin.right - 25; 

    doc.setFontSize(9);
    doc.setFont(fontName, 'normal');
    doc.text("Hormat Kami,", leftSignX, signY, { align: 'center' });
    doc.text("Penerima,", rightSignX, signY, { align: 'center' });
    const nameY = signY + 25;
    doc.setFont(fontName, 'bold');
    doc.text("(________________)", leftSignX, nameY, { align: 'center' });
    doc.text(`( ${payment.namaCustomer || '....................'} )`, rightSignX, nameY, { align: 'center' });

    return doc;
};

// EXPORT ASYNC
export const generateNotaPembayaranPDF = async (payment, allocations) => {
    const doc = await buildDoc(payment, allocations);
    return doc.output('bloburl');
};