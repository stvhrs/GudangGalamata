import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- CONFIG ---
const companyInfo = {
    nama: "CV. GANGSAR MULIA UTAMA",
    // Alamat dihapus sesuai request
    hp: "0882-0069-05391"
};

// --- HELPER ---
const formatNumber = (value) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0 }).format(value || 0);

const formatDate = (timestamp) => new Date(timestamp || 0).toLocaleDateString('id-ID', { 
    day: '2-digit', month: 'long', year: 'numeric', 
    hour: '2-digit', minute:'2-digit' 
});

/**
 * GENERATE NOTA RETUR PDF (A4 PORTRAIT)
 * @param {Object} returData - Data Header (dari path 'returns')
 * @param {Array} returItems - Data Detail (dari path 'return_items')
 */
const buildDoc = (returData, returItems) => {
    
    // 1. SETUP KERTAS (A4 PORTRAIT)
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4' 
    });

    const margin = { top: 10, right: 10, bottom: 5, left: 10 };
    const pageWidth = doc.internal.pageSize.getWidth();
    let currentY = margin.top;

    // Font: Helvetica (Standar PDF)
    const fontName = 'helvetica';

    // --- 1. HEADER ---
    doc.setFontSize(18); 
    doc.setFont(fontName, 'bold');
    doc.text(companyInfo.nama, margin.left, currentY);
    
    doc.setFontSize(11); 
    doc.text("NOTA RETUR", pageWidth - margin.right, currentY, { align: 'right' });
    
    currentY += 2; 

    // Garis Header
    doc.setLineWidth(0.2); 
    doc.setDrawColor(0, 0, 0);
    doc.line(margin.left, currentY, pageWidth - margin.right, currentY);
    currentY += 8; 

    // --- 2. INFO TRANSAKSI ---
    const idDokumen = returData.id || '-';
    const refInvoice = returData.invoiceId || '-';
    // Logic: Ambil nama dari field namaCustomer, jika kosong coba parsing dari keterangan (opsional)
    const namaPelanggan = returData.namaCustomer || 'Umum';
    
    const infoX = pageWidth / 2 + 10;
    
    doc.setFontSize(9.5); 
    
    // -- KIRI --
    doc.setFont(fontName, 'bold'); doc.text('No. Retur:', margin.left, currentY);
    doc.setFont(fontName, 'normal'); doc.text(idDokumen, margin.left + 30, currentY);
    currentY += 5;
    
    doc.setFont(fontName, 'bold'); doc.text('Pelanggan:', margin.left, currentY);
    doc.setFont(fontName, 'normal'); doc.text(namaPelanggan, margin.left + 30, currentY);
    currentY += 5;

    // -- KANAN --
    const rightY = currentY - 10;
    doc.setFont(fontName, 'bold'); doc.text('Tanggal:', infoX, rightY);
    doc.setFont(fontName, 'normal'); doc.text(formatDate(returData.tanggal), infoX + 25, rightY);
    
    const rightY2 = rightY + 5;
    doc.setFont(fontName, 'bold'); doc.text('Ref. Invoice:', infoX, rightY2);
    doc.setFont(fontName, 'normal'); doc.text(refInvoice, infoX + 25, rightY2);

    currentY += 5; 

    // --- 3. TABEL ITEM (return_items) ---
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
            
            return [
                i + 1,
                judul,
                formatNumber(qty),
                formatNumber(harga),
                formatNumber(subtotal)                   
            ];
        });
    } else {
        // Fallback jika tidak ada detail item
        const total = Number(returData.totalRetur || 0);
        calculatedTotal = total;
        body = [['1', 'Retur Manual (Tanpa Detail)', '-', '-', formatNumber(total)]];
    }

    // --- RENDER TABEL ---
    autoTable(doc, {
        startY: currentY,
        head: head,
        body: body,
        theme: 'grid',
        headStyles: {
            fillColor: [255, 255, 255], 
            textColor: [0, 0, 0],       
            lineColor: [0, 0, 0],       
            lineWidth: 0.2,
            halign: 'center',
            fontSize: 9,
            font: fontName,
            fontStyle: 'bold',
            cellPadding: 1.5,
        },
        styles: {
            font: fontName,
            lineColor: [0, 0, 0],
            lineWidth: 0.2,
            fontSize: 9,
            cellPadding: 1.5,
            valign: 'middle',
            textColor: [0, 0, 0]
        },
        columnStyles: { 
            0: { halign: 'center', cellWidth: 10 }, 
            1: { cellWidth: 'auto' }, // Judul Auto
            2: { halign: 'center', cellWidth: 15 }, 
            3: { halign: 'right', cellWidth: 35 }, 
            4: { halign: 'right', cellWidth: 40 } 
        },
        margin: { left: margin.left, right: margin.right },
    });

    // --- 4. SUMMARY FOOTER ---
    currentY = doc.lastAutoTable.finalY + 5;
    
    // Gunakan totalRetur dari header jika ada
    const finalTotal = Number(returData.totalRetur) || calculatedTotal;

    const totalColValueX = pageWidth - margin.right; 
    const totalColLabelX = totalColValueX - 50;

    doc.setFontSize(9);
    doc.setFont(fontName, 'bold');
    doc.text('Total Retur:', totalColLabelX, currentY);
    doc.text(formatNumber(finalTotal), totalColValueX, currentY, { align: 'right' });

    // Keterangan Footer (Opsional)
    if (returData.keterangan) {
        currentY += 8;
        doc.setFont(fontName, 'normal');
        doc.setFontSize(8);
        doc.text(`Keterangan: ${returData.keterangan}`, margin.left, currentY);
    }

    return doc;
};

// Export Function
export const generateNotaReturPDF = (returData, returItems) => 
    buildDoc(returData, returItems).output('datauristring');