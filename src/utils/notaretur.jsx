import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- KONSTANTA FONT ---
const FONT_NORMAL_URL = '/fonts/arialnarrow.ttf';
const FONT_BOLD_URL = '/fonts/arialnarrow_bold.ttf';

const companyInfo = {
    nama: "CV. GANGSAR MULIA UTAMA",
    hp: "0882-0069-05391"
};

// --- HELPER ---
const formatNumber = (value) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0 }).format(value || 0);

const formatDate = (timestamp) => new Date(timestamp || 0).toLocaleDateString('id-ID', { 
    day: '2-digit', month: 'long', year: 'numeric', 
    hour: '2-digit', minute:'2-digit' 
});

const loadFont = async (path) => {
    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error("File not found");
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn("Font fallback to Helvetica", e);
        return null;
    }
};

/**
 * GENERATE NOTA RETUR PDF (ASYNC)
 */
const buildDoc = async (returData, returItems) => {
    
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // --- LOAD FONT ---
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

    // --- 1. HEADER ---
    doc.setFontSize(18); 
    doc.setFont(fontName, 'bold');
    doc.text(companyInfo.nama, margin.left, currentY);
    
    doc.setFontSize(11); 
    doc.text("NOTA RETUR", pageWidth - margin.right, currentY, { align: 'right' });
    
    currentY += 2; 

    doc.setLineWidth(0.2); 
    doc.setDrawColor(0, 0, 0);
    doc.line(margin.left, currentY, pageWidth - margin.right, currentY);
    currentY += 8; 

    // --- 2. INFO TRANSAKSI ---
    const idDokumen = returData.id || '-';
    const refInvoice = returData.invoiceId || '-';
    const namaPelanggan = returData.namaCustomer || 'Umum';
    const infoX = pageWidth / 2 + 10;
    
    doc.setFontSize(9.5); 
    
    doc.setFont(fontName, 'bold'); doc.text('No. Retur:', margin.left, currentY);
    doc.setFont(fontName, 'normal'); doc.text(idDokumen, margin.left + 30, currentY);
    currentY += 5;
    
    doc.setFont(fontName, 'bold'); doc.text('Customer:', margin.left, currentY);
    doc.setFont(fontName, 'normal'); doc.text(namaPelanggan, margin.left + 30, currentY);
    currentY += 5;

    const rightY = currentY - 10;
    doc.setFont(fontName, 'bold'); doc.text('Tanggal:', infoX, rightY);
    doc.setFont(fontName, 'normal'); doc.text(formatDate(returData.tanggal), infoX + 25, rightY);
    
    const rightY2 = rightY + 5;
    doc.setFont(fontName, 'bold'); doc.text('Ref. Invoice:', infoX, rightY2);
    doc.setFont(fontName, 'normal'); doc.text(refInvoice, infoX + 25, rightY2);

    currentY += 5; 

    // --- 3. TABEL ITEM ---
    const head = [['No', 'Judul Buku', 'Qty', 'Harga', 'Subtotal']];
    let body = [];
    let calculatedTotal = 0;

    if (returItems && Array.isArray(returItems) && returItems.length > 0) {
        body = returItems.map((item, i) => {
            const judul = item.judul || '-';
            const qty = Number(item.qty || 0);
            const harga = Number(item.harga || 0);
            const subtotal = Number(item.subtotal || (qty * harga));
            calculatedTotal += subtotal;
            return [ i + 1, judul, formatNumber(qty), formatNumber(harga), formatNumber(subtotal) ];
        });
    } else {
        const total = Number(returData.totalRetur || 0);
        calculatedTotal = total;
        body = [['1', 'Retur Manual', '-', '-', formatNumber(total)]];
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
            0: { halign: 'center', cellWidth: 10 }, 
            1: { cellWidth: 'auto' }, 
            2: { halign: 'center', cellWidth: 15 }, 
            3: { halign: 'right', cellWidth: 35 }, 
            4: { halign: 'right', cellWidth: 40 } 
        },
        margin: { left: margin.left, right: margin.right },
    });

    // --- 4. SUMMARY ---
    currentY = doc.lastAutoTable.finalY + 6;
    const valRetur = Number(returData.totalRetur) || 0;
    const valDiskon = Number(returData.totalDiskon) || 0;
    let valBruto = Number(returData.totalBruto) || (valRetur + valDiskon);

    const checkPageOverflow = (y, increment = 10) => { 
        if (y + increment > pageHeight - margin.bottom) {
             doc.addPage(); return margin.top + 5; 
        } return y;
    };
    currentY = checkPageOverflow(currentY, 30);

    const totalColValueX = pageWidth - margin.right; 
    const totalColLabelX = totalColValueX - 50;
    doc.setFontSize(9);

    doc.setFont(fontName, 'bold'); doc.text('Total Harga:', totalColLabelX, currentY);
    doc.setFont(fontName, 'normal'); doc.text(formatNumber(valBruto), totalColValueX, currentY, { align: 'right' });
    currentY += 5;

    if (valDiskon > 0) {
        doc.setFont(fontName, 'bold'); doc.text('Potongan:', totalColLabelX, currentY);
        doc.setFont(fontName, 'normal'); doc.text(`(${formatNumber(valDiskon)})`, totalColValueX, currentY, { align: 'right' });
        currentY += 5;
    }

    doc.setLineWidth(0.1);
    doc.line(totalColLabelX, currentY - 1, totalColValueX, currentY - 1);
    currentY += 3;

    doc.setFontSize(10);
    doc.setFont(fontName, 'bold'); doc.text('Total Retur:', totalColLabelX, currentY);
    doc.text(formatNumber(valRetur), totalColValueX, currentY, { align: 'right' });

    if (returData.keterangan) {
        currentY += 10;
        currentY = checkPageOverflow(currentY, 10);
        doc.setFont(fontName, 'normal'); doc.setFontSize(8);
        doc.text(`Keterangan: ${returData.keterangan}`, margin.left, currentY);
    }

    // --- 5. TTD ---
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
    doc.text(`( ${returData.namaCustomer || '....................'} )`, rightSignX, nameY, { align: 'center' });

    return doc;
};

// EXPORT ASYNC (Returns Blob URL)
export const generateNotaReturPDF = async (returData, returItems) => {
    const doc = await buildDoc(returData, returItems);
    return doc.output('bloburl');
};