import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const companyInfo = {
    nama: "CV. GANGSAR MULIA UTAMA",
    // Alamat dihapus sesuai referensi
    hp: "0882-0069-05391"
};

const terms = [
    'Bukti pembayaran ini sah dan diterbitkan oleh sistem.',
    'Harap simpan bukti ini sebagai referensi transaksi yang valid.',
];

// --- HELPER ---
const formatNumber = (value) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0 }).format(value || 0);

const formatDate = (timestamp) => new Date(timestamp || 0).toLocaleDateString('id-ID', { 
    day: '2-digit', month: 'long', year: 'numeric', 
    hour: '2-digit', minute:'2-digit' 
});

const buildDoc = (data) => {
    const doc = new jsPDF('portrait', 'mm', 'a4'); 
    const margin = { top: 20, right: 20, bottom: 30, left: 20 };
    const pageWidth = doc.internal.pageSize.getWidth();
    let currentY = margin.top;

    // --- 1. HEADER (STRICT MATCH) ---
    doc.setFontSize(18); 
    doc.setFont('helvetica', 'bold');
    doc.text(companyInfo.nama, margin.left, currentY);
    
    doc.setFontSize(11); 
    doc.text("NOTA PEMBAYARAN", pageWidth - margin.right, currentY, { align: 'right' });
    
    currentY += 2; 

    doc.setLineWidth(0.2); 
    doc.setDrawColor(0, 0, 0);
    doc.line(margin.left, currentY, pageWidth - margin.right, currentY);
    currentY += 8; 

    // --- 2. INFO TRANSAKSI ---
    const idDokumen = data.id || '-';
    const namaPelanggan = data.namaPelanggan || 'Umum';

    const infoX = pageWidth / 2 + 10;
    
    doc.setFontSize(9.5); 
    
    // Kiri
    doc.setFont('helvetica', 'bold'); doc.text('No. Bayar:', margin.left, currentY);
    doc.setFont('helvetica', 'normal'); doc.text(idDokumen, margin.left + 30, currentY);
    currentY += 5;
    
    // Kiri baris 2
    doc.setFont('helvetica', 'bold'); doc.text('Pelanggan:', margin.left, currentY);
    doc.setFont('helvetica', 'normal'); doc.text(namaPelanggan, margin.left + 30, currentY);
    currentY += 5;

    // Kanan
    const rightY = currentY - 10;
    doc.setFont('helvetica', 'bold'); doc.text('Tanggal:', infoX, rightY);
    doc.setFont('helvetica', 'normal'); doc.text(formatDate(data.tanggal), infoX + 25, rightY);
    
    if (data.metodeBayar) {
        doc.setFont('helvetica', 'bold'); doc.text('Metode:', infoX, rightY + 5);
        doc.setFont('helvetica', 'normal'); doc.text(data.metodeBayar, infoX + 25, rightY + 5);
    }

    // Jarak diperkecil agar tabel naik (sesuai referensi)
    currentY += 2; 

    // --- 3. TABEL ITEM PEMBAYARAN ---
    const head = [['No', 'No. Invoice', 'Keterangan', 'Jumlah Bayar']];
    let body = [];
    let calculatedTotal = 0;

    if (data.listInvoices && Array.isArray(data.listInvoices) && data.listInvoices.length > 0) {
        body = data.listInvoices.map((inv, i) => {
            const amount = Number(inv.jumlahBayar || inv.amount || 0);
            calculatedTotal += amount;
            
            const noteToShow = inv.keterangan || data.keterangan || '-';

            return [
                i + 1,
                inv.noInvoice || inv.idInvoice || '-',      
                noteToShow,                                  
                formatNumber(amount)                       
            ];
        });
    } else {
        // Fallback jika tidak ada list detail
        const total = Number(data.totalBayar || data.jumlah || 0);
        calculatedTotal = total;
        const noteGlobal = data.keterangan || 'Pembayaran global';
        body = [['1', '-', noteGlobal, formatNumber(total)]];
    }

    // --- RENDER TABEL (STYLING KANTIP - COPY PASTE DARI REFERENSI) ---
    autoTable(doc, {
        startY: currentY,
        head: head,
        body: body,
        theme: 'grid',
        headStyles: {
            fillColor: [255, 255, 255], // Putih Mutlak
            textColor: [0, 0, 0],       // Hitam
            lineColor: [0, 0, 0],       // Garis Hitam
            lineWidth: 0.2,
            halign: 'center',
            fontSize: 9,
            fontStyle: 'bold',
            cellPadding: 1.5,
        },
        styles: {
            lineColor: [0, 0, 0],
            lineWidth: 0.2,
            fontSize: 9,
            cellPadding: 1.5,
            valign: 'middle'
        },
        columnStyles: { 
            0: { halign: 'center', cellWidth: 12 }, 
            1: { cellWidth: 50 }, 
            2: { }, // Auto width for Keterangan
            3: { halign: 'right', cellWidth: 40 } 
        },
        margin: { left: margin.left, right: margin.right },
    });

    // --- 4. SUMMARY FOOTER ---
    currentY = doc.lastAutoTable.finalY + 5;
    
    // Gunakan total yang dihitung atau dari root data
    const finalTotal = calculatedTotal || Number(data.totalBayar || 0);

    const totalColValueX = pageWidth - margin.right; 
    const totalColLabelX = totalColValueX - 50;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Total Pembayaran:', totalColLabelX, currentY);
    doc.text(formatNumber(finalTotal), totalColValueX, currentY, { align: 'right' });

    // --- 5. FOOTER KETERANGAN ---
    const footerY = doc.internal.pageSize.getHeight() - margin.bottom;
    
    // Logic footer sama persis referensi (opsional jika ada note tambahan)
    if (data.keterangan && (!data.listInvoices || data.listInvoices.length === 0)) {
       // Hanya render note di bawah jika tidak masuk tabel
    } else if (data.catatanBawah) {
        doc.setFontSize(8); doc.setFont('helvetica', 'italic');
        doc.text(`Catatan: ${data.catatanBawah}`, margin.left, footerY - 10);
    }
    
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(terms[0], margin.left, footerY);
    doc.text(terms[1], margin.left, footerY + 4);

    return doc;
};

export const generateNotaPembayaranPDF = (data) => buildDoc(data).output('datauristring');