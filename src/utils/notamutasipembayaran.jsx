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
    const pageHeight = doc.internal.pageSize.getHeight();
    let currentY = margin.top;

    // Font: Helvetica
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
    
    currentY += 5; 

    // --- 3. TABEL ITEM (payment_allocations) ---
    const head = [['No', 'No. Invoice', 'Keterangan', 'Jumlah Bayar']];
    let body = [];
    let calculatedTotal = 0;

    if (allocations && Array.isArray(allocations) && allocations.length > 0) {
        body = allocations.map((item, i) => {
            const amount = Number(item.amount || 0);
            calculatedTotal += amount;
            
            // Keterangan diambil dari header payment
            const noteToShow = payment.keterangan || '-';

            return [
                i + 1,
                item.invoiceId || '-', 
                noteToShow,                     
                formatNumber(amount)    
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
    
    // Fungsi Cek Halaman
    const checkPageOverflow = (y, increment = 10) => { 
        if (y + increment > pageHeight - margin.bottom) {
             doc.addPage();
             return margin.top + 5; 
        }
        return y;
    };

    currentY = checkPageOverflow(currentY, 20);

    // Prioritaskan totalBayar dari header, kalau 0/null pakai hasil hitung tabel
    const finalTotal = Number(payment.totalBayar) || calculatedTotal;

    const totalColValueX = pageWidth - margin.right; 
    const totalColLabelX = totalColValueX - 50;

    doc.setFontSize(9);
    doc.setFont(fontName, 'bold');
    doc.text('Total Pembayaran:', totalColLabelX, currentY);
    doc.text(formatNumber(finalTotal), totalColValueX, currentY, { align: 'right' });

    // --- 5. TANDA TANGAN ---
    let signY = currentY + 15;
    signY = checkPageOverflow(signY, 40);

    const leftSignX = margin.left + 25; 
    const rightSignX = pageWidth - margin.right - 25; 

    doc.setFontSize(9);
    doc.setFont(fontName, 'normal');

    // POSISI BARU
    doc.text("Hormat Kami,", leftSignX, signY, { align: 'center' });
    doc.text("Penerima,", rightSignX, signY, { align: 'center' });

    const nameY = signY + 25;
    doc.setFont(fontName, 'bold');

    // NAMA BARU
    doc.text("(________________)", leftSignX, nameY, { align: 'center' });
    doc.text(`( ${payment.namaCustomer || '....................'} )`, rightSignX, nameY, { align: 'center' });

    return doc;
};

export const generateNotaPembayaranPDF = (payment, allocations) => 
    buildDoc(payment, allocations).output('datauristring');