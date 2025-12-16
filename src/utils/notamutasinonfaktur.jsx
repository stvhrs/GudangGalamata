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
 * GENERATE PDF A4 PORTRAIT (NON-FAKTUR)
 * @param {Object} data - Data Record tunggal dari tabel non_faktur
 */
const buildDoc = (data) => {
    
    // 1. SETUP KERTAS (A4 PORTRAIT)
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4' 
    });

    const margin = { top: 10, right: 10, bottom: 5, left: 10 };
    const pageWidth = doc.internal.pageSize.getWidth();
    let currentY = margin.top;

    // Font: Helvetica
    const fontName = 'helvetica';

    // --- 1. HEADER ---
    doc.setFontSize(18); 
    doc.setFont(fontName, 'bold');
    doc.text(companyInfo.nama, margin.left, currentY);
    
    doc.setFontSize(11); 
    doc.text("NOTA NON-FAKTUR", pageWidth - margin.right, currentY, { align: 'right' });
    
    currentY += 2; 

    // Garis Header
    doc.setLineWidth(0.2); 
    doc.setDrawColor(0, 0, 0);
    doc.line(margin.left, currentY, pageWidth - margin.right, currentY);
    currentY += 8; 

    // --- 2. INFO TRANSAKSI ---
    const idDokumen = data.id || '-';
    // Sesuai JSON: namaCustomer
    const namaPelanggan = data.namaCustomer || 'Umum'; 
    const infoX = pageWidth / 2 + 10;
    
    doc.setFontSize(9.5); 
    
    // Kiri
    doc.setFont(fontName, 'bold'); doc.text('No. Transaksi:', margin.left, currentY);
    doc.setFont(fontName, 'normal'); doc.text(idDokumen, margin.left + 30, currentY);
    currentY += 5;
    
    // Kiri baris 2
    doc.setFont(fontName, 'bold'); doc.text('Customer:', margin.left, currentY);
    doc.setFont(fontName, 'normal'); doc.text(namaPelanggan, margin.left + 30, currentY);
    currentY += 5;

    // Kanan
    const rightY = currentY - 10;
    doc.setFont(fontName, 'bold'); doc.text('Tanggal:', infoX, rightY);
    doc.setFont(fontName, 'normal'); doc.text(formatDate(data.tanggal), infoX + 25, rightY);
    
    currentY += 5; 

    // --- 3. TABEL ITEM (Single Row) ---
    // Karena ini non-faktur, biasanya hanya 1 item global
    const head = [['No', 'Keterangan', 'Jumlah']];
    
    // Sesuai JSON: totalBayar
    const amount = Number(data.totalBayar || 0);
    const keterangan = data.keterangan || '-';

    const body = [
        ['1', keterangan, formatNumber(amount)]
    ];

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
            1: { }, // Auto width for Keterangan
            2: { halign: 'right', cellWidth: 40 } 
        },
        margin: { left: margin.left, right: margin.right },
    });

    // --- 4. SUMMARY FOOTER ---
    currentY = doc.lastAutoTable.finalY + 5;
    
    const totalColValueX = pageWidth - margin.right; 
    const totalColLabelX = totalColValueX - 50;

    doc.setFontSize(9);
    doc.setFont(fontName, 'bold');
    doc.text('Total:', totalColLabelX, currentY);
    doc.text(formatNumber(amount), totalColValueX, currentY, { align: 'right' });

    return doc;
};

export const generateNotaNonFakturPDF = (data) => 
    buildDoc(data).output('datauristring');