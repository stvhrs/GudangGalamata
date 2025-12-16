import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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

/**
 * GENERATE PDF A4 PORTRAIT
 * @param {Object} payment - Data Header (payments)
 * @param {Array} allocations - Data Isi Tabel (payment_allocations)
 */
const buildDoc = (payment, allocations) => {
    
    // 1. SETUP KERTAS (A4 PORTRAIT)
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4' 
    });

    const margin = { top: 10, right: 10, bottom: 5, left: 10 };
    const pageWidth = doc.internal.pageSize.getWidth();
    let currentY = margin.top;

    // Font: Helvetica (Standar PDF untuk pengganti Arial/Arial Narrow)
    const fontName = 'helvetica';

    // --- 1. HEADER ---
    doc.setFontSize(18); 
    doc.setFont(fontName, 'bold');
    doc.text(companyInfo.nama, margin.left, currentY);
    
    doc.setFontSize(11); 
    doc.text("NOTA PEMBAYARAN", pageWidth - margin.right, currentY, { align: 'right' });
    
    currentY += 2; 

    doc.setLineWidth(0.2); 
    doc.setDrawColor(0, 0, 0);
    doc.line(margin.left, currentY, pageWidth - margin.right, currentY);
    currentY += 8; 

    // --- 2. INFO TRANSAKSI ---
    const idDokumen = payment.id || '-';
    const namaPelanggan = payment.namaCustomer || 'Umum';
    const infoX = pageWidth / 2 + 10;
    
    doc.setFontSize(9.5); 
    
    // Kiri
    doc.setFont(fontName, 'bold'); doc.text('No. Bayar:', margin.left, currentY);
    doc.setFont(fontName, 'normal'); doc.text(idDokumen, margin.left + 30, currentY);
    currentY += 5;
    
    // Kiri baris 2
    doc.setFont(fontName, 'bold'); doc.text('Customer:', margin.left, currentY);
    doc.setFont(fontName, 'normal'); doc.text(namaPelanggan, margin.left + 30, currentY);
    currentY += 5;

    // Kanan
    const rightY = currentY - 10;
    doc.setFont(fontName, 'bold'); doc.text('Tanggal:', infoX, rightY);
    doc.setFont(fontName, 'normal'); doc.text(formatDate(payment.tanggal), infoX + 25, rightY);
    
    // if (payment.sumber) {
    //     doc.setFont(fontName, 'bold'); doc.text('Metode:', infoX, rightY + 5);
    //     doc.setFont(fontName, 'normal'); doc.text(payment.sumber, infoX + 25, rightY + 5);
    // }

    currentY += 5; 

    // --- 3. TABEL ITEM (payment_allocations) ---
    const head = [['No', 'No. Invoice', 'Keterangan', 'Jumlah Bayar']];
    let body = [];
    let calculatedTotal = 0;

    if (allocations && Array.isArray(allocations) && allocations.length > 0) {
        body = allocations.map((item, i) => {
            const amount = Number(item.amount || 0);
            calculatedTotal += amount;
            
            // Keterangan diambil dari header payment karena di allocation tidak ada field keterangan
            const noteToShow = payment.keterangan || '-';

            return [
                i + 1,
                item.invoiceId || '-',  // Sesuai field: invoiceId
                noteToShow,                             
                formatNumber(amount)    // Sesuai field: amount                   
            ];
        });
    } else {
        // Fallback jika kosong
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
            0: { halign: 'center', cellWidth: 12 }, 
            1: { cellWidth: 50 }, 
            2: { }, 
            3: { halign: 'right', cellWidth: 40 } 
        },
        margin: { left: margin.left, right: margin.right },
    });

    // --- 4. SUMMARY FOOTER ---
    currentY = doc.lastAutoTable.finalY + 5;
    
    // Prioritaskan totalBayar dari header, kalau 0/null pakai hasil hitung tabel
    const finalTotal = Number(payment.totalBayar) || calculatedTotal;

    const totalColValueX = pageWidth - margin.right; 
    const totalColLabelX = totalColValueX - 50;

    doc.setFontSize(9);
    doc.setFont(fontName, 'bold');
    doc.text('Total Pembayaran:', totalColLabelX, currentY);
    doc.text(formatNumber(finalTotal), totalColValueX, currentY, { align: 'right' });

    return doc;
};

export const generateNotaPembayaranPDF = (payment, allocations) => 
    buildDoc(payment, allocations).output('datauristring');